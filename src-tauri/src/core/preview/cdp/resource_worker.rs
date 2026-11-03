//! An owned Fetch-only connection keeps hidden document tabs loading without UI polling.
use super::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
pub(super) struct ResourceWorker {
    stop: Arc<AtomicBool>,
    shutdown: TcpStream,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl ResourceWorker {
    pub fn healthy(&self) -> bool {
        !self.stop.load(Ordering::Acquire)
    }
    pub fn start(
        address: &str,
        documents: Arc<crate::core::preview::documents::Documents>,
    ) -> Result<Self, AppError> {
        let mut cdp = Cdp::connect(address)?;
        cdp.call("Fetch.enable", json!({"patterns":[{"urlPattern":"http://*.agent-hub.localhost:*/*","requestStage":"Request"}]}))?;
        cdp.set_timeout(Duration::from_millis(200))?;
        let shutdown = match cdp.socket.get_ref() {
            MaybeTlsStream::Plain(stream) => stream.try_clone()?,
            _ => {
                return Err(AppError::invalid_input(
                    "Resource control requires a loopback connection",
                ))
            }
        };
        let stop = Arc::new(AtomicBool::new(false));
        let closed = stop.clone();
        let thread = std::thread::Builder::new()
            .name("preview-document-resources".into())
            .spawn(move || {
                while !closed.load(Ordering::Acquire) {
                    let event = if let Some(event) = cdp.events.pop_front() {
                        event
                    } else {
                        match cdp.socket.read() {
                            Ok(Message::Text(text)) => match serde_json::from_str::<Value>(&text) {
                                Ok(event) => event,
                                Err(_) => break,
                            },
                            Ok(Message::Close(_)) => break,
                            Ok(_) => continue,
                            Err(tungstenite::Error::Io(error))
                                if matches!(
                                    error.kind(),
                                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                                ) =>
                            {
                                continue
                            }
                            Err(_) => break,
                        }
                    };
                    if event["method"] != "Fetch.requestPaused" {
                        continue;
                    }
                    let params = crate::core::preview::resource_bridge::fulfillment(
                        &documents,
                        &event["params"],
                    );
                    if closed.load(Ordering::Acquire) {
                        break;
                    }
                    cdp.sequence += 1;
                    let command =
                        json!({"id":cdp.sequence,"method":"Fetch.fulfillRequest","params":params});
                    if cdp.socket.send(Message::Text(command.to_string())).is_err() {
                        break;
                    }
                }
                closed.store(true, Ordering::Release);
            })
            .map_err(AppError::io)?;
        Ok(Self {
            stop,
            shutdown,
            thread: Some(thread),
        })
    }
}
impl Drop for ResourceWorker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = self.shutdown.shutdown(std::net::Shutdown::Both);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests;
