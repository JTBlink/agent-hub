//! Vite project previews run in owned terminal panes; ordinary HTML stays static.
use anyhow::{bail, Context, Result};
use portable_pty::CommandBuilder;
use serde::{Deserialize, Serialize};
use std::{
    net::TcpListener,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

#[derive(Clone, Deserialize, Serialize)]
pub struct DevelopmentLaunch {
    pub relative_path: String,
    pub port: u16,
}
#[derive(Serialize)]
pub struct DevelopmentPlan {
    pub directory: String,
    pub url: String,
    pub running: bool,
    pub launch: DevelopmentLaunch,
}

fn package_directory(root: &Path, relative: &str) -> Result<Option<PathBuf>> {
    let path = crate::core::project_file_actions::existing_path(root, relative)?;
    if !path.is_file()
        || !path
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case("html") || s.eq_ignore_ascii_case("htm"))
    {
        return Ok(None);
    }
    let mut directory = path.parent();
    while let Some(current) = directory.filter(|path| path.starts_with(root)) {
        let package = current.join("package.json");
        if package.exists() {
            let text = crate::core::project_worktrees::read_file(
                root,
                &package.strip_prefix(root)?.to_string_lossy(),
            )?;
            let value: serde_json::Value = serde_json::from_str(&text)?;
            // Only explicit Vite dev scripts accept the controlled host/port arguments below.
            return Ok(value["scripts"]["dev"]
                .as_str()
                .filter(|script| script.split_whitespace().next() == Some("vite"))
                .map(|_| current.to_path_buf()));
        }
        directory = current.parent();
    }
    Ok(None)
}

fn client() -> Result<reqwest::blocking::Client> {
    Ok(reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_millis(500))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}
fn ready(client: &reqwest::blocking::Client, port: u16) -> bool {
    client
        .get(format!("http://127.0.0.1:{port}/@vite/client"))
        .send()
        .is_ok_and(|response| response.status().is_success())
}

/// Match the process working directory before inspecting its listening ports.
fn running_port(directory: &Path) -> Result<Option<u16>> {
    use sysinfo::{ProcessRefreshKind, System, UpdateKind};
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessRefreshKind::new()
            .with_cmd(UpdateKind::Always)
            .with_cwd(UpdateKind::Always),
    );
    let client = client()?;
    for process in system.processes().values().filter(|process| {
        process.cwd().and_then(|p| p.canonicalize().ok()).as_deref() == Some(directory)
            && process
                .cmd()
                .iter()
                .any(|arg| arg.replace('\\', "/").contains("vite"))
    }) {
        #[cfg(unix)]
        let ports = {
            let output = std::process::Command::new("lsof")
                .args([
                    "-a",
                    "-p",
                    &process.pid().to_string(),
                    "-iTCP",
                    "-sTCP:LISTEN",
                    "-Fn",
                ])
                .output()
                .context("Cannot inspect development server ports (lsof required)")?;
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| {
                    line.strip_prefix('n')?
                        .rsplit(':')
                        .next()?
                        .parse::<u16>()
                        .ok()
                })
                .collect::<Vec<_>>()
        };
        #[cfg(windows)]
        let ports = {
            let output = std::process::Command::new("netstat")
                .args(["-ano", "-p", "tcp"])
                .output()?;
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| {
                    let fields: Vec<_> = line.split_whitespace().collect();
                    if fields.len() != 5
                        || fields[4] != process.pid().to_string()
                        || fields[3] != "LISTENING"
                    {
                        return None;
                    }
                    fields[1].rsplit(':').next()?.parse::<u16>().ok()
                })
                .collect::<Vec<_>>()
        };
        for port in ports {
            if ready(&client, port) {
                return Ok(Some(port));
            }
        }
    }
    Ok(None)
}

pub fn plan(root: &Path, relative: &str) -> Result<Option<DevelopmentPlan>> {
    let root = root.canonicalize()?;
    let Some(directory) = package_directory(&root, relative)? else {
        return Ok(None);
    };
    let running = running_port(&directory)?;
    let port = match running {
        Some(port) => port,
        None => TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port(),
    };
    let path = crate::core::project_file_actions::existing_path(&root, relative)?;
    let suffix = path
        .strip_prefix(&directory)?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(Some(DevelopmentPlan {
        directory: directory.to_string_lossy().into_owned(),
        url: format!(
            "http://127.0.0.1:{port}/{}",
            super::documents::resource_path(&suffix)
        ),
        running: running.is_some(),
        launch: DevelopmentLaunch {
            relative_path: relative.into(),
            port,
        },
    }))
}

pub fn command(root: &Path, launch: &DevelopmentLaunch) -> Result<(PathBuf, CommandBuilder)> {
    if launch.port < 1024 {
        bail!("Invalid development server port");
    }
    let directory = package_directory(root, &launch.relative_path)?
        .context("No supported Vite development script found")?;
    let manager = if directory.join("pnpm-lock.yaml").is_file() {
        "pnpm"
    } else if directory.join("yarn.lock").is_file() {
        "yarn"
    } else if directory.join("bun.lock").is_file() || directory.join("bun.lockb").is_file() {
        "bun"
    } else {
        "npm"
    };
    #[cfg(windows)]
    let mut command = {
        if manager == "bun" {
            CommandBuilder::new("bun")
        } else {
            let mut command = CommandBuilder::new("cmd.exe");
            command.args(["/d", "/c", &format!("{manager}.cmd")]);
            command
        }
    };
    #[cfg(not(windows))]
    let mut command = CommandBuilder::new(manager);
    command.args(["run", "dev"]);
    if manager == "npm" {
        command.arg("--");
    }
    command.args([
        "--host",
        "127.0.0.1",
        "--port",
        &launch.port.to_string(),
        "--strictPort",
    ]);
    command.env("TERM", "xterm-256color");
    Ok((directory, command))
}

pub fn wait(port: u16) -> Result<()> {
    if port < 1024 {
        bail!("Invalid development server port");
    }
    let client = client()?;
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if ready(&client, port) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    bail!("Development server did not become ready within 30 seconds; check its terminal output")
}

#[cfg(test)]
mod tests;
