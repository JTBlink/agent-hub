//! Loopback-only, capability-scoped static resources for selected documents.
use super::{super::error::AppError, documents::Documents};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread::JoinHandle,
    time::Duration,
};

pub struct Assets {
    pub origin: String,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}
impl Assets {
    pub fn start(documents: Arc<Documents>) -> Result<Self, AppError> {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
        listener.set_nonblocking(true)?;
        let origin = format!("http://127.0.0.1:{}", listener.local_addr()?.port());
        let stop = Arc::new(AtomicBool::new(false));
        let shutdown = stop.clone();
        let active = Arc::new(AtomicUsize::new(0));
        let thread = std::thread::spawn(move || {
            while !shutdown.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        if active.load(Ordering::Relaxed) >= 16 {
                            drop(stream);
                            continue;
                        }
                        active.fetch_add(1, Ordering::Relaxed);
                        let active = active.clone();
                        let documents = documents.clone();
                        std::thread::spawn(move || {
                            let _ = serve(stream, &documents);
                            active.fetch_sub(1, Ordering::Relaxed);
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
            origin,
            stop,
            thread: Some(thread),
        })
    }
    pub fn document_url(&self, id: &str, relative: &str) -> String {
        let path = super::documents::resource_path(relative);
        format!("{}/{}/{}", self.origin, id, path)
    }
    pub fn browser_document_url(&self, id: &str, relative: &str) -> String {
        let port = self.origin.rsplit(':').next().unwrap_or_default();
        let path = super::documents::resource_path(relative);
        format!("http://{id}.agent-hub.localhost:{port}/{path}")
    }
}
impl Drop for Assets {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
fn serve(mut stream: TcpStream, documents: &Documents) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(3)))?;
    let mut request = Vec::new();
    let mut bytes = [0u8; 1024];
    while request.len() < 8192 && !request.windows(4).any(|part| part == b"\r\n\r\n") {
        let count = stream.read(&mut bytes)?;
        if count == 0 {
            break;
        }
        request.extend_from_slice(&bytes[..count]);
    }
    let text = String::from_utf8_lossy(&request);
    let mut parts = text.lines().next().unwrap_or_default().split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or_default();
    if !matches!(method, "GET" | "HEAD") {
        return respond(&mut stream, 405, "text/plain", b"Method not allowed", false);
    }
    let host = text
        .lines()
        .find_map(|line| {
            line.split_once(':')
                .filter(|(name, _)| name.eq_ignore_ascii_case("host"))
                .map(|(_, value)| value.trim().split(':').next().unwrap_or_default())
        })
        .unwrap_or_default();
    let path = raw_path
        .split('?')
        .next()
        .unwrap_or_default()
        .trim_start_matches('/');
    let from_host = host
        .strip_suffix(".agent-hub.localhost")
        .filter(|id| uuid::Uuid::parse_str(id).is_ok());
    let (id, raw_relative) = if let Some(id) = from_host {
        (id, path)
    } else {
        let Some(parts) = path.split_once('/') else {
            return respond(&mut stream, 404, "text/plain", b"Not found", false);
        };
        parts
    };
    let response = super::resource_bridge::load(documents, id, raw_relative, method);
    respond(
        &mut stream,
        response.code,
        response.mime,
        &response.content,
        method == "HEAD",
    )
}
pub(super) fn mime(path: &std::path::Path) -> &'static str {
    let extension = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    match extension.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "pdf" => "application/pdf",
        "csv" => "text/csv",
        "avif" => "image/avif",
        "zip" => "application/zip",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "md" | "markdown" | "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn respond(
    stream: &mut TcpStream,
    code: u16,
    mime: &str,
    content: &[u8],
    head: bool,
) -> std::io::Result<()> {
    write!(stream, "HTTP/1.1 {code} {}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nAccess-Control-Allow-Origin: *\r\n\r\n", if code == 200 { "OK" } else { "Error" }, content.len())?;
    if !head {
        stream.write_all(content)?;
    }
    Ok(())
}
