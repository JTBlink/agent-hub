use super::*;
#[test]
fn accepts_only_the_owned_loopback_origin_for_document_forwarding() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    for origin in [
        "https://127.0.0.1:1234",
        "http://example.invalid:1234",
        "http://user@127.0.0.1:1234",
        "http://127.0.0.1:1234/path",
        "http://127.0.0.1:1234?x=1",
    ] {
        assert!(browsers.register_document_origin(origin).is_err());
    }
    browsers
        .register_document_origin("http://127.0.0.1:1234")
        .unwrap();
    assert_eq!(browsers.document_port.load(Ordering::Acquire), 1234);
}
#[cfg(unix)]
#[test]
#[ignore = "requires OpenSSH server and Chromium; verifies first popup navigation over an authenticated reverse forward"]
fn remote_document_popup_loads_before_inventory_attachment_and_forward_closes_with_profile() {
    use crate::core::preview::{
        assets::Assets, browser::Action, runtime::BrowserProfile, ssh_fixture::SshFixture,
    };
    use std::{
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        sync::Arc,
    };
    let fixture = SshFixture::start();
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("site");
    std::fs::create_dir(&site).unwrap();
    let observer = TcpListener::bind("127.0.0.1:0").unwrap();
    observer.set_nonblocking(true).unwrap();
    let observed = observer.local_addr().unwrap().port();
    std::fs::write(site.join("index.html"),"<!doctype html><title>Parent</title><button style='width:200px;height:80px' onclick=\"window.open('./popup.html')\">Open</button><a target='_blank' href='./popup.html?link=1'>Link</a>").unwrap();
    std::fs::write(site.join("popup.html"),"<!doctype html><title>Popup loaded</title><link rel='stylesheet' href='./style.css'><script src='./script.js'></script>").unwrap();
    std::fs::write(site.join("style.css"), "body{background:rgb(17,34,51)}").unwrap();
    std::fs::write(site.join("data.json"), "{\"value\":\"popup data\"}").unwrap();
    std::fs::write(site.join("script.js"),format!("fetch('./data.json').then(r=>r.json()).then(d=>{{window.loaded=d.value;fetch('http://127.0.0.1:{observed}/ready?style='+encodeURIComponent(getComputedStyle(document.body).backgroundColor),{{mode:'no-cors'}})}})")).unwrap();
    let host = Browsers::new(root.path().join("host"));
    let foreign = host.create("default", "about:blank").unwrap();
    let endpoint = host.runtime_handles().unwrap()["default"]
        .lock()
        .unwrap()
        .endpoint
        .clone();
    let client = Arc::new(Browsers::new(root.path().join("client")));
    client
        .save_profile(BrowserProfile {
            id: "remote".into(),
            name: "Remote".into(),
            endpoint: Some(endpoint),
            remote_transfer_target: Some("fixture".into()),
            ..Default::default()
        })
        .unwrap();
    let doc = client.documents.open(&site.join("index.html")).unwrap();
    let assets = Assets::start(client.documents.clone()).unwrap();
    client.register_document_origin(&assets.origin).unwrap();
    let local_port = reqwest::Url::parse(&assets.origin).unwrap().port().unwrap();
    client.create("remote", "about:blank").unwrap();
    let original = assets.browser_document_url(&doc.id, "index.html");
    let forwarded = client
        .resolve_document_url_using("remote", &original, |target, port, cancel| {
            Forward::start(
                target,
                port,
                Some(&fixture.root.path().join("client_config")),
                cancel,
            )
        })
        .unwrap();
    let remote_port = reqwest::Url::parse(&forwarded).unwrap().port().unwrap();
    let page = client.create("remote", &forwarded).unwrap();
    let parent_target = client.state.lock().unwrap().pages[&page].target.clone();
    let deadline = Instant::now() + Duration::from_secs(8);
    while client
        .action(
            &page,
            Action::Evaluate {
                expression: "Boolean(document.querySelector('button'))".into(),
            },
        )
        .unwrap()
        != true
    {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(20));
    }
    for selector in ["button", "a"] {
        let bounds=client.action(&page,Action::Evaluate{expression:format!("(()=>{{const b=document.querySelector('{selector}').getBoundingClientRect();return {{x:b.x+b.width/2,y:b.y+b.height/2}}}})()")}).unwrap();
        for event in ["mousePressed", "mouseReleased"] {
            client
                .action(
                    &page,
                    Action::Mouse {
                        x: bounds["x"].as_f64().unwrap(),
                        y: bounds["y"].as_f64().unwrap(),
                        event: event.into(),
                        button: Some("left".into()),
                        delta_x: None,
                        delta_y: None,
                    },
                )
                .unwrap();
        }
        // No list()/inventory attach: the first popup document and all resources use SSH.
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            match observer.accept() {
                Ok((mut stream, _)) => {
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
                    let mut bytes = [0u8; 4096];
                    let count = stream.read(&mut bytes).unwrap();
                    let request = String::from_utf8_lossy(&bytes[..count]);
                    let path = request.split_whitespace().nth(1).unwrap();
                    let callback =
                        reqwest::Url::parse(&format!("http://fixture.invalid{path}")).unwrap();
                    assert!(
                        callback
                            .query_pairs()
                            .any(|(key, value)| key == "style" && value == "rgb(17, 34, 51)"),
                        "popup stylesheet did not apply"
                    );
                    let _ = stream.write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Length:0\r\nConnection:close\r\n\r\n",
                    );
                    break;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(Instant::now() < deadline, "first popup resources failed");
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(_) => panic!("fixture callback unavailable"),
            }
        }
    }
    let runtime = client.runtime_handles().unwrap()["remote"].clone();
    let targets = runtime
        .lock()
        .unwrap()
        .cdp
        .call("Target.getTargets", serde_json::json!({}))
        .unwrap();
    let popups = targets["targetInfos"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|t| t["openerId"] == parent_target)
        .collect::<Vec<_>>();
    assert_eq!(popups.len(), 2);
    for popup in popups {
        assert_eq!(popup["title"], "Popup loaded");
        let url = reqwest::Url::parse(popup["url"].as_str().unwrap()).unwrap();
        assert_eq!(url.port(), Some(remote_port));
    }
    // A slow document-navigation setup must not replay over a newer navigation or reconnect.
    for superseding in ["navigate", "reconnect"] {
        let gate = runtime.lock().unwrap().document_forward_gate.clone();
        let held = gate.lock().unwrap();
        let previous = client
            .page(&page)
            .unwrap()
            .lock()
            .unwrap()
            .navigation_intent;
        std::thread::scope(|scope| {
            let worker = scope.spawn(|| {
                client.action(
                    &page,
                    Action::Navigate {
                        url: original.clone(),
                    },
                )
            });
            let deadline = Instant::now() + Duration::from_secs(2);
            while client
                .page(&page)
                .unwrap()
                .lock()
                .unwrap()
                .navigation_intent
                == previous
            {
                assert!(Instant::now() < deadline);
                std::thread::sleep(Duration::from_millis(10));
            }
            if superseding == "navigate" {
                client
                    .action(
                        &page,
                        Action::Navigate {
                            url: "about:blank".into(),
                        },
                    )
                    .unwrap();
            } else {
                client.reconnect(&page).unwrap();
            }
            drop(held);
            assert!(worker
                .join()
                .unwrap()
                .unwrap_err()
                .to_string()
                .contains("superseded"));
        });
        assert_eq!(
            client
                .action(
                    &page,
                    Action::Evaluate {
                        expression: "location.href".into()
                    }
                )
                .unwrap(),
            "about:blank"
        );
    }
    assert_eq!(
        host.action(
            &foreign,
            Action::Evaluate {
                expression: "document.readyState".into()
            }
        )
        .unwrap(),
        "complete"
    );
    client.clear();
    drop(runtime);
    let deadline = Instant::now() + Duration::from_secs(3);
    while TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, remote_port)).is_ok() {
        assert!(
            Instant::now() < deadline,
            "SSH forward survived profile cleanup"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    host.clear();
    std::fs::write(fixture.root.path().join("known_hosts"), "").unwrap();
    assert!(
        Forward::start(
            "fixture",
            local_port,
            Some(&fixture.root.path().join("client_config")),
            &AtomicBool::new(false)
        )
        .is_err(),
        "unknown host keys must be refused"
    );
}

#[cfg(unix)]
#[test]
#[ignore = "requires Chromium; verifies slow SSH setup does not hold the runtime lock and cancels on shutdown"]
fn slow_forward_startup_releases_runtime_lock_and_cancels_on_shutdown() {
    use crate::core::preview::{assets::Assets, runtime::BrowserProfile};
    use std::sync::{mpsc, Arc};
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("index.html");
    std::fs::write(&path, "<p>document</p>").unwrap();
    let host = Browsers::new(root.path().join("host"));
    host.create("default", "about:blank").unwrap();
    let endpoint = host.runtime_handles().unwrap()["default"]
        .lock()
        .unwrap()
        .endpoint
        .clone();
    let client = Arc::new(Browsers::new(root.path().join("client")));
    client
        .save_profile(BrowserProfile {
            id: "remote".into(),
            name: "Remote".into(),
            endpoint: Some(endpoint),
            remote_transfer_target: Some("fixture".into()),
            ..Default::default()
        })
        .unwrap();
    client.create("remote", "about:blank").unwrap();
    let document = client.documents.open(&path).unwrap();
    let assets = Assets::start(client.documents.clone()).unwrap();
    client.register_document_origin(&assets.origin).unwrap();
    let url = assets.browser_document_url(&document.id, "index.html");
    let runtime = client.runtime_handles().unwrap()["remote"].clone();
    let (sender, receiver) = mpsc::channel();
    std::thread::scope(|scope| {
        let worker = scope.spawn(|| {
            client.resolve_document_url_using("remote", &url, |_, _, cancel| {
                sender.send(()).unwrap();
                let deadline = Instant::now() + Duration::from_secs(3);
                while !cancel.load(Ordering::Acquire) {
                    assert!(
                        Instant::now() < deadline,
                        "shutdown failed to cancel pending setup"
                    );
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(AppError::cancelled("fixture setup canceled"))
            })
        });
        receiver.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(
            runtime.try_lock().is_ok(),
            "SSH setup retained the Runtime mutex"
        );
        client.clear();
        assert!(worker.join().unwrap().is_err());
    });
    assert!(client.state.lock().unwrap().document_builds.is_empty());
    drop(runtime);
    host.clear();
}

#[test]
fn reissues_authorized_document_addresses_for_the_registered_client_server() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("index.html");
    std::fs::write(&path, "<p>test</p>").unwrap();
    let browsers = Browsers::new(root.path().join("browser"));
    browsers
        .register_document_origin("http://127.0.0.1:1234")
        .unwrap();
    let doc = browsers.documents.open(&path).unwrap();
    let address = format!(
        "http://{}.agent-hub.localhost:4321/index.html?mode=read#target",
        doc.id
    );
    let resolved = browsers.resolve_document_url("default", &address).unwrap();
    assert_eq!(
        resolved,
        format!(
            "http://{}.agent-hub.localhost:1234/index.html?mode=read#target",
            doc.id
        )
    );
    browsers.documents.close(&doc.id);
    assert!(browsers.resolve_document_url("default", &address).is_err());
}
