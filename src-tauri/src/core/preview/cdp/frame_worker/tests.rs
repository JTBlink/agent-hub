use super::*;
use std::net::TcpListener;

#[test]
fn receives_and_acknowledges_frames_without_ui_or_control_requests_and_releases_socket() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!(
        "ws://127.0.0.1:{}/page",
        listener.local_addr().unwrap().port()
    );
    let data: Vec<_> = (1..=3)
        .map(|n| {
            let mut jpeg = Vec::new();
            image::codecs::jpeg::JpegEncoder::new(&mut jpeg)
                .encode(&[n * 40; 12], 2, 2, image::ExtendedColorType::Rgb8)
                .unwrap();
            STANDARD.encode(jpeg)
        })
        .collect();
    let (acked, received) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut socket = tungstenite::accept(stream).unwrap();
        for method in ["Page.enable", "Page.startScreencast"] {
            let command: Value =
                serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
            assert_eq!(command["method"], method);
            if method == "Page.startScreencast" {
                assert_eq!(command["params"]["format"], "jpeg");
            }
            socket
                .send(Message::Text(
                    json!({"id":command["id"],"result":{}}).to_string(),
                ))
                .unwrap();
        }
        for session in 1..=3 {
            socket.send(Message::Text(json!({"method":"Page.screencastFrame","params":{"sessionId":session,"data":data[(session-1) as usize]}}).to_string())).unwrap();
            let ack: Value =
                serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
            assert_eq!(ack["method"], "Page.screencastFrameAck");
            assert_eq!(ack["params"]["sessionId"], session);
        }
        acked.send(()).unwrap();
        assert!(
            socket.read().is_err(),
            "Dropping the frame worker must close its own socket"
        );
    });
    let worker = FrameWorker::start(&address).unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if worker
            .latest()
            .unwrap()
            .is_some_and(|frame| frame.version == 3)
        {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "Frames must advance without another command"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(worker.latest().unwrap().unwrap().size, (2, 2));
    received.recv_timeout(Duration::from_secs(3)).unwrap();
    drop(worker);
    server.join().unwrap();
}
#[test]
fn rejects_malformed_or_oversized_frame_payloads() {
    for data in [
        "not base64".to_owned(),
        STANDARD.encode(b"not a png"),
        "a".repeat(MAX_FRAME_BYTES + 1),
    ] {
        assert!(decode_frame(&json!({"params":{"data":data}})).is_none());
    }
}

#[test]
fn pauses_without_consumers_and_resumes_on_the_next_frame_request() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!(
        "ws://127.0.0.1:{}/page",
        listener.local_addr().unwrap().port()
    );
    let (paused, received) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut socket = tungstenite::accept(stream).unwrap();
        for method in [
            "Page.enable",
            "Page.startScreencast",
            "Page.stopScreencast",
            "Page.startScreencast",
        ] {
            let command: Value =
                serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
            assert_eq!(command["method"], method);
            if method == "Page.startScreencast" {
                assert_eq!(command["params"]["format"], "jpeg");
            }
            socket
                .send(Message::Text(
                    json!({"id":command["id"], "result":{}}).to_string(),
                ))
                .unwrap();
            if method == "Page.stopScreencast" {
                paused.send(()).unwrap();
            }
        }
    });
    let worker = FrameWorker::start_with_idle(&address, Duration::from_millis(50)).unwrap();
    received.recv_timeout(Duration::from_secs(3)).unwrap();
    worker.latest().unwrap();
    server.join().unwrap();
    drop(worker);
}

#[test]
fn settles_to_png_and_resumes_jpeg_on_content_changes() {
    fn frame(png: bool, color: u8) -> String {
        let mut bytes = Vec::new();
        if png {
            image::ImageEncoder::write_image(
                image::codecs::png::PngEncoder::new(&mut bytes),
                &[color; 12],
                2,
                2,
                image::ExtendedColorType::Rgb8,
            )
            .unwrap();
        } else {
            image::codecs::jpeg::JpegEncoder::new(&mut bytes)
                .encode(&[color; 12], 2, 2, image::ExtendedColorType::Rgb8)
                .unwrap();
        }
        STANDARD.encode(bytes)
    }
    fn command(socket: &mut WebSocket<TcpStream>, method: &str, format: Option<&str>) {
        let value: Value = serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(value["method"], method);
        if let Some(format) = format {
            assert_eq!(value["params"]["format"], format);
        }
        socket
            .send(Message::Text(
                json!({"id":value["id"], "result":{}}).to_string(),
            ))
            .unwrap();
    }
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!(
        "ws://127.0.0.1:{}/page",
        listener.local_addr().unwrap().port()
    );
    let (updated, update) = std::sync::mpsc::channel();
    let (finish, finished) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(4)))
            .unwrap();
        let mut socket = tungstenite::accept(stream).unwrap();
        command(&mut socket, "Page.enable", None);
        command(&mut socket, "Page.startScreencast", Some("jpeg"));
        socket.send(Message::Text(json!({"method":"Page.screencastFrame","params":{"sessionId":1,"data":frame(false,255)}}).to_string())).unwrap();
        command(&mut socket, "Page.screencastFrameAck", None);
        let metrics: Value =
            serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(metrics["method"], "Page.getLayoutMetrics");
        socket.send(Message::Text(json!({"id":metrics["id"],"result":{"cssVisualViewport":{"pageX":0,"pageY":0,"clientWidth":800,"clientHeight":600,"scale":1}}}).to_string())).unwrap();
        let request: Value =
            serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(request["method"], "Page.captureScreenshot");
        assert_eq!(request["params"]["format"], "png");
        socket
            .send(Message::Text(
                json!({"id":request["id"],"result":{"data":frame(true,255)}}).to_string(),
            ))
            .unwrap();
        // A duplicate motion frame must not overwrite the settled PNG or schedule another capture.
        socket.send(Message::Text(json!({"method":"Page.screencastFrame","params":{"sessionId":2,"data":frame(false,255)}}).to_string())).unwrap();
        command(&mut socket, "Page.screencastFrameAck", None);
        updated.send(()).unwrap();
        finished.recv_timeout(Duration::from_secs(3)).unwrap();
        socket.send(Message::Text(json!({"method":"Page.screencastFrame","params":{"sessionId":3,"data":frame(false,0)}}).to_string())).unwrap();
        command(&mut socket, "Page.screencastFrameAck", None);
        updated.send(()).unwrap();
        let _ = socket.read();
    });
    let worker = FrameWorker::start(&address).unwrap();
    update.recv_timeout(Duration::from_secs(3)).unwrap();
    let still = worker.latest().unwrap().unwrap();
    assert_eq!(
        still.version, 2,
        "Identical still frames must not increase the frame version"
    );
    assert_eq!(
        super::super::super::rendering::image_mime(&still.image),
        "image/png"
    );
    finish.send(()).unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    while worker.latest().unwrap().unwrap().version == still.version {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    update.recv_timeout(Duration::from_secs(3)).unwrap();
    drop(worker);
    server.join().unwrap();
}
