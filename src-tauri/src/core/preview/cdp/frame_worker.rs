//! One owned frame connection per page; commands never wait behind frame production.
use super::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

#[derive(Clone)]
pub(super) struct LatestFrame {
    pub version: u64,
    pub image: Arc<str>,
    pub size: (u32, u32),
}
#[derive(Default)]
struct State {
    latest: Option<LatestFrame>,
    error: Option<String>,
}
pub(super) struct FrameWorker {
    state: Arc<Mutex<State>>,
    stop: Arc<AtomicBool>,
    interested: Arc<AtomicBool>,
    shutdown: TcpStream,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl FrameWorker {
    pub fn start(address: &str) -> Result<Self, AppError> {
        Self::start_with_idle(address, Duration::from_secs(2))
    }
    fn start_with_idle(address: &str, idle: Duration) -> Result<Self, AppError> {
        let mut cdp = Cdp::connect(address)?;
        cdp.call("Page.enable", json!({}))?;
        cdp.call("Page.startScreencast", json!({"format":"jpeg","quality":80,"maxWidth":3840,"maxHeight":2160,"everyNthFrame":1}))?;
        cdp.set_timeout(Duration::from_millis(100))?;
        let shutdown = match cdp.socket.get_ref() {
            MaybeTlsStream::Plain(stream) => stream.try_clone()?,
            _ => {
                return Err(AppError::invalid_input(
                    "Frame transport requires a loopback connection",
                ))
            }
        };
        let state = Arc::new(Mutex::new(State::default()));
        let shared = state.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let interested = Arc::new(AtomicBool::new(false));
        let demand = interested.clone();
        let thread = std::thread::Builder::new().name("preview-page-frames".into()).spawn(move || {
            let mut last_frame = Instant::now() - Duration::from_secs(1);
            let mut last_interest = Instant::now();
            let mut streaming = true;
            while !stopped.load(Ordering::Acquire) {
                if demand.swap(false, Ordering::AcqRel) { last_interest = Instant::now(); }
                let should_stream = last_interest.elapsed() < idle;
                if should_stream != streaming {
                    let (method, params) = if should_stream { ("Page.startScreencast", json!({"format":"jpeg","quality":80,"maxWidth":3840,"maxHeight":2160,"everyNthFrame":1})) } else { ("Page.stopScreencast", json!({})) };
                    cdp.sequence += 1;
                    if cdp.socket.send(Message::Text(json!({"id":cdp.sequence,"method":method,"params":params}).to_string())).is_err() { break; }
                    streaming = should_stream;
                }
                let message = match cdp.socket.read() {
                    Ok(Message::Text(text)) => text,
                    Ok(Message::Close(_)) => break,
                    Ok(_) => continue,
                    Err(tungstenite::Error::Io(error)) if matches!(error.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => continue,
                    Err(_) => break,
                };
                let Ok(event) = serde_json::from_str::<Value>(&message) else { break; };
                if event["method"] != "Page.screencastFrame" { continue; }
                if let Some((image, size)) = decode_frame(&event) {
                    // Delay ACK at the producer, rather than building an unbounded UI queue.
                    let remaining = Duration::from_millis(33).saturating_sub(last_frame.elapsed());
                    if !remaining.is_zero() { std::thread::sleep(remaining); }
                    if stopped.load(Ordering::Acquire) { break; }
                    if let Ok(mut state) = shared.lock() {
                        let version = state.latest.as_ref().map_or(1, |frame| frame.version.wrapping_add(1));
                        state.latest = Some(LatestFrame { version, image: image.into(), size });
                    }
                    last_frame = Instant::now();
                }
                if let Some(session) = event["params"]["sessionId"].as_u64() {
                    cdp.sequence += 1;
                    if cdp.socket.send(Message::Text(json!({"id":cdp.sequence,"method":"Page.screencastFrameAck","params":{"sessionId":session}}).to_string())).is_err() { break; }
                }
            }
            if !stopped.load(Ordering::Acquire) {
                if let Ok(mut state) = shared.lock() { state.error = Some("Browser frame connection lost; reconnect the page".into()); }
            }
        }).map_err(AppError::io)?;
        Ok(Self {
            state,
            stop,
            interested,
            shutdown,
            thread: Some(thread),
        })
    }
    pub fn latest(&self) -> Result<Option<LatestFrame>, AppError> {
        self.interested.store(true, Ordering::Release);
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser frame state unavailable"))?;
        if let Some(error) = &state.error {
            return Err(AppError::network(error));
        }
        Ok(state.latest.clone())
    }
}
impl Drop for FrameWorker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = self.shutdown.shutdown(std::net::Shutdown::Both);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
fn decode_frame(event: &Value) -> Option<(String, (u32, u32))> {
    let data = event["params"]["data"]
        .as_str()
        .filter(|data| data.len() <= 8 * 1024 * 1024)?;
    let bytes = STANDARD.decode(data).ok()?;
    let size =
        image::ImageReader::with_format(std::io::Cursor::new(bytes), image::ImageFormat::Jpeg)
            .into_dimensions()
            .ok()?;
    if size.0 == 0 || size.1 == 0 || u64::from(size.0) * u64::from(size.1) > 3840 * 2160 {
        return None;
    }
    Some((data.to_owned(), size))
}

#[cfg(test)]
mod tests;
