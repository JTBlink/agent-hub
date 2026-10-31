#[cfg(unix)]
pub(super) fn terminate_owned_session(pty: &dyn portable_pty::MasterPty, leader: u32) {
    let leader = leader as libc::pid_t;
    // Restrict enumeration to this still-owned PTY. A new session (for example a
    // detached Herdr daemon) is deliberately excluded even if it was a child.
    if let Some(tty) = pty.tty_name().map(|path| {
        path.strip_prefix("/dev")
            .map(std::path::PathBuf::from)
            .unwrap_or(path)
    }) {
        if let Ok(output) = std::process::Command::new("/bin/ps")
            .args(["-t", &tty.to_string_lossy(), "-o", "pid="])
            .output()
        {
            if output.status.success() {
                for pid in String::from_utf8_lossy(&output.stdout)
                    .split_whitespace()
                    .filter_map(|word| word.parse::<libc::pid_t>().ok())
                {
                    // Safety: the PTY remains open and getsid verifies the owned
                    // session immediately before signalling a positive PID.
                    unsafe {
                        if pid > 1 && pid != leader && libc::getsid(pid) == leader {
                            libc::kill(pid, libc::SIGKILL);
                        }
                    }
                }
            }
        }
    }
    unsafe {
        if libc::getsid(leader) == leader {
            libc::kill(-leader, libc::SIGKILL);
        }
    }
}
