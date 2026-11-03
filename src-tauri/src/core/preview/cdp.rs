//! Bounded CDP requests on an application-owned browser transport.
mod frame_worker;
mod resource_worker;
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
    resources: Option<resource_worker::ResourceWorker>,
    frames: Option<frame_worker::FrameWorker>,
    source_version: u64,
    socket: WebSocket<MaybeTlsStream<TcpStream>>,
    sequence: u64,
    main_frame: Option<String>,
    pub navigation_version: u64,
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
            resources: None,
            frames: None,
            source_version: 0,
            sequence: 0,
            main_frame: None,
            navigation_version: 0,
            frame: None,
            frame_version: 0,
            expected_size: None,
            events: VecDeque::new(),
            chooser: None,
            dialog: None,
        })
    }
    pub(super) fn enable_frames(&mut self, address: &str) -> Result<(), AppError> {
        self.frames = Some(frame_worker::FrameWorker::start(address)?);
        Ok(())
    }
    pub(super) fn sync_frame(&mut self) -> Result<(), AppError> {
        if let Some(worker) = &self.frames {
            if let Some(frame) = worker.latest()? {
                if frame.version != self.source_version
                    && self.expected_size.map_or(true, |size| size == frame.size)
                {
                    self.source_version = frame.version;
                    self.frame = Some(frame.image.to_string());
                    self.frame_version = self.frame_version.wrapping_add(1);
                }
            }
        }
        Ok(())
    }
    pub(super) fn enable_resources(
        &mut self,
        address: &str,
        documents: std::sync::Arc<super::documents::Documents>,
    ) -> Result<(), AppError> {
        self.resources = Some(resource_worker::ResourceWorker::start(address, documents)?);
        Ok(())
    }
    #[cfg(test)]
    pub(super) fn request_count(&self) -> u64 {
        self.sequence
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
        self.send_call(method, params, None)
    }
    pub(super) fn call_in_session(
        &mut self,
        session: &str,
        method: &str,
        params: Value,
    ) -> Result<Value, AppError> {
        self.send_call(method, params, Some(session))
    }
    fn send_call(
        &mut self,
        method: &str,
        params: Value,
        session: Option<&str>,
    ) -> Result<Value, AppError> {
        if self
            .resources
            .as_ref()
            .is_some_and(|worker| !worker.healthy())
        {
            return Err(AppError::network(
                "Document resource connection lost; reconnect the page",
            ));
        }
        self.sequence += 1;
        let id = self.sequence;
        let mut command = json!({ "id": id, "method": method, "params": params });
        if let Some(session) = session {
            command["sessionId"] = json!(session);
        }
        self.socket
            .send(Message::Text(command.to_string()))
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
                        if method == "Page.getFrameTree" && session.is_none() {
                            self.main_frame = reply["result"]["frameTree"]["frame"]["id"]
                                .as_str()
                                .map(str::to_owned);
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
                            self.main_frame =
                                reply["params"]["frame"]["id"].as_str().map(str::to_owned);
                            self.navigation_version = self.navigation_version.wrapping_add(1);
                            self.chooser = None
                        }
                        Some("Page.navigatedWithinDocument")
                            if reply["params"]["frameId"].as_str()
                                == self.main_frame.as_deref() =>
                        {
                            self.navigation_version = self.navigation_version.wrapping_add(1);
                            self.chooser = None;
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
                            if reply["method"] == "Fetch.requestPaused"
                                || self
                                    .events
                                    .iter()
                                    .any(|event| event["method"] == "Fetch.requestPaused")
                            {
                                return Err(AppError::network("Too many paused resource requests during startup; reconnect the page"));
                            }
                            self.events.pop_front();
                        }
                        let event = if reply["method"] == "Fetch.requestPaused" {
                            // Startup can receive a paused request before the enable reply.
                            // Retain its identity even when postData/headers exceed the event cap.
                            json!({"method":"Fetch.requestPaused","params":{
                                "requestId":reply["params"]["requestId"],
                                "request":{"url":reply["params"]["request"]["url"].as_str().filter(|url|url.len()<=8192).unwrap_or(""),
                                "method":reply["params"]["request"]["method"]}
                            }})
                        } else if reply.to_string().len() > 16384 {
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
