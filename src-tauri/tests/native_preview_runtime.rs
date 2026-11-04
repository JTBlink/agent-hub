//! Opt-in acceptance against actual system WebView; no browser process or personal profile is used.
mod runtime {
    use app_lib::commands::preview_native::{self, control, NativeViews};
    use app_lib::core::preview::actions::Action;
    use serde_json::{json, Value};
    use std::io::{Read, Write};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use tauri::{WebviewBuilder, WindowBuilder};

    struct Site {
        url: String,
        stop: Arc<AtomicBool>,
        thread: Option<std::thread::JoinHandle<()>>,
    }
    impl Site {
        fn start() -> Self {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}/", listener.local_addr().unwrap());
            listener.set_nonblocking(true).unwrap();
            let stop = Arc::new(AtomicBool::new(false));
            let ended = stop.clone();
            let thread = std::thread::spawn(move || {
                while !ended.load(Ordering::Relaxed) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let _ =
                                stream.set_read_timeout(Some(std::time::Duration::from_secs(1)));
                            let mut request = [0; 4096];
                            let n = stream.read(&mut request).unwrap_or(0);
                            let request = String::from_utf8_lossy(&request[..n]);
                            let frame = request.starts_with("GET /frame ");
                            let attachment = request.starts_with("GET /download ");
                            let body = if attachment {
                                "native-download-content"
                            } else if frame {
                                "<!doctype html><button aria-label='Frame action'>Frame button</button>"
                            } else {
                                "<!doctype html><meta charset='utf-8'><style>body{margin:20px;font-family:sans-serif}button,input{margin:8px}iframe{display:block;width:300px;height:100px}</style><label for='name'>Display name</label><input id='name'><input id='readonly' readonly><button id='action' aria-label='Save record'>Save</button><div id='shadow'></div><iframe src='/frame'></iframe><script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<button aria-label=\"Shadow action\">Shadow button</button>';</script>"
                            };
                            let header = if attachment {
                                "Content-Disposition: attachment; filename=native-fixture.txt\r\n"
                            } else {
                                ""
                            };
                            let content_type = if attachment {
                                "application/octet-stream"
                            } else {
                                "text/html; charset=utf-8"
                            };
                            let _=write!(stream,"HTTP/1.1 200 OK\r\n{header}Content-Type: {content_type}\r\nContent-Length: {}\r\nSet-Cookie: runtime_http_only=fixture; HttpOnly; SameSite=Lax\r\nContent-Security-Policy: default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'\r\nConnection: close\r\n\r\n{body}",body.len());
                        }
                        Err(_) => std::thread::sleep(std::time::Duration::from_millis(10)),
                    }
                }
            });
            Self {
                url,
                stop,
                thread: Some(thread),
            }
        }
    }
    impl Drop for Site {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Relaxed);
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
        }
    }
    fn ensure(condition: bool, message: &str) -> Result<(), String> {
        if condition {
            Ok(())
        } else {
            Err(message.into())
        }
    }
    async fn action(main: &tauri::Webview, id: &str, action: Action) -> Result<Value, String> {
        let operation = match &action {
            Action::Evaluate { .. } => "evaluate",
            Action::Snapshot => "snapshot",
            Action::InspectRef { .. } => "inspect",
            Action::ClickRef { .. } => "click",
            Action::FillRef { .. } => "fill",
            Action::Cookies => "cookies",
            Action::Storage => "storage",
            Action::SetTheme { .. } => "theme",
            _ => "action",
        };
        control::preview_native_execute(main.clone(), id.into(), action)
            .await
            .map_err(|error| format!("{operation}: {error}"))
    }
    async fn evaluate(main: &tauri::Webview, id: &str, expression: &str) -> Result<Value, String> {
        action(
            main,
            id,
            Action::Evaluate {
                expression: expression.into(),
            },
        )
        .await
        .map_err(|error| {
            format!(
                "{error}; fixture expression: {}",
                expression.chars().take(120).collect::<String>()
            )
        })
    }
    fn reference(snapshot: &Value, label: &str) -> Result<String, String> {
        snapshot["elements"]
            .as_array()
            .and_then(|elements| elements.iter().find(|element| element["label"] == label))
            .and_then(|element| element["ref"].as_str())
            .map(str::to_owned)
            .ok_or_else(|| format!("Missing element: {label}"))
    }
    async fn check(
        main: tauri::Webview,
        id: String,
        downloads: preview_native::downloads::Downloads,
        download_url: String,
    ) -> Result<(), String> {
        for _ in 0..100 {
            if evaluate(&main,&id,"Boolean(document.querySelector('#name')&&document.querySelector('iframe')?.contentDocument?.querySelector('button'))").await.unwrap_or(Value::Bool(false))==true{break;}
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        ensure(
            evaluate(&main, &id, "Boolean(window.__agentHubNativePreview)").await? == true,
            "Native bridge did not initialize",
        )?;
        let script_error = evaluate(&main, &id, "throw new Error('native-fixture-error')")
            .await
            .err()
            .unwrap_or_default();
        ensure(
            script_error.contains("native-fixture-error"),
            "Native console did not report the JavaScript error",
        )?;
        let snapshot = action(&main, &id, Action::Snapshot).await?;
        let name = reference(&snapshot, "Display name")?;
        let shadow = reference(&snapshot, "Shadow action")?;
        let frame = reference(&snapshot, "Frame action")?;
        for reference in [&name, &shadow, &frame] {
            let picked = action(
                &main,
                &id,
                Action::InspectRef {
                    reference: reference.clone(),
                },
            )
            .await?;
            ensure(
                picked["bounds"]["width"]
                    .as_f64()
                    .is_some_and(|width| width > 0.),
                "Element has no visible bounds",
            )?;
            ensure(picked["styles"].is_object(), "Element styles missing")?;
        }
        action(
            &main,
            &id,
            Action::FillRef {
                reference: name.clone(),
                value: "Edited value".into(),
            },
        )
        .await?;
        ensure(
            evaluate(&main, &id, "document.querySelector('#name').value").await? == "Edited value",
            "Native fill failed",
        )?;
        evaluate(
            &main,
            &id,
            "document.querySelector('#action').onclick=()=>window.clicked=true;true",
        )
        .await?;
        action(
            &main,
            &id,
            Action::ClickRef {
                reference: reference(&snapshot, "Save record")?,
            },
        )
        .await?;
        ensure(
            evaluate(&main, &id, "window.clicked===true").await? == true,
            "Native click failed",
        )?;
        let readonly = snapshot["elements"]
            .as_array()
            .and_then(|elements| elements.iter().find(|element| element["readOnly"] == true))
            .and_then(|element| element["ref"].as_str())
            .ok_or("Readonly field missing")?;
        ensure(
            action(
                &main,
                &id,
                Action::FillRef {
                    reference: readonly.into(),
                    value: "refused".into(),
                },
            )
            .await
            .is_err(),
            "Readonly field accepted input",
        )?;
        evaluate(&main, &id, "history.pushState({},'',location.href);true").await?;
        ensure(
            action(&main, &id, Action::InspectRef { reference: name })
                .await
                .is_err(),
            "Same-URL navigation retained a stale reference",
        )?;
        evaluate(&main,&id,"localStorage.setItem('native-fixture','local');sessionStorage.setItem('native-fixture','session');console.info('native-fixture-event');true").await?;
        let storage = action(&main, &id, Action::Storage).await?;
        ensure(
            storage["local"]["native-fixture"] == "local"
                && storage["session"]["native-fixture"] == "session",
            "Native storage missing",
        )?;
        #[cfg(target_os = "macos")]
        {
            let cookies = action(&main, &id, Action::Cookies).await?;
            ensure(
                cookies["cookies"].as_array().is_some_and(|cookies| {
                    cookies
                        .iter()
                        .any(|cookie| cookie["name"] == "runtime_http_only")
                }),
                "HttpOnly cookie missing",
            )?;
        }
        for dark in [true, false] {
            action(&main, &id, Action::SetTheme { dark }).await?;
            wait_for(
                &main,
                &id,
                &format!("matchMedia('(prefers-color-scheme: dark)').matches==={dark}"),
                "Native theme mismatch",
            )
            .await?;
        }
        let current = action(&main, &id, Action::Snapshot).await?;
        let shadow = reference(&current, "Shadow action")?;
        let picked = action(&main, &id, Action::InspectRef { reference: shadow }).await?;
        let x = picked["bounds"]["x"].as_f64().ok_or("Missing x")? + 5.;
        let y = picked["bounds"]["y"].as_f64().ok_or("Missing y")? + 5.;
        control::preview_native_pick_mode(main.clone(), id.clone(), true)
            .await
            .map_err(|error| error.to_string())?;
        evaluate(&main,&id,&format!("document.querySelector('#shadow').shadowRoot.querySelector('button').dispatchEvent(new MouseEvent('click',{{bubbles:true,composed:true,clientX:{x},clientY:{y},view:window}}));true")).await?;
        let capture = control::preview_native_frame(main.clone(), id.clone())
            .await
            .map_err(|error| error.to_string())?;
        ensure(
            capture["picked"]["label"] == "Shadow action",
            "Native picker did not reach the shadow element",
        )?;
        ensure(
            capture["picked"]["screenshot"]
                .as_str()
                .is_some_and(|image| !image.is_empty()),
            "Native element screenshot missing",
        )?;
        ensure(
            capture["frame"]["events"].as_array().is_some_and(|events| {
                events
                    .iter()
                    .any(|event| event["method"] == "Runtime.consoleAPICalled")
            }),
            "Native console event missing",
        )?;
        let copied = eval_selection(&main, &id, "copy").await?;
        ensure(
            copied["operation"] == "copy" && copied["picked"]["label"] == "Save record",
            "Native keyboard copy failed",
        )?;
        let fallback = eval_selection(&main, &id, "no-image").await?;
        ensure(
            fallback["screenshotUnavailable"] == true
                && fallback["picked"]["label"] == "Save record",
            "Screenshot failure discarded native element details",
        )?;
        control::preview_native_pick_mode(main.clone(), id.clone(), true)
            .await
            .map_err(|error| error.to_string())?;
        evaluate(&main,&id,"const d=document.querySelector('iframe').contentDocument,b=d.querySelector('button'),r=b.getBoundingClientRect();b.dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,cancelable:true,clientX:r.x+5,clientY:r.y+5,view:d.defaultView}));true").await?;
        let frame_pick = control::preview_native_frame(main.clone(), id.clone())
            .await
            .map_err(|error| error.to_string())?;
        ensure(
            frame_pick["picked"]["label"] == "Frame action",
            "Native iframe pointer selection failed",
        )?;
        let bounds =
            serde_json::from_value(json!({"x":10,"y":10,"width":490,"height":340,"zoom":0.5}))
                .map_err(|error| error.to_string())?;
        preview_native::preview_native_update(main.clone(), id.clone(), true, Some(bounds), None)
            .map_err(|error| error.to_string())?;
        wait_for(
            &main,
            &id,
            "Math.abs(innerWidth-980)<3",
            "Native viewport size did not match its CSS viewport",
        )
        .await?;
        let _ = evaluate(
            &main,
            &id,
            &format!(
                "location.href={};true",
                serde_json::to_string(&download_url).map_err(|error| error.to_string())?
            ),
        )
        .await;
        for _ in 0..100 {
            if downloads
                .snapshot()
                .map_err(|error| error.to_string())?
                .iter()
                .any(|item| item["state"] == "completed")
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        let history = downloads.snapshot().map_err(|error| error.to_string())?;
        ensure(
            history.iter().any(|item| {
                item["state"] == "completed" && item["local"] == true && item["received"] == 23
            }),
            &format!(
                "Native download was not tracked as a local completed file: {}",
                serde_json::to_string(&history).unwrap_or_default()
            ),
        )?;
        println!(
            "{}",
            json!({"native_preview":"passed","platform":std::env::consts::OS,"http_only_cookies":cfg!(target_os="macos"),"checks":["semantic snapshot","shadow DOM","same-origin iframe","inspect","click","fill","readonly","stale references","storage","theme","selection","real screenshot","console events","keyboard copy","screenshot fallback","viewport size","native download","iframe selection","strict CSP","script errors"]})
        );
        preview_native::preview_native_action(main, id, "close".into())
            .map_err(|error| error.to_string())?;
        Ok(())
    }
    // Native layout and media preferences cross renderer processes asynchronously.
    async fn wait_for(
        main: &tauri::Webview,
        id: &str,
        expression: &str,
        message: &str,
    ) -> Result<(), String> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        loop {
            if evaluate(main, id, expression).await? == true {
                return Ok(());
            }
            if std::time::Instant::now() >= deadline {
                return Err(message.into());
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    }
    async fn eval_selection(
        main: &tauri::Webview,
        id: &str,
        operation: &str,
    ) -> Result<Value, String> {
        control::preview_native_pick_mode(main.clone(), id.into(), true)
            .await
            .map_err(|error| error.to_string())?;
        let script = if operation == "copy" {
            "const b=document.querySelector('#action'),r=b.getBoundingClientRect();b.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.x+5,clientY:r.y+5,view:window}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'c',bubbles:true,cancelable:true}));true"
        } else {
            "const b=document.querySelector('#action'),r=b.getBoundingClientRect();b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:r.x+5,clientY:r.y+5,view:window}));window.__agentHubNativePreview.captured.value.documentBounds.width=0;true"
        };
        evaluate(main, id, &format!("(()=>{{{script}}})()")).await?;
        control::preview_native_frame(main.clone(), id.into())
            .await
            .map_err(|error| error.to_string())
    }
    pub fn run() {
        let site = Site::start();
        let download_root = tempfile::tempdir().unwrap();
        let downloads =
            preview_native::downloads::Downloads::at(download_root.path().to_path_buf());
        let download_url = format!("{}download", site.url);
        let mut views = NativeViews::default();
        views.downloads = downloads.clone();
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().app.windows.clear();
        let failed = Arc::new(AtomicBool::new(false));
        let result = failed.clone();
        tauri::Builder::default()
            .manage(views)
            .setup(move |app| {
                let window = WindowBuilder::new(app, "native-check")
                    .title("Native preview verification")
                    .inner_size(1000., 700.)
                    .build()?;
                let main = window.add_child(
                    WebviewBuilder::new(
                        "main",
                        tauri::WebviewUrl::External("about:blank".parse()?),
                    ),
                    tauri::LogicalPosition::new(0., 0.),
                    tauri::LogicalSize::new(1., 1.),
                )?;
                let id = format!("preview-native-{}", uuid::Uuid::new_v4());
                let picker = include_str!("../src/core/preview/scripts/pick.js").replace(
                    "__ELEMENT_CONTEXT__",
                    include_str!("../src/core/preview/scripts/elements.js"),
                );
                let bridge = include_str!("../src/commands/preview_native/bridge.js")
                    .replace("__PICK_FUNCTION__", &picker)
                    .replace(
                        "__ELEMENT_CONTEXT__",
                        include_str!("../src/core/preview/scripts/elements.js"),
                    );
                window.add_child(
                    WebviewBuilder::new(&id, tauri::WebviewUrl::External(site.url.parse()?))
                        .incognito(true)
                        .initialization_script(bridge)
                        .on_download(preview_native::downloads::handle),
                    tauri::LogicalPosition::new(10., 10.),
                    tauri::LogicalSize::new(980., 680.),
                )?;
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let outcome = tokio::time::timeout(
                        std::time::Duration::from_secs(60),
                        check(main, id, downloads, download_url),
                    )
                    .await;
                    if !matches!(outcome, Ok(Ok(()))) {
                        eprintln!("Native preview check failed: {outcome:?}");
                        result.store(true, Ordering::Relaxed);
                    }
                    drop(site);
                    handle.exit(if result.load(Ordering::Relaxed) { 1 } else { 0 });
                });
                Ok(())
            })
            .run(context)
            .expect("Native verification app failed");
        if failed.load(Ordering::Relaxed) {
            std::process::exit(1);
        }
    }
}
fn main() {
    if !std::env::args().any(|arg| arg == "--ignored") {
        println!(
            "Native runtime verification skipped; pass --ignored to open its isolated test window."
        );
        return;
    }
    runtime::run();
}
