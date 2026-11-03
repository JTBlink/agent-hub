use super::*;
#[test]
fn remote_directory_paths_are_absolute_scoped_and_do_not_expand_shell_syntax() {
    assert_eq!(
        managed_directory("/srv/downloads", "run").unwrap(),
        "/srv/downloads/agent-hub-run"
    );
    assert_eq!(
        managed_directory("C:\\Downloads", "run").unwrap(),
        "C:/Downloads/agent-hub-run"
    );
    for path in [
        "relative",
        "~/Downloads",
        "/srv/../etc",
        "C:relative",
        "//server/share",
        "/srv\nother",
    ] {
        assert!(managed_directory(path, "run").is_err(), "accepted {path}");
    }
}
#[test]
fn frame_ownership_includes_child_frames_and_handles_unknown_frames() {
    let tree = json!({"frame":{"id":"main"},"childFrames":[{"frame":{"id":"child"}}]});
    assert!(contains_frame(&tree, "child").unwrap());
    assert!(!contains_frame(&tree, "foreign").unwrap());
}

#[test]
#[ignore = "requires installed Chromium; verifies context-scoped remote download observation and cancellation"]
fn remote_downloads_are_scoped_to_their_context_and_never_reported_as_local_files() {
    use crate::core::preview::{
        automation::{self, Automation, ControlEndpoint},
        browser::{Action, Browsers},
        runtime::BrowserProfile,
    };
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::Arc,
        time::{Duration, Instant},
    };
    let root = tempfile::tempdir().unwrap();
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    let origin = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let site = std::thread::spawn(move || {
        for _ in 0..12 {
            let Ok((mut stream, _)) = listener.accept() else {
                break;
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = [0u8; 4096];
            let count = stream.read(&mut request).unwrap_or(0);
            let path = String::from_utf8_lossy(&request[..count])
                .split_whitespace()
                .nth(1)
                .unwrap_or("/")
                .to_owned();
            if path == "/stop" {
                let _ = stream
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length:0\r\nConnection:close\r\n\r\n");
                break;
            }
            if path.starts_with("/file") || path.starts_with("/slow") {
                let slow = path.starts_with("/slow");
                let data = if slow {
                    vec![b'x'; 1024 * 1024]
                } else {
                    b"remote artifact bytes".to_vec()
                };
                let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type:application/octet-stream\r\nContent-Disposition:attachment; filename=artifact.bin\r\nContent-Length:{}\r\nConnection:close\r\n\r\n", data.len());
                for chunk in data.chunks(4096) {
                    if stream.write_all(chunk).is_err() {
                        break;
                    }
                    if slow {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                }
            } else {
                let body = "<!doctype html><title>Remote downloads</title><iframe id='child' srcdoc='<p>Child</p>'></iframe>";
                let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type:text/html\r\nContent-Length:{}\r\nConnection:close\r\n\r\n{}",body.len(),body);
            }
        }
    });
    let host = Browsers::new(root.path().join("host"));
    let host_page = host.create("default", &origin).unwrap();
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
            remote_download_directory: Some(
                root.path().join("remote-files").to_string_lossy().into(),
            ),
            ..BrowserProfile::default()
        })
        .unwrap();
    let page = client.create("remote", &origin).unwrap();
    let server = Automation::start(client.clone()).unwrap();
    let controller: ControlEndpoint =
        serde_json::from_slice(&std::fs::read(root.path().join("client/control.json")).unwrap())
            .unwrap();
    let (frame, directory) = {
        let runtime = client.runtime_handles().unwrap()["remote"].clone();
        let mut runtime = runtime.lock().unwrap();
        let page = client.page(&page).unwrap();
        let mut page = page.lock().unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        let frame = loop {
            let tree = page.cdp.call("Page.getFrameTree", json!({})).unwrap();
            if let Some(frame) = tree["frameTree"]["childFrames"][0]["frame"]["id"].as_str() {
                break frame.to_owned();
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(30));
        };
        assert!(runtime.owns_download_frame(&frame).unwrap());
        let foreign = host
            .page(&host_page)
            .unwrap()
            .lock()
            .unwrap()
            .cdp
            .call("Page.getFrameTree", json!({}))
            .unwrap()["frameTree"]["frame"]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(!runtime.owns_download_frame(&foreign).unwrap());
        (frame, runtime.remote_download_dir.clone().unwrap())
    };
    {
        let runtime = client.runtime_handles().unwrap()["remote"].clone();
        let mut runtime = runtime.lock().unwrap();
        let foreign = host
            .page(&host_page)
            .unwrap()
            .lock()
            .unwrap()
            .cdp
            .call("Page.getFrameTree", json!({}))
            .unwrap()["frameTree"]["frame"]["id"]
            .clone();
        let foreign_guid = uuid::Uuid::new_v4().to_string();
        runtime.cdp.events.push_back(json!({"method":"Browser.downloadWillBegin","params":{"guid":foreign_guid,"frameId":foreign,"suggestedFilename":"foreign.bin"}}));
        runtime.cdp.events.push_back(json!({"method":"Browser.downloadProgress","params":{"guid":foreign_guid,"state":"completed","receivedBytes":10,"totalBytes":10}}));
    }
    assert!(
        client.downloads().unwrap().is_empty(),
        "foreign context download events must remain invisible"
    );

    client.action(&page,Action::Evaluate{expression:format!("(()=>{{const a=document.createElement('a');a.href={};document.body.append(a);a.click();return true}})()",serde_json::to_string(&format!("{origin}/file")).unwrap())}).unwrap();
    let deadline = Instant::now() + Duration::from_secs(8);
    let completed = loop {
        let items = client.downloads().unwrap();
        if let Some(item) = items.iter().find(|item| item.state == "completed") {
            break item.clone();
        }
        assert!(
            Instant::now() < deadline,
            "remote download was not observed"
        );
        std::thread::sleep(Duration::from_millis(30));
    };
    assert!(completed.remote);
    assert!(!completed.local);
    assert!(completed.path.is_none());
    assert!(completed.verified);
    let remote_path = completed.remote_path.as_ref().unwrap();
    assert!(remote_path.starts_with(&format!("{directory}/")));
    assert_eq!(
        std::fs::read(remote_path).unwrap(),
        b"remote artifact bytes"
    );
    assert!(!root.path().join("client/downloads/remote").exists());
    let rows = automation::call(&controller, json!({"kind":"downloads"})).unwrap();
    assert_eq!(rows.as_array().unwrap().len(), 1);
    assert!(rows[0].get("remote_path").is_none());
    assert_eq!(rows[0]["remote"], true);
    client.reconnect(&page).unwrap();
    client.action(&page,Action::Evaluate{expression:format!("document.querySelector('#child').contentDocument.body.innerHTML='<a href=\"{origin}/slow\" id=\"download\">download</a>';document.querySelector('#child').contentDocument.querySelector('a').click();true")}).unwrap();
    let deadline = Instant::now() + Duration::from_secs(8);
    let active = loop {
        let items = client.downloads().unwrap();
        if let Some(item) = items.iter().find(|item| item.state == "inProgress") {
            break item.clone();
        }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(30));
    };
    assert_eq!(active.source_context, completed.source_context);
    automation::call(
        &controller,
        json!({"kind":"cancel_download","profile":"remote","id":active.id}),
    )
    .unwrap();
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        let items = client.downloads().unwrap();
        if items
            .iter()
            .any(|item| item.id == active.id && item.state == "canceled")
        {
            break;
        }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(30));
    }
    assert!(client.cancel_download("remote", "foreign-guid").is_err());
    assert!(client.cancel_download("remote", &completed.id).is_err());
    automation::call(
        &controller,
        json!({"kind":"forget_download","profile":"remote","id":completed.id}),
    )
    .unwrap();
    assert!(std::path::Path::new(remote_path).exists());
    assert!(host
        .action(
            &host_page,
            Action::Evaluate {
                expression: "document.title".into()
            }
        )
        .is_ok());
    assert!(!frame.is_empty());
    drop(server);
    client.clear();
    host.clear();
    let _ = reqwest::blocking::get(format!("{origin}/stop"));
    site.join().unwrap();
}

