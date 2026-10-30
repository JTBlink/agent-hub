//! One authority for supported launchd locations and runtime scope.
use super::*;

pub(super) struct Scope {
    pub root: PathBuf,
    pub owner: u32,
    pub domain: String,
    pub requires_admin: bool,
}

pub(super) fn system_root(path: &Path) -> bool {
    path == Path::new("/Library/LaunchAgents") || path == Path::new("/Library/LaunchDaemons")
}

impl Scope {
    pub fn resolve(path: &Path, home: &Path, uid: u32) -> Result<Self, String> {
        let root = path.parent().ok_or("Missing launchd scope")?;
        let user = root == home.join("Library/LaunchAgents");
        if !user && !system_root(root) {
            return Err("This launchd scope is read-only".into());
        }
        Ok(Self {
            root: root.into(),
            owner: if user { uid } else { 0 },
            domain: if root == Path::new("/Library/LaunchDaemons") {
                "system".into()
            } else {
                format!("gui/{uid}")
            },
            requires_admin: !user,
        })
    }
}

pub(super) struct Runtime {
    pub path: Option<String>,
    pub running: bool,
    pub exit: Option<String>,
}

pub(super) fn runtime(text: &str) -> Runtime {
    let field = |key: &str| {
        text.lines()
            .find_map(|line| line.trim().strip_prefix(key).map(str::to_owned))
    };
    Runtime {
        path: field("path = "),
        running: field("state = ").as_deref() == Some("running"),
        exit: field("last exit code = "),
    }
}

pub(super) fn observe(domain: &str, label: &str) -> Result<Option<Runtime>, String> {
    match read_command("/bin/launchctl", &["print", &format!("{domain}/{label}")]) {
        Ok(text) => Ok(Some(runtime(&text))),
        Err(error) if error.contains("Could not find service") => Ok(None),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn keeps_user_agents_and_system_jobs_in_their_own_domains() {
        let home = Path::new("/workspace/home");
        let user =
            Scope::resolve(&home.join("Library/LaunchAgents/audit.plist"), home, 501).unwrap();
        assert_eq!(user.domain, "gui/501");
        assert!(!user.requires_admin);
        let daemon =
            Scope::resolve(Path::new("/Library/LaunchDaemons/audit.plist"), home, 501).unwrap();
        assert_eq!(daemon.domain, "system");
        assert_eq!(daemon.owner, 0);
        assert!(daemon.requires_admin);
        let agent =
            Scope::resolve(Path::new("/Library/LaunchAgents/audit.plist"), home, 501).unwrap();
        assert_eq!(agent.domain, "gui/501");
        assert!(agent.requires_admin);
        for path in [
            "/System/Library/LaunchDaemons/audit.plist",
            "/Library/LaunchDaemons/nested/audit.plist",
            "/tmp/audit.plist",
        ] {
            assert!(Scope::resolve(Path::new(path), home, 501).is_err());
        }
    }
    #[test]
    fn reads_the_service_state_instead_of_nested_resource_states() {
        let observed = runtime("system/org.example.audit = {\n path = /Library/LaunchDaemons/audit.plist\n state = not running\n last exit code = 0\n resource = {\n state = active\n }\n}");
        assert!(!observed.running);
        assert_eq!(observed.exit.as_deref(), Some("0"));
        assert_eq!(
            observed.path.as_deref(),
            Some("/Library/LaunchDaemons/audit.plist")
        );
    }
}
