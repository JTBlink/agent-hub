use super::*;
#[test]
fn rejects_transfer_host_options_paths_and_batch_injection() {
    for target in [
        "",
        "-oProxyCommand=x",
        "host:/file",
        "host name",
        "host\nget x",
        "@host",
        "user@",
        "a@b@c",
    ] {
        assert!(validate_target(target).is_err());
    }
    for target in ["browser-host", "user@browser.example.invalid", "127.0.0.1"] {
        validate_target(target).unwrap();
    }
    assert!(quoted("a\nget secret").is_err());
    assert_eq!(
        quoted("a [*]? \"file\"").unwrap(),
        "\"a [*]? \\\"file\\\"\""
    );
}
#[test]
fn preserves_files_and_protects_active_transfer_history() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::shared(root.path().into());
    let job = Arc::new(Transfer::new());
    {
        let mut state = browsers.state.lock().unwrap();
        state.downloads.insert(
            "default:id".into(),
            Download {
                id: "id".into(),
                profile: "default".into(),
                state: "completed".into(),
                ..Download::default()
            },
        );
        state.transfers.insert("default:id".into(), job.clone());
    }
    assert!(browsers.forget_download("default", "id").is_err());
    browsers.cancel_transfer("default", "id").unwrap();
    assert_eq!(
        browsers.downloads().unwrap()[0]
            .transfer
            .as_ref()
            .unwrap()
            .state,
        "canceling"
    );
    *job.result.lock().unwrap() = Some(Err("canceled".into()));
    browsers.forget_download("default", "id").unwrap();
    assert!(browsers.state.lock().unwrap().transfers.is_empty());
}
#[cfg(unix)]
#[test]
fn refuses_symlink_download_directory() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("downloads")).unwrap();
    assert!(destination(root.path(), "default").is_err());
    assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0);
}

