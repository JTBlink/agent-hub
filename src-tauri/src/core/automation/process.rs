use std::{
    io::Read,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

/// Fixed read-only commands use file-backed output to avoid pipe deadlocks.
/// A deadline bounds unavailable schedulers and non-responsive local services.
pub(super) fn read_command(program: &str, args: &[&str]) -> Result<String, String> {
    command(program, args, &[])
}

pub(super) fn command(
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
) -> Result<String, String> {
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
    let mut child = command.spawn().map_err(|e| format!("{program}: {e}"))?;
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < Duration::from_secs(15) => {
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
        read(&mut stdout)
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
