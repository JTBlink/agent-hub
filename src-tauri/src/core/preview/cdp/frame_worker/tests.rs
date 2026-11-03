use super::*;
use std::net::TcpListener;

#[test]
fn receives_and_acknowledges_frames_without_ui_or_control_requests_and_releases_socket() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!(
        "ws://127.0.0.1:{}/page",
        listener.local_addr().unwrap().port()
    );
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new(&mut jpeg)
        .encode(&[255; 12], 2, 2, image::ExtendedColorType::Rgb8)
        .unwrap();
    let data = STANDARD.encode(jpeg);
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
            socket
                .send(Message::Text(
                    json!({"id":command["id"],"result":{}}).to_string(),
                ))
                .unwrap();
        }
        for session in 1..=3 {
            socket.send(Message::Text(json!({"method":"Page.screencastFrame","params":{"sessionId":session,"data":data}}).to_string())).unwrap();
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
        STANDARD.encode(b"not a jpeg"),
        "a".repeat(8 * 1024 * 1024 + 1),
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
