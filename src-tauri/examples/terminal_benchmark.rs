//! Opt-in desktop benchmark using the system WebView and real PTYs.
use app_lib::core::terminal::{
    TerminalEvent, TerminalManager, TerminalSession, TerminalSize, TerminalSpec,
};
use portable_pty::CommandBuilder;
use std::{
    io::{self, BufRead, Write},
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, Manager, State, WebviewUrl, WebviewWindowBuilder};

const OWNER: &str = "main";
const PAGE: &str = "/tests/browser/terminal-benchmark.html";

#[tauri::command]
async fn benchmark_create(
    manager: State<'_, Arc<TerminalManager>>,
    stream: bool,
    size: TerminalSize,
    events: Channel<TerminalEvent>,
) -> Result<TerminalSession, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut command = CommandBuilder::new(std::env::current_exe()?);
        command.arg(if stream { "--stream" } else { "--echo" });
        let cwd = std::env::temp_dir();
        command.cwd(&cwd);
        manager.create(
            OWNER,
            TerminalSpec {
                project_id: OWNER.into(),
                cwd,
                command,
                integration: None,
                size,
            },
            move |event| events.send(event).is_ok(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn benchmark_finish(
    app: tauri::AppHandle,
    manager: State<'_, Arc<TerminalManager>>,
    result: serde_json::Value,
    failed: bool,
) {
    if failed {
        eprintln!("{result}");
    } else {
        println!("{result}");
    }
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        manager.close_all();
        app.exit(i32::from(failed));
    });
}

#[tauri::command]
async fn benchmark_host_cpu(
    system: State<'_, Arc<std::sync::Mutex<sysinfo::System>>>,
) -> Result<f32, String> {
    let system = system.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut system = system.lock().map_err(|error| error.to_string())?;
        let pid = sysinfo::get_current_pid().map_err(str::to_owned)?;
        system.refresh_process(pid);
        system
            .process(pid)
            .map(|process| process.cpu_usage())
            .ok_or_else(|| "Host process CPU is unavailable".into())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn child(stream: bool) -> io::Result<()> {
    let mut stdout = io::stdout().lock();
    for line in io::stdin().lock().lines() {
        let line = line?;
        if stream {
            let line = "\x1b[32m日志\x1b[0m terminal benchmark output 0123456789 ABCDEF\r\n";
            let batch = line.repeat(200);
            let start = Instant::now();
            while start.elapsed() < Duration::from_secs(6) {
                stdout.write_all(batch.as_bytes())?;
                stdout.flush()?;
            }
            writeln!(stdout, "AH_STREAM_END")?;
            return stdout.flush();
        }
        writeln!(stdout, "AH_REPLY:{line}")?;
        stdout.flush()?;
    }
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let port = match args.next().as_deref() {
        Some("--stream") => return Ok(child(true)?),
        Some("--echo") => return Ok(child(false)?),
        Some(port) => port.parse::<u16>()?,
        None => 4183,
    };
    let mode = match args.next().as_deref() {
        Some("--baseline") => "combined",
        Some("--legacy-decode") => "legacy-decode",
        None => "bounded",
        Some(_) => anyhow::bail!("Usage: terminal_benchmark [port] [--baseline|--legacy-decode]"),
    };
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().app.windows.clear();
    let origin: tauri::Url = format!("http://127.0.0.1:{port}").parse()?;
    context.config_mut().build.dev_url = Some(origin.clone());
    let (window_ready, wait_for_window) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        if matches!(
            wait_for_window.recv_timeout(Duration::from_secs(20)),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout)
        ) {
            eprintln!("Native benchmark window did not open; use an interactive desktop session");
            std::process::exit(1);
        }
    });
    tauri::Builder::default()
        .manage(Arc::new(TerminalManager::default()))
        .manage(Arc::new(std::sync::Mutex::new(sysinfo::System::new())))
        .invoke_handler(tauri::generate_handler![
            benchmark_create,
            benchmark_finish,
            benchmark_host_cpu,
            app_lib::commands::terminal::terminal_ack,
            app_lib::commands::terminal::terminal_write,
            app_lib::commands::terminal::terminal_close
        ])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);
            let window = WebviewWindowBuilder::new(app, OWNER, WebviewUrl::App(PAGE[1..].into()))
                .title("AgentHub terminal benchmark")
                .inner_size(1100.0, 750.0)
                .incognito(true)
                .initialization_script(format!("globalThis.__terminalBenchMode = '{mode}';"))
                .on_navigation(move |url| url.origin() == origin.origin() && url.path() == PAGE)
                .build()?;
            #[cfg(target_os = "macos")]
            app.show()?;
            window.show()?;
            window.set_focus()?;
            let _ = window_ready.send(());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(60)).await;
                eprintln!("Terminal benchmark timed out");
                handle.state::<Arc<TerminalManager>>().close_all();
                handle.exit(1);
            });
            Ok(())
        })
        .run(context)?;
    Ok(())
}