#[cfg(unix)]
mod native {
    use super::*;
    use std::{
        net::TcpListener,
        process::{Child, Stdio},
    };
    struct SshFixture {
        root: tempfile::TempDir,
        server: Child,
    }
    impl Drop for SshFixture {
        fn drop(&mut self) {
            let _ = self.server.kill();
            let _ = self.server.wait();
        }
    }
    impl SshFixture {
        fn start() -> Self {
            let root = tempfile::tempdir().unwrap();
            for name in ["host", "client"] {
                assert!(Command::new("/usr/bin/ssh-keygen")
                    .args(["-q", "-t", "ed25519", "-N", "", "-C", "fixture", "-f"])
                    .arg(root.path().join(name))
                    .status()
                    .unwrap()
                    .success());
            }
            std::fs::copy(
                root.path().join("client.pub"),
                root.path().join("authorized_keys"),
            )
            .unwrap();
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            drop(listener);
            let user =
                String::from_utf8(Command::new("id").arg("-un").output().unwrap().stdout).unwrap();
            let user = user.trim();
            let path = root.path().display();
            std::fs::write(root.path().join("sshd_config"), format!("Port {port}\nListenAddress 127.0.0.1\nHostKey {path}/host\nPidFile {path}/pid\nAuthorizedKeysFile {path}/authorized_keys\nStrictModes no\nUsePAM no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nPermitRootLogin prohibit-password\nAllowUsers {user}\nSubsystem sftp internal-sftp\nForceCommand internal-sftp\n")).unwrap();
            let public = std::fs::read_to_string(root.path().join("host.pub")).unwrap();
            let parts: Vec<_> = public.split_whitespace().collect();
            std::fs::write(
                root.path().join("known_hosts"),
                format!("[127.0.0.1]:{port} {} {}\n", parts[0], parts[1]),
            )
            .unwrap();
            std::fs::write(root.path().join("client_config"), format!("Host fixture\n HostName 127.0.0.1\n Port {port}\n User {user}\n IdentityFile {path}/client\n UserKnownHostsFile {path}/known_hosts\n StrictHostKeyChecking yes\n IdentitiesOnly yes\n")).unwrap();
            let server = Command::new("/usr/sbin/sshd")
                .args(["-D", "-e", "-f"])
                .arg(root.path().join("sshd_config"))
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let mut fixture = Self { root, server };
            for _ in 0..100 {
                assert!(
                    fixture.server.try_wait().unwrap().is_none(),
                    "Fixture SSH server exited"
                );
                if std::net::TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)).is_ok() {
                    return fixture;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            panic!("Fixture SSH server did not become ready");
        }
        fn command(&self, batch: &Path) -> Result<Command, String> {
            let original = sftp_command("fixture", batch)?;
            let mut command = Command::new(original.get_program());
            command
                .args(["-F"])
                .arg(self.root.path().join("client_config"))
                .args(original.get_args())
                .env("LC_ALL", "C");
            Ok(command)
        }
    }
    fn register(browsers: &Browsers, source: &Path, size: usize) -> (Download, Arc<Transfer>) {
        let item = Download {
            id: uuid::Uuid::new_v4().to_string(),
            profile: "default".into(),
            name: "report [*]? 文档.bin".into(),
            state: "completed".into(),
            received: size as f64,
            total: size as f64,
            remote: true,
            verified: true,
            source_runtime: "fixture".into(),
            remote_path: Some(source.to_string_lossy().into()),
            ..Download::default()
        };
        let job = Arc::new(Transfer::new());
        let key = format!("default:{}", item.id);
        let mut state = browsers.state.lock().unwrap();
        state.downloads.insert(key.clone(), item.clone());
        state.transfers.insert(key, job.clone());
        (item, job)
    }
    #[test]
    #[ignore = "requires local OpenSSH sshd and SFTP; creates an isolated ephemeral SSH server"]
    fn retrieves_binary_special_paths_and_cleans_canceled_failed_and_stale_copies() {
        let fixture = SshFixture::start();
        let root = tempfile::tempdir().unwrap();
        let browsers = Browsers::new(root.path().into());
        let source = fixture.root.path().join("source [*]? # \" 文档.bin");
        let bytes = b"binary\0\xff\n";
        std::fs::write(&source, bytes).unwrap();
        let (item, job) = register(&browsers, &source, bytes.len());
        let key = format!("default:{}", item.id);
        browsers
            .retrieve_using(&key, &item, &job, |batch| fixture.command(batch))
            .unwrap();
        assert_eq!(
            std::fs::read(browsers.download_path("default", &item.id).unwrap()).unwrap(),
            bytes
        );
        let directory = destination(root.path(), "default").unwrap();
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        let large = fixture.root.path().join("large.bin");
        std::fs::File::create(&large)
            .unwrap()
            .set_len(16 * 1024 * 1024)
            .unwrap();
        let (large_item, large_job) = register(&browsers, &large, 16 * 1024 * 1024);
        let large_key = format!("default:{}", large_item.id);
        std::thread::scope(|scope| {
            let worker = scope.spawn(|| {
                browsers.retrieve_using(&large_key, &large_item, &large_job, |batch| {
                    fixture.command(batch)
                })
            });
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            while large_job.received.load(Ordering::Relaxed) == 0
                && std::time::Instant::now() < deadline
            {
                std::thread::sleep(Duration::from_millis(20));
            }
            assert!(
                large_job.received.load(Ordering::Relaxed) > 0,
                "transfer never started"
            );
            large_job.cancel();
            assert_eq!(worker.join().unwrap().unwrap_err(), "canceled");
        });
        assert!(browsers.download_path("default", &large_item.id).is_err());
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        for mode in ["size", "missing", "canceled", "stale"] {
            let (mut item, job) = register(
                &browsers,
                &source,
                if mode == "size" { 1 } else { bytes.len() },
            );
            let key = format!("default:{}", item.id);
            if mode == "missing" {
                item.remote_path =
                    Some(fixture.root.path().join("missing").to_string_lossy().into());
            }
            if mode == "canceled" {
                job.cancel();
            }
            if mode == "stale" {
                browsers.state.lock().unwrap().downloads.remove(&key);
            }
            assert!(browsers
                .retrieve_using(&key, &item, &job, |batch| fixture.command(batch))
                .is_err());
            assert_eq!(
                std::fs::read_dir(&directory).unwrap().count(),
                1,
                "partial file survived {mode}"
            );
            assert!(browsers.download_path("default", &item.id).is_err());
        }
    }
}

#[cfg(unix)]
#[test]
fn reads_profile_only_with_the_configuration_transaction_lock() {
    let root = tempfile::tempdir().unwrap();
    // Invalid configuration would fail immediately if it were read before taking state.
    std::fs::write(root.path().join("profiles.json"), b"invalid").unwrap();
    let browsers = Arc::new(Browsers::new(root.path().into()));
    let transaction = browsers.state.lock().unwrap();
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::scope(|scope| {
        scope.spawn(|| {
            sender
                .send(browsers.fetch_download("default", "id").is_err())
                .unwrap();
        });
        assert!(matches!(
            receiver.recv_timeout(Duration::from_millis(100)),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout)
        ));
        std::fs::write(root.path().join("profiles.json"), b"[]").unwrap();
        drop(transaction);
        assert!(receiver.recv_timeout(Duration::from_secs(2)).unwrap());
    });
    assert!(browsers.state.lock().unwrap().transfers.is_empty());
}
