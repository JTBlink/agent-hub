//! Authenticated loopback bridge for agents to operate the same pages as the UI.
use super::{
    super::error::AppError,
    browser::{Action, Browsers},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread::JoinHandle,
    time::Duration,
};

#[derive(Serialize, Deserialize)]
pub struct ControlEndpoint {
    pub url: String,
    pub token: String,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Request {
    List,
    Open { url: String, profile: String },
    Action { id: String, action: Action },
    Close { id: String },
    Reconnect { id: String },
    Reopen { id: String },
    Frame { id: String },
    Downloads,
    CancelDownload { profile: String, id: String },
    ForgetDownload { profile: String, id: String },
}
pub struct Automation {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    path: PathBuf,
    token: String,
}
impl Automation {
    pub fn start(browsers: Arc<Browsers>) -> Result<Self, AppError> {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
        listener.set_nonblocking(true)?;
        let token = uuid::Uuid::new_v4().to_string();
        let endpoint = ControlEndpoint {
            url: format!("http://127.0.0.1:{}", listener.local_addr()?.port()),
            token: token.clone(),
        };
        std::fs::create_dir_all(&browsers.root)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&browsers.root, std::fs::Permissions::from_mode(0o700))?;
        }
        let path = browsers.root.join("control.json");
        let mut file = tempfile::NamedTempFile::new_in(&browsers.root)?;
        file.write_all(&serde_json::to_vec(&endpoint).map_err(AppError::io)?)?;
        file.persist(&path)
            .map_err(|error| AppError::io(error.error))?;
        let stop = Arc::new(AtomicBool::new(false));
        let shutdown = stop.clone();
        let key = token.clone();
        let count = Arc::new(AtomicUsize::new(0));
        let thread = std::thread::spawn(move || {
            while !shutdown.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        if count.load(Ordering::Relaxed) >= 8 {
                            drop(stream);
                            continue;
                        }
                        count.fetch_add(1, Ordering::Relaxed);
                        let browsers = browsers.clone();
                        let key = key.clone();
                        let count = count.clone();
                        std::thread::spawn(move || {
                            let _ = serve(stream, &key, &browsers);
                            count.fetch_sub(1, Ordering::Relaxed);
                        });
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(20))
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            stop,
            thread: Some(thread),
            path,
            token,
        })
    }
}
impl Drop for Automation {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        if std::fs::read(&self.path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<ControlEndpoint>(&bytes).ok())
            .is_some_and(|value| value.token == self.token)
        {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}
fn response(stream: &mut TcpStream, status: u16, value: Value) -> std::io::Result<()> {
    let data = serde_json::to_vec(&value)?;
    write!(stream,"HTTP/1.1 {status} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n",if status==200{"OK"}else{"Error"},data.len())?;
    stream.write_all(&data)
}
fn serve(mut stream: TcpStream, token: &str, browsers: &Browsers) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    let mut bytes = Vec::new();
    let mut buffer = [0; 4096];
    let header_end = loop {
        if let Some(index) = bytes.windows(4).position(|item| item == b"\r\n\r\n") {
            break index + 4;
        }
        if bytes.len() > 8192 {
            return response(
                &mut stream,
                431,
                json!({"ok":false,"error":"Header exceeds limit"}),
            );
        }
        let size = stream.read(&mut buffer)?;
        if size == 0 {
            return Ok(());
        }
        bytes.extend_from_slice(&buffer[..size]);
    };
    let headers = String::from_utf8_lossy(&bytes[..header_end]);
    if headers.lines().next() != Some("POST / HTTP/1.1") {
        return response(
            &mut stream,
            405,
            json!({"ok":false,"error":"Only authenticated POST requests are supported"}),
        );
    }
    let authorization = headers.lines().find_map(|line| {
        line.split_once(':')
            .filter(|(name, _)| name.eq_ignore_ascii_case("authorization"))
            .map(|(_, value)| value.trim())
    });
    let expected = format!("Bearer {token}");
    let authenticated = authorization.is_some_and(|value| {
        value.len() == expected.len()
            && value
                .bytes()
                .zip(expected.bytes())
                .fold(0u8, |difference, (a, b)| difference | (a ^ b))
                == 0
    });
    if !authenticated {
        return response(&mut stream, 403, json!({"ok":false,"error":"Unauthorized"}));
    }
    let length = headers.lines().find_map(|line| {
        line.split_once(':')
            .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
            .and_then(|(_, value)| value.trim().parse::<usize>().ok())
    });
    let Some(length) = length.filter(|length| *length <= 2 * 1024 * 1024) else {
        return response(
            &mut stream,
            413,
            json!({"ok":false,"error":"Body exceeds limit or has no length"}),
        );
    };
    while bytes.len() < header_end + length {
        let size = stream.read(&mut buffer)?;
        if size == 0 {
            return Ok(());
        }
        bytes.extend_from_slice(&buffer[..size]);
    }
    let request = serde_json::from_slice::<Request>(&bytes[header_end..header_end + length]);
    let result = match request {
        Ok(Request::Downloads) => browsers
            .downloads()
            .and_then(|value| serde_json::to_value(value).map_err(AppError::io)),
        Ok(Request::CancelDownload { profile, id }) => {
            browsers.cancel_download(&profile, &id).map(|_| Value::Null)
        }
        Ok(Request::ForgetDownload { profile, id }) => {
            browsers.forget_download(&profile, &id).map(|_| Value::Null)
        }
        Ok(Request::List) => browsers
            .list()
            .and_then(|value| serde_json::to_value(value).map_err(AppError::io)),
        Ok(Request::Open { url, profile }) => browsers.create(&profile, &url).map(Value::String),
        Ok(Request::Action { id, action }) => browsers.action(&id, action),
        Ok(Request::Reopen { id }) => browsers.reopen(&id).map(|_| Value::Null),
        Ok(Request::Reconnect { id }) => browsers.reconnect(&id).map(|_| Value::Null),
        Ok(Request::Close { id }) => browsers.close(&id).map(|_| Value::Null),
        Ok(Request::Frame { id }) => browsers
            .frame(&id)
            .and_then(|value| serde_json::to_value(value).map_err(AppError::io)),
        Err(error) => Err(AppError::invalid_input(error.to_string())),
    };
    match result {
        Ok(value) => response(&mut stream, 200, json!({"ok":true,"value":value})),
        Err(error) => response(&mut stream, 400, json!({"ok":false,"error":error})),
    }
}

/// Public client boundary shared by the CLI and transport-level acceptance tests.
pub fn call(endpoint: &ControlEndpoint, body: Value) -> Result<Value, AppError> {
    let url = super::runtime::validate_endpoint(&endpoint.url)?;
    let response = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(AppError::network)?
        .post(url)
        .bearer_auth(&endpoint.token)
        .json(&body)
        .send()
        .map_err(AppError::network)?;
    let mut bytes = Vec::new();
    response
        .take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err(AppError::network("Preview response exceeds limit"));
    }
    let result: Value = serde_json::from_slice(&bytes).map_err(AppError::network)?;
    if result["ok"] != true {
        return Err(AppError::network(
            result["error"]["message"]
                .as_str()
                .or_else(|| result["error"].as_str())
                .unwrap_or("Preview request failed"),
        ));
    }
    Ok(result["value"].clone())
}
#[cfg(test)]
#[path = "automation/tests.rs"]
mod tests;
