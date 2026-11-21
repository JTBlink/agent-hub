use super::*;

#[test]
fn sends_the_complete_large_resource_when_accepted_sockets_are_nonblocking() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("index.html"), "<img src='image.png'>").unwrap();
    let content: Vec<u8> = (0..8 * 1024 * 1024)
        .map(|index| (index % 251) as u8)
        .collect();
    std::fs::write(root.path().join("image.png"), &content).unwrap();
    let documents = Documents::default();
    let doc = documents.open(&root.path().join("index.html")).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    client
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(
        client,
        "GET /image.png HTTP/1.1\r\nHost: {}.agent-hub.localhost\r\n\r\n",
        doc.id
    )
    .unwrap();
    let (stream, _) = listener.accept().unwrap();
    // macOS can inherit the listener's nonblocking flag on accepted sockets.
    stream.set_nonblocking(true).unwrap();
    let server = std::thread::spawn(move || serve(stream, &documents));
    // Apply backpressure so a nonblocking write cannot enqueue the whole resource.
    std::thread::sleep(Duration::from_millis(100));
    let mut response = Vec::new();
    client.read_to_end(&mut response).unwrap();
    let result = server.join().unwrap();
    let start = response
        .windows(4)
        .position(|bytes| bytes == b"\r\n\r\n")
        .unwrap()
        + 4;
    let headers = String::from_utf8_lossy(&response[..start]);
    assert!(headers.starts_with("HTTP/1.1 200 OK"));
    assert!(headers.contains(&format!("Content-Length: {}\r\n", content.len())));
    assert_eq!(
        response.len() - start,
        content.len(),
        "resource response was truncated"
    );
    assert_eq!(&response[start..], content.as_slice());
    result.unwrap();
}
