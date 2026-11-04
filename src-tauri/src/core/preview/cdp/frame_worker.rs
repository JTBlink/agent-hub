//! One owned frame connection per page; commands never wait behind frame production.
use super::super::rendering::{stream_params, MAX_FRAME_BYTES, MAX_FRAME_HEIGHT, MAX_FRAME_WIDTH};
use super::*;
use sha2::{Digest, Sha256};
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
    pending_metrics: Option<(Value, std::sync::mpsc::Sender<Result<(), String>>)>,
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
        cdp.call("Page.startScreencast", stream_params())?;
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
            let mut still_captured = false;
            let mut motion_fingerprint: Option<[u8; 32]> = None;
            while !stopped.load(Ordering::Acquire) {
                if demand.swap(false, Ordering::AcqRel) { last_interest = Instant::now(); }
                let metrics = shared.lock().ok().and_then(|mut state| state.pending_metrics.take());
                if let Some((metrics, applied)) = metrics {
                    let configured = cdp.set_timeout(Duration::from_secs(2)).and_then(|()| cdp.call("Emulation.setDeviceMetricsOverride", metrics));
                    let restored = cdp.set_timeout(Duration::from_millis(100));
                    let result = configured.map(|_| ()).and(restored);
                    let _ = applied.send(result.as_ref().map(|_| ()).map_err(|error| error.message.clone()));
                    if result.is_err() { break; }
                    motion_fingerprint = None;
                    still_captured = false;
                    last_frame = Instant::now();
                }
                let should_stream = last_interest.elapsed() < idle;
                if should_stream != streaming {
                    let (method, params) = if should_stream { ("Page.startScreencast", stream_params()) } else { ("Page.stopScreencast", json!({})) };
                    cdp.sequence += 1;
                    if cdp.socket.send(Message::Text(json!({"id":cdp.sequence,"method":method,"params":params}).to_string())).is_err() { break; }
                    streaming = should_stream;
                    still_captured = false;
                    motion_fingerprint = None;
                    last_frame = Instant::now();
                }
                if streaming && motion_fingerprint.is_some() && !still_captured && last_frame.elapsed() >= Duration::from_millis(250) {
                    // Capture at most once per stable image on this independent connection.
                    if let Ok((image, size)) = capture_still(&mut cdp) {
                        publish_frame(&shared, image, size);
                    }
                    still_captured = true;
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
                    let image: Arc<str> = image.into();
                    let fingerprint: [u8; 32] = Sha256::digest(image.as_bytes()).into();
                    if motion_fingerprint != Some(fingerprint) {
                        // Delay ACK at the producer instead of building an unbounded UI queue.
                        let remaining = Duration::from_millis(33).saturating_sub(last_frame.elapsed());
                        if !remaining.is_zero() { std::thread::sleep(remaining); }
                        if stopped.load(Ordering::Acquire) { break; }
                        publish_frame(&shared, image.clone(), size);
                        motion_fingerprint = Some(fingerprint);
                        last_frame = Instant::now();
                        still_captured = false;
                    }
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
    pub fn set_metrics(&self, metrics: Value) -> Result<(), AppError> {
        let (applied, result) = std::sync::mpsc::channel();
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser frame state unavailable"))?;
            if let Some((_, previous)) = state.pending_metrics.replace((metrics, applied)) {
                let _ = previous.send(Err("Viewport configuration superseded".into()));
            }
        }
        result
            .recv_timeout(Duration::from_secs(3))
            .map_err(|_| AppError::network("Browser viewport configuration timed out"))?
            .map_err(AppError::network)
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
fn publish_frame(state: &Mutex<State>, image: Arc<str>, size: (u32, u32)) {
    if let Ok(mut state) = state.lock() {
        let version = state
            .latest
            .as_ref()
            .map_or(1, |frame| frame.version.wrapping_add(1));
        state.latest = Some(LatestFrame {
            version,
            image,
            size,
        });
    }
}

fn capture_still(cdp: &mut Cdp) -> Result<(Arc<str>, (u32, u32)), AppError> {
    // Encoding a high density PNG may outlast the short idle socket poll.
    cdp.set_timeout(Duration::from_secs(2))?;
    let result = (|| {
        let metrics = cdp.call("Page.getLayoutMetrics", json!({}))?;
        let viewport = &metrics["cssVisualViewport"];
        let clip = json!({"x":viewport["pageX"],"y":viewport["pageY"],"width":viewport["clientWidth"],"height":viewport["clientHeight"],"scale":viewport["scale"].as_f64().unwrap_or(1.)});
        cdp.call(
            "Page.captureScreenshot",
            json!({"format":"png","captureBeyondViewport":false,"clip":clip}),
        )
    })();
    cdp.set_timeout(Duration::from_millis(100))?;
    let result = result?;
    let data = result["data"]
        .as_str()
        .ok_or_else(|| AppError::network("Browser still frame unavailable"))?;
    let size = decode_image(data)
        .ok_or_else(|| AppError::network("Browser still frame is outside the supported bounds"))?;
    Ok((Arc::from(data), size))
}

fn decode_frame(event: &Value) -> Option<(String, (u32, u32))> {
    let data = event["params"]["data"].as_str()?;
    let size = decode_image(data)?;
    Some((data.to_owned(), size))
}
fn decode_image(data: &str) -> Option<(u32, u32)> {
    if data.len() > MAX_FRAME_BYTES {
        return None;
    }
    let bytes = STANDARD.decode(data).ok()?;
    let reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    if !matches!(
        reader.format(),
        Some(image::ImageFormat::Png | image::ImageFormat::Jpeg)
    ) {
        return None;
    }
    let size = reader.into_dimensions().ok()?;
    if size.0 == 0 || size.1 == 0 || size.0 > MAX_FRAME_WIDTH || size.1 > MAX_FRAME_HEIGHT {
        return None;
    }
    Some(size)
}

#[cfg(test)]
mod tests;
