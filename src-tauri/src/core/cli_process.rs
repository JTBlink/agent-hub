use std::{
    io::Read,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

/// Fixed read-only commands use file-backed output to avoid pipe deadlocks.
/// A deadline bounds unavailable schedulers and non-responsive local services.
pub(crate) fn read_command(program: &str, args: &[&str]) -> Result<String, String> {
    command(program, args, &[])
}

pub(crate) fn command(
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
) -> Result<String, String> {
    command_with_timeout(program, args, env, 15)
}

pub(crate) fn command_with_timeout(
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
    timeout_seconds: u64,
) -> Result<String, String> {
    run(program, args, env, timeout_seconds, None, None)
}

pub(crate) fn run(
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
    timeout_seconds: u64,
    cwd: Option<&std::path::Path>,
    cancel: Option<&std::sync::atomic::AtomicBool>,
) -> Result<String, String> {
    capture(program, args, env, timeout_seconds, cwd, cancel).map(|output| output.0)
}

/// Capture both streams: authentication status is written to stderr by some CLIs.
pub(crate) fn capture(
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
    timeout_seconds: u64,
    cwd: Option<&std::path::Path>,
    cancel: Option<&std::sync::atomic::AtomicBool>,
) -> Result<(String, String), String> {
    let mut stdout = tempfile::tempfile().map_err(|e| e.to_string())?;
    let mut stderr = tempfile::tempfile().map_err(|e| e.to_string())?;
    let mut command = Command::new(program);
    command
        .args(args)
        .envs(env.iter().copied())
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(stdout.try_clone().map_err(|e| e.to_string())?)
        .stderr(stderr.try_clone().map_err(|e| e.to_string())?);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let mut child = command.spawn().map_err(|e| format!("{program}: {e}"))?;
    let started = Instant::now();
    let status = loop {
        if cancel.is_some_and(|flag| flag.load(std::sync::atomic::Ordering::Acquire)) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Query cancelled".into());
        }
        if cancel.is_some()
            && (stdout.metadata().map_err(|e| e.to_string())?.len() > 4 * 1024 * 1024
                || stderr.metadata().map_err(|e| e.to_string())?.len() > 4 * 1024 * 1024)
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Query output exceeds 4 MiB".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < Duration::from_secs(timeout_seconds) => {
                std::thread::sleep(Duration::from_millis(30))
            }
            result => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(match result {
                    Err(e) => format!("{program}: {e}"),
                    _ => format!("{program}: query timed out"),
                });
            }
        }
    };
    use std::io::{Seek, SeekFrom};
    let read = |file: &mut std::fs::File| -> Result<String, String> {
        if file.metadata().map_err(|e| e.to_string())?.len() > 4 * 1024 * 1024 {
            return Err(format!("{program}: query output exceeds 4 MiB"));
        }
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        let mut output = String::new();
        file.read_to_string(&mut output)
            .map_err(|e| e.to_string())?;
        Ok(output.trim_start_matches('\u{feff}').to_string())
    };
    if status.success() {
        Ok((read(&mut stdout)?, read(&mut stderr)?))
    } else {
        let error = read(&mut stderr)?;
        Err(format!(
            "{program}: {}",
            if error.trim().is_empty() {
                status.to_string()
            } else {
                error.trim().to_string()
            }
        ))
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn captures_auth_status_on_stderr_without_polluting_api_json() {
        let args = [
            "-c",
            "printf '{\"login\":\"demo\"}'; printf 'Logged in to github.example.invalid' >&2",
        ];
        let (stdout, stderr) = capture("sh", &args, &[], 5, None, None).unwrap();
        assert_eq!(stdout, "{\"login\":\"demo\"}");
        assert_eq!(stderr, "Logged in to github.example.invalid");
        assert_eq!(run("sh", &args, &[], 5, None, None).unwrap(), stdout);
    }
}
