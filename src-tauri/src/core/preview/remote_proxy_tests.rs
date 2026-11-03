//! Native proxy acceptance: requests must reach the configured execution-host proxy.
use super::{
    browser::{Action, Browsers},
    runtime::BrowserProfile,
};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
struct Proxy {
    url: String,
    stop: Arc<AtomicBool>,
    requests: Arc<Mutex<Vec<String>>>,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl Proxy {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        let stop = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let shutdown = stop.clone();
        let recorded = requests.clone();
        let worker = std::thread::spawn(move || {
            while !shutdown.load(Ordering::Acquire) {
                let (mut stream, _) = match listener.accept() {
                    Ok(value) => value,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                    Err(_) => break,
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                stream
                    .set_write_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut peek = [0u8; 8192];
                let mut header = String::new();
                let deadline = Instant::now() + Duration::from_secs(2);
                while Instant::now() < deadline {
                    match stream.peek(&mut peek) {
                        Ok(0) | Err(_) => break,
                        Ok(count) => {
                            header = String::from_utf8_lossy(&peek[..count]).into();
                            if header.contains("\r\n\r\n") {
                                break;
                            }
                        }
                    }
                    std::thread::sleep(Duration::from_millis(5));
                }
                let first = header.lines().next().unwrap_or_default().to_owned();
                if first.is_empty() {
                    continue;
                }
                recorded.lock().unwrap().push(first.clone());
                let tunnel = first.starts_with("CONNECT ");
                if tunnel && !first.contains("unresolvable.example.invalid:80") {
                    let _ = stream.write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    continue;
                }
                if tunnel {
                    let mut discard = vec![0u8; header.len()];
                    let _ = stream.read_exact(&mut discard);
                    let _ = stream.write_all(b"HTTP/1.1 200 Connection established\r\n\r\n");
                }
                if tunnel || header.to_ascii_lowercase().contains("upgrade: websocket") {
                    if let Ok(mut socket) = tungstenite::accept(stream) {
                        let _ = socket.send(tungstenite::Message::Text("proxy websocket".into()));
                        let _ = socket.close(None);
                    }
                } else {
                    let mut discard = vec![0u8; header.len()];
                    let _ = stream.read_exact(&mut discard);
                    let body = "<!doctype html><title>Proxy served</title><p>proxy response</p>";
                    let _ = write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
                }
            }
        });
        Self {
            url,
            stop,
            requests,
            worker: Some(worker),
        }
    }
}
impl Drop for Proxy {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
#[test]
#[ignore = "requires installed Chromium; uses isolated browser and a fixture HTTP/WebSocket proxy"]
fn remote_context_routes_http_websocket_and_loopback_through_its_proxy_after_recovery() {
    let proxy = Proxy::start();
    let root = tempfile::tempdir().unwrap();
    let host = Browsers::new(root.path().join("host"));
    host.create("default", "about:blank").unwrap();
    let endpoint = host.runtime_handles().unwrap()["default"]
        .lock()
        .unwrap()
        .endpoint
        .clone();
    let client = Browsers::new(root.path().join("client"));
    client
        .save_profile(BrowserProfile {
            id: "remote".into(),
            name: "Remote".into(),
            endpoint: Some(endpoint),
            proxy: Some(proxy.url.clone()),
            ..Default::default()
        })
        .unwrap();
    let page = client
        .create("remote", "http://unresolvable.example.invalid/page")
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while client
        .action(
            &page,
            Action::Evaluate {
                expression: "document.title".into(),
            },
        )
        .unwrap()
        != "Proxy served"
    {
        assert!(
            Instant::now() < deadline,
            "page was not loaded through the proxy"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
    let socket=client.action(&page,Action::Evaluate { expression:"new Promise(resolve=>{const ws=new WebSocket('ws://unresolvable.example.invalid/socket');ws.onmessage=e=>{resolve(e.data);ws.close()};ws.onerror=()=>resolve('failed');setTimeout(()=>resolve('timeout'),4000)})".into() }).unwrap();
    assert_eq!(
        socket,
        "proxy websocket",
        "requests: {:?}",
        proxy.requests.lock().unwrap()
    );
    let loopback=client.action(&page,Action::Evaluate { expression:"fetch('http://127.0.0.1:54321/loopback').then(r=>r.text()).then(t=>t.includes('proxy response')).catch(()=>false)".into() }).unwrap();
    assert_eq!(loopback, true);
    // Discard the original context. The next page must recreate it with the same proxy.
    {
        let runtime = client.runtime_handles().unwrap()["remote"].clone();
        let mut runtime = runtime.lock().unwrap();
        let context = runtime.context.clone().unwrap();
        runtime
            .cdp
            .call(
                "Target.disposeBrowserContext",
                serde_json::json!({"browserContextId":context}),
            )
            .unwrap();
    }
    client
        .create("remote", "http://unresolvable.example.invalid/recovered")
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if proxy
            .requests
            .lock()
            .unwrap()
            .iter()
            .any(|line| line.contains("/recovered"))
        {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "recovered context lost its proxy"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
    let requests = proxy.requests.lock().unwrap().clone();
    assert!(requests
        .iter()
        .any(|line| line.contains("unresolvable.example.invalid/page")));
    assert!(requests
        .iter()
        .any(|line| line.contains("CONNECT unresolvable.example.invalid:80")));
    assert!(requests
        .iter()
        .any(|line| line.contains("127.0.0.1:54321/loopback")));
    client.clear();
    host.clear();
}
