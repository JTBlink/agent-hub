use super::*;
#[test]
fn marks_a_lost_resource_connection_unhealthy_and_releases_documents() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!(
        "ws://127.0.0.1:{}/page",
        listener.local_addr().unwrap().port()
    );
    let server = std::thread::spawn(move || {
        let (socket, _) = listener.accept().unwrap();
        let mut socket = tungstenite::accept(socket).unwrap();
        let command: Value =
            serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(command["method"], "Fetch.enable");
        assert_eq!(
            command["params"]["patterns"][0]["urlPattern"],
            "http://*.agent-hub.localhost:*/*"
        );
        // A request may precede Fetch.enable's reply and contain a large POST body.
        socket.send(Message::Text(json!({"method":"Fetch.requestPaused","params":{
            "requestId":"oversized-post","request":{"url":format!("http://{}.agent-hub.localhost:1/index.html",uuid::Uuid::new_v4()),"method":"POST","postData":"x".repeat(20000)}
        }}).to_string())).unwrap();
        socket
            .send(Message::Text(
                json!({"id":command["id"],"result":{}}).to_string(),
            ))
            .unwrap();
        let fulfillment: Value =
            serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(fulfillment["method"], "Fetch.fulfillRequest");
        assert_eq!(fulfillment["params"]["requestId"], "oversized-post");
        assert_eq!(fulfillment["params"]["responseCode"], 405);
        socket.close(None).unwrap();
    });
    let documents = Arc::new(crate::core::preview::documents::Documents::default());
    let worker = ResourceWorker::start(&address, documents.clone()).unwrap();
    let deadline = Instant::now() + Duration::from_secs(2);
    while worker.healthy() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    drop(worker);
    server.join().unwrap();
    assert_eq!(Arc::strong_count(&documents), 1);
}

#[test]
fn refuses_startup_overflow_instead_of_losing_paused_requests() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!(
        "ws://127.0.0.1:{}/page",
        listener.local_addr().unwrap().port()
    );
    let server = std::thread::spawn(move || {
        let (socket, _) = listener.accept().unwrap();
        let mut socket = tungstenite::accept(socket).unwrap();
        let command: Value =
            serde_json::from_str(socket.read().unwrap().to_text().unwrap()).unwrap();
        for id in 0..201 {
            let event = json!({"method":"Fetch.requestPaused","params":{"requestId":format!("request-{id}"),"request":{"url":"http://invalid.agent-hub.localhost:1/file","method":"GET"}}});
            if socket.send(Message::Text(event.to_string())).is_err() {
                break;
            }
        }
        let _ = socket.send(Message::Text(
            json!({"id":command["id"],"result":{}}).to_string(),
        ));
    });
    let documents = Arc::new(crate::core::preview::documents::Documents::default());
    let error = ResourceWorker::start(&address, documents.clone())
        .err()
        .expect("startup must refuse overflow");
    assert!(error
        .to_string()
        .contains("Too many paused resource requests"));
    server.join().unwrap();
    assert_eq!(Arc::strong_count(&documents), 1);
}
