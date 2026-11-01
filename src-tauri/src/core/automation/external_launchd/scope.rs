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
mod tests;