#[test]
fn an_exhausted_frame_budget_remains_unverified() {
    let tree = json!({"frame":{"id":"root"},"childFrames":(0..2050).map(|id|json!({"frame":{"id":format!("frame-{id}")}})).collect::<Vec<_>>()});
    assert!(contains_frame(&tree, "not-inspected").is_err());
}

#[test]
fn context_configuration_failure_is_retried_before_creating_a_page() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    let endpoint = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let websocket = format!(
        "ws://127.0.0.1:{}/browser",
        listener.local_addr().unwrap().port()
    );
    let server = std::thread::spawn(move || {
        let (mut http, _) = listener.accept().unwrap();
        let mut request = Vec::new();
        let mut chunk = [0u8; 1024];
        while request.len() < 8192 && !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
            let count = http.read(&mut chunk).unwrap();
            assert!(count > 0);
            request.extend_from_slice(&chunk[..count]);
        }
        assert!(request.windows(4).any(|bytes| bytes == b"\r\n\r\n"));
        let body = json!({"webSocketDebuggerUrl":websocket}).to_string();
        write!(http,"HTTP/1.1 200 OK\r\nContent-Type:application/json\r\nContent-Length:{}\r\nConnection:close\r\n\r\n{}",body.len(),body).unwrap();
        drop(http);
        let (socket, _) = listener.accept().unwrap();
        let mut socket = tungstenite::accept(socket).unwrap();
        let mut creates = 0;
        let mut configurations = 0;
        while let Ok(message) = socket.read() {
            let tungstenite::Message::Text(text) = message else {
                continue;
            };
            let command: Value = serde_json::from_str(&text).unwrap();
            let result = match command["method"].as_str().unwrap() {
                "Target.createBrowserContext" => {
                    assert_eq!(command["params"]["proxyServer"], "socks5://127.0.0.1:1080");
                    assert_eq!(
                        command["params"]["proxyBypassList"],
                        "<-loopback>;*.agent-hub.localhost"
                    );
                    creates += 1;
                    json!({"browserContextId":if creates==1 {"initial"}else{"replacement"}})
                }
                "Target.getBrowserContexts" => {
                    json!({"browserContextIds":if creates==1{Vec::<String>::new()}else{vec!["replacement".into()]}})
                }
                "Browser.setDownloadBehavior" => {
                    configurations += 1;
                    if configurations == 2 {
                        socket.send(tungstenite::Message::Text(json!({"id":command["id"],"error":{"message":"temporary configuration failure"}}).to_string())).unwrap();
                        continue;
                    }
                    json!({})
                }
                "Target.createTarget" => {
                    assert_eq!(configurations, 3);
                    json!({"targetId":"configured-target"})
                }
                "Target.disposeBrowserContext" => json!({}),
                other => panic!("unexpected command {other}"),
            };
            socket
                .send(tungstenite::Message::Text(
                    json!({"id":command["id"],"result":result}).to_string(),
                ))
                .unwrap();
        }
        configurations
    });
    let root = tempfile::tempdir().unwrap();
    let profile = super::super::runtime::BrowserProfile {
        id: "remote".into(),
        name: "Remote".into(),
        endpoint: Some(endpoint),
        proxy: Some("socks5://127.0.0.1:1080".into()),
        remote_download_directory: Some("/srv/downloads".into()),
        ..Default::default()
    };
    let mut runtime = Runtime::start(root.path(), &profile, |_, _| {
        panic!("remote sessions must not spawn local browsers")
    })
    .unwrap();
    assert!(runtime
        .create_page(|_| panic!("creation must stop at configuration failure"))
        .is_err());
    let error = runtime
        .create_page(|_| Err(AppError::cancelled("stopped after configured target")))
        .err()
        .unwrap();
    assert!(error
        .to_string()
        .contains("stopped after configured target"));
    drop(runtime);
    assert_eq!(server.join().unwrap(), 3);
}

#[test]
fn direct_ownership_is_not_truncated_by_the_target_inspection_budget() {
    let targets=(0..24).map(|index|json!({"type":"iframe","browserContextId":"owned","targetId":format!("target-{index}")})).chain(std::iter::once(json!({"type":"page","browserContextId":"foreign","targetId":"foreign"}))).collect::<Vec<_>>();
    let owned = owned_targets(&targets, "owned");
    assert_eq!(owned.len(), 24);
    assert!(owned.contains(&"target-23"));
    assert!(!owned.contains(&"foreign"));
}
