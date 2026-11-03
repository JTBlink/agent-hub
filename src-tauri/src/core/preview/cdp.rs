//! Bounded CDP requests on an application-owned browser transport.
use super::super::error::AppError;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    net::TcpStream,
    time::{Duration, Instant},
};
use tungstenite::{stream::MaybeTlsStream, Message, WebSocket};

pub struct Cdp {
    socket: WebSocket<MaybeTlsStream<TcpStream>>,
    sequence: u64,
    pub frame: Option<String>,
    pub frame_version: u64,
    pub expected_size: Option<(u32, u32)>,
    pub events: VecDeque<Value>,
    pub chooser: Option<Value>,
    pub dialog: Option<Value>,
}
impl Cdp {
    pub fn connect(address: &str) -> Result<Self, AppError> {
        let url = reqwest::Url::parse(address).map_err(AppError::network)?;
        if url.scheme() != "ws"
            || !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
        {
            return Err(AppError::invalid_input(
                "Browser control requires a loopback connection or an SSH tunnel",
            ));
        }
        let (mut socket, _) = tungstenite::connect(address).map_err(AppError::network)?;
        socket.set_config(|config| config.max_message_size = Some(32 * 1024 * 1024));
        if let MaybeTlsStream::Plain(stream) = socket.get_ref() {
            stream.set_read_timeout(Some(Duration::from_secs(12)))?;
            stream.set_write_timeout(Some(Duration::from_secs(5)))?;
        }
        Ok(Self {
            socket,
            sequence: 0,
            frame: None,
            frame_version: 0,
            expected_size: None,
            events: VecDeque::new(),
            chooser: None,
            dialog: None,
        })
    }
    #[cfg(test)]
    pub fn close(&mut self) {
        if let MaybeTlsStream::Plain(stream) = self.socket.get_ref() {
            let _ = stream.shutdown(std::net::Shutdown::Both);
        }
    }
    pub fn set_timeout(&mut self, timeout: Duration) -> Result<(), AppError> {
        if let MaybeTlsStream::Plain(stream) = self.socket.get_ref() {
            stream.set_read_timeout(Some(timeout))?;
        }
        Ok(())
    }
    pub fn call(&mut self, method: &str, params: Value) -> Result<Value, AppError> {
        self.sequence += 1;
        let id = self.sequence;
        self.socket
            .send(Message::Text(
                json!({ "id": id, "method": method, "params": params }).to_string(),
            ))
            .map_err(AppError::network)?;
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(15) {
            match self.socket.read().map_err(AppError::network)? {
                Message::Text(text) => {
                    let reply: Value = serde_json::from_str(&text).map_err(AppError::network)?;
                    if reply["id"].as_u64() == Some(id) {
                        if let Some(error) = reply.get("error") {
                            return Err(AppError::network(
                                error["message"]
                                    .as_str()
                                    .unwrap_or("Browser command failed"),
                            ));
                        }
                        return Ok(reply["result"].clone());
                    }
                    if reply["method"] == "Page.screencastFrame" {
                        if let Some(data) = reply["params"]["data"]
                            .as_str()
                            .filter(|data| data.len() <= 8 * 1024 * 1024)
                        {
                            let metadata = &reply["params"]["metadata"];
                            if self.expected_size.map_or(true, |(width, height)| {
                                metadata["deviceWidth"].as_f64() == Some(f64::from(width))
                                    && metadata["deviceHeight"].as_f64() == Some(f64::from(height))
                                    && STANDARD.decode(data).ok().and_then(|bytes| {
                                        image::ImageReader::with_format(
                                            std::io::Cursor::new(bytes),
                                            image::ImageFormat::Jpeg,
                                        )
                                        .into_dimensions()
                                        .ok()
                                    }) == Some((width, height))
                            }) {
                                self.frame = Some(data.to_owned());
                                self.frame_version += 1;
                            }
                        }
                        if let Some(session) = reply["params"]["sessionId"].as_u64() {
                            self.sequence += 1;
                            self.socket.send(Message::Text(json!({"id":self.sequence,"method":"Page.screencastFrameAck","params":{"sessionId":session}}).to_string())).map_err(AppError::network)?;
                        }
                        continue;
                    }
                    match reply["method"].as_str() {
                        Some("Page.fileChooserOpened") => {
                            let mut params = reply["params"].clone();
                            params["token"] = json!(uuid::Uuid::new_v4().to_string());
                            self.chooser = Some(params);
                        }
                        Some("Page.javascriptDialogOpening") => {
                            self.dialog = Some(
                                json!({"type":reply["params"]["type"], "message":reply["params"]["message"].as_str().unwrap_or("").chars().take(2000).collect::<String>(),"defaultPrompt":reply["params"]["defaultPrompt"].as_str().unwrap_or("").chars().take(1000).collect::<String>()}),
                            );
                        }
                        Some("Page.javascriptDialogClosed") => self.dialog = None,
                        Some("Page.frameNavigated")
                            if reply["params"]["frame"].get("parentId").is_none() =>
                        {
                            self.chooser = None
                        }
                        _ => {}
                    }
                    if reply["method"] == "Page.javascriptDialogOpening"
                        && method != "Page.handleJavaScriptDialog"
                    {
                        return Err(AppError::cancelled(
                            "Handle the page dialog before continuing",
                        ));
                    }
                    if reply.get("method").is_some() {
                        if self.events.len() >= 200 {
                            self.events.pop_front();
                        }
                        let event = if reply.to_string().len() > 16384 {
                            json!({"method": reply["method"], "params":{"truncated":true}})
                        } else {
                            reply
                        };
                        self.events.push_back(event);
                    }
                }
                Message::Close(_) => return Err(AppError::network("Browser connection closed")),
                _ => {}
            }
        }
        Err(AppError::network(
            "Browser request timed out; inspect the page before retrying",
        ))
    }
    pub fn evaluate(&mut self, expression: &str) -> Result<Value, AppError> {
        if expression.len() > 64 * 1024 {
            return Err(AppError::invalid_input(
                "Browser expression exceeds the limit",
            ));
        }
        let result = self.call("Runtime.evaluate", json!({ "expression": expression, "returnByValue": true, "awaitPromise": true, "timeout": 8000 }))?;
        if result.get("exceptionDetails").is_some() {
            let message = result["exceptionDetails"]["exception"]["description"]
                .as_str()
                .unwrap_or("Page script failed")
                .chars()
                .take(1500)
                .collect::<String>();
            return Err(AppError::invalid_input(message));
        }
        Ok(result["result"]["value"].clone())
    }
}
