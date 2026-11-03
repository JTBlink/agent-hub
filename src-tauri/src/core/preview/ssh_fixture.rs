//! Ephemeral SSH fixture with isolated keys, known_hosts and server configuration.
use std::{
    net::TcpListener,
    process::{Child, Command, Stdio},
    time::Duration,
};
pub(super) struct SshFixture {
    pub root: tempfile::TempDir,
    server: Child,
}
impl Drop for SshFixture {
    fn drop(&mut self) {
        let _ = self.server.kill();
        let _ = self.server.wait();
    }
}
impl SshFixture {
    pub fn start() -> Self {
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
        std::fs::write(root.path().join("sshd_config"), format!("Port {port}\nListenAddress 127.0.0.1\nHostKey {path}/host\nPidFile {path}/pid\nAuthorizedKeysFile {path}/authorized_keys\nStrictModes no\nUsePAM no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nPermitRootLogin prohibit-password\nAllowUsers {user}\nAllowTcpForwarding yes\nGatewayPorts no\nSubsystem sftp internal-sftp\nForceCommand internal-sftp\n")).unwrap();
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
}
