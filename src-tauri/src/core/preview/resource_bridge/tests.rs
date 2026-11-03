use super::*;
#[test]
fn resources_share_grant_checks_and_reject_revoked_hidden_and_escaping_paths() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("index.html"), "<p>test</p>").unwrap();
    std::fs::write(root.path().join(".secret"), "private").unwrap();
    std::fs::write(root.path().join("literal %.txt"), "data").unwrap();
    let documents = Documents::default();
    let doc = documents.open(&root.path().join("index.html")).unwrap();
    for (path, code) in [
        ("index.html", 200),
        ("literal%20%25.txt", 200),
        ("%2e%2e/secret", 404),
        (".secret", 404),
        ("missing", 404),
    ] {
        assert_eq!(load(&documents, &doc.id, path, "GET").code, code);
    }
    assert_eq!(load(&documents, &doc.id, "index.html", "POST").code, 405);
    let request = json!({"requestId":"fixture","request":{"url":format!("http://{}.agent-hub.localhost:1/index.html?x=y",doc.id),"method":"HEAD"}});
    let response = fulfillment(&documents, &request);
    assert_eq!(response["responseCode"], 200);
    assert_eq!(response["body"], "");
    documents.close(&doc.id);
    assert_eq!(fulfillment(&documents, &request)["responseCode"], 404);
}

#[test]
#[ignore = "requires installed Chromium; verifies remote resources without an available client HTTP server"]
fn remote_html_loads_authorized_relative_resources_and_honors_revocation_after_reconnect() {
    use crate::core::preview::{
        browser::{Action, Browsers},
        runtime::BrowserProfile,
    };
    use std::{
        net::TcpListener,
        time::{Duration, Instant},
    };
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("site");
    std::fs::create_dir(&site).unwrap();
    std::fs::write(site.join("index.html"),"<!doctype html><link rel='stylesheet' href='./style.css'><img src='./image.svg'><script src='./script.js'></script>").unwrap();
    std::fs::write(site.join("style.css"), "body{background:rgb(17,34,51)}").unwrap();
    let observer = TcpListener::bind("127.0.0.1:0").unwrap();
    observer.set_nonblocking(true).unwrap();
    let observed_port = observer.local_addr().unwrap().port();
    std::fs::write(site.join("script.js"),format!("setTimeout(()=>fetch('./data.json').then(r=>r.json()).then(data=>{{window.loaded=data.value;fetch('http://127.0.0.1:{observed_port}/ready',{{mode:'no-cors'}})}}),300)")).unwrap();
    std::fs::write(site.join("data.json"), "{\"value\":\"relative resources\"}").unwrap();
    std::fs::write(
        site.join("image.svg"),
        "<svg xmlns='http://www.w3.org/2000/svg' width='17' height='19'></svg>",
    )
    .unwrap();
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
            ..Default::default()
        })
        .unwrap();
    let doc = client.documents.open(&site.join("index.html")).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    // No server listens on this port: all document resources must use the capability bridge.
    let url = format!("http://{}.agent-hub.localhost:{port}/index.html", doc.id);
    let page = client.create("remote", &url).unwrap();
    // Wait for a real callback without any frame or action poll: hidden tabs must progress.
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        match observer.accept() {
            Ok((mut stream, _)) => {
                use std::io::Write;
                stream
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length:0\r\nConnection:close\r\n\r\n")
                    .unwrap();
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                assert!(
                    Instant::now() < deadline,
                    "hidden document resource loading stalled"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(error) => panic!("callback failed: {error}"),
        }
    }

    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let ready=client.action(&page,Action::Evaluate{expression:"window.loaded==='relative resources' && getComputedStyle(document.body).backgroundColor==='rgb(17, 34, 51)' && document.querySelector('img').naturalWidth===17".into()}).unwrap();
        if ready == true {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "relative resources never became ready"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
    client.reconnect(&page).unwrap();
    assert_eq!(
        client
            .action(
                &page,
                Action::Evaluate {
                    expression: "fetch('./data.json?fresh=1').then(r=>r.json()).then(d=>d.value)"
                        .into()
                }
            )
            .unwrap(),
        "relative resources"
    );
    client.documents.close(&doc.id);
    assert_eq!(
        client
            .action(
                &page,
                Action::Evaluate {
                    expression: "fetch('./data.json?revoked=1').then(r=>r.status)".into()
                }
            )
            .unwrap(),
        404
    );
    client.clear();
    assert_eq!(
        std::sync::Arc::strong_count(&client.documents),
        1,
        "resource workers must release document ownership"
    );
    host.clear();
}
