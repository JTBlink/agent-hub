//! Installation evidence is executable code, never settings or Skills directories.
use std::path::{Path, PathBuf};

struct InstallationProbe {
    bins: Vec<PathBuf>,
    apps: Vec<PathBuf>,
    extension_hosts: Vec<(bool, PathBuf)>,
}

fn executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn commands(key: &str) -> &[&str] {
    match key {
        "claude_code" => &["claude"],
        "omp_agent" => &["omp"],
        "gemini_cli" => &["gemini"],
        "github_copilot" => &["copilot"],
        "cursor" => &["cursor", "cursor-agent"],
        "qwen_code" => &["qwen"],
        "kilo_code" => &["kilo"],
        "mistral_vibe" => &["vibe"],
        "continue" => &["cn"],
        "gitlab_duo" => &[],
        _ => &[],
    }
}

fn apps(key: &str) -> &[&str] {
    match key {
        "cursor" => &["Cursor"],
        "windsurf" => &["Windsurf"],
        "trae" => &["Trae"],
        "trae_cn" => &["Trae CN"],
        "antigravity" => &["Antigravity"],
        "warp" => &["Warp"],
        "kiro" => &["Kiro"],
        "qoder" => &["Qoder"],
        "codebuddy" => &["CodeBuddy"],
        "workbuddy" => &["WorkBuddy"],
        "qclaw" => &["QClaw"],
        "easyclaw" => &["EasyClaw"],
        "autoclaw" => &["AutoClaw"],
        _ => &[],
    }
}

fn extensions(key: &str) -> &[&str] {
    match key {
        "github_copilot" => &["github.copilot", "github.copilot-chat"],
        "cline" => &["saoudrizwan.claude-dev"],
        "roo_code" => &["rooveterinaryinc.roo-cline"],
        "kilo_code" => &["kilocode.kilo-code"],
        "continue" => &["continue.continue"],
        "augment" => &["augment.vscode-augment"],
        "gitlab_duo" => &["gitlab.gitlab-workflow"],
        _ => &[],
    }
}

impl InstallationProbe {
    fn command(&self, name: &str) -> bool {
        if name.is_empty()
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return false;
        }
        self.bins.iter().any(|root| {
            #[cfg(windows)]
            {
                ["exe", "cmd", "bat", "com"]
                    .iter()
                    .any(|ext| executable(&root.join(format!("{name}.{ext}"))))
            }
            #[cfg(not(windows))]
            {
                executable(&root.join(name))
            }
        })
    }

    fn app(&self, name: &str) -> bool {
        self.apps.iter().any(|root| {
            #[cfg(target_os = "macos")]
            {
                let bundle = root.join(format!("{name}.app/Contents"));
                bundle.join("Info.plist").is_file()
                    && std::fs::read_dir(bundle.join("MacOS")).is_ok_and(|mut entries| {
                        entries.any(|entry| entry.is_ok_and(|entry| executable(&entry.path())))
                    })
            }
            #[cfg(windows)]
            {
                executable(&root.join(name).join(format!("{name}.exe")))
            }
            #[cfg(not(any(target_os = "macos", windows)))]
            {
                executable(&root.join(name).join(name))
            }
        })
    }

    fn extension(&self, ids: &[&str]) -> bool {
        if ids.is_empty() {
            return false;
        }
        self.extension_hosts.iter().any(|(installed, root)| {
            if !installed {
                return false;
            }
            let obsolete: serde_json::Value = std::fs::read(root.join(".obsolete"))
                .ok()
                .and_then(|data| serde_json::from_slice(&data).ok())
                .unwrap_or_default();
            std::fs::read_dir(root).is_ok_and(|mut entries| {
                entries.any(|entry| {
                    let Ok(entry) = entry else {
                        return false;
                    };
                    if obsolete
                        .get(entry.file_name().to_string_lossy().as_ref())
                        .and_then(|v| v.as_bool())
                        == Some(true)
                    {
                        return false;
                    }
                    let Ok(data) = std::fs::read(entry.path().join("package.json")) else {
                        return false;
                    };
                    let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(&data) else {
                        return false;
                    };
                    let (Some(publisher), Some(name)) =
                        (manifest["publisher"].as_str(), manifest["name"].as_str())
                    else {
                        return false;
                    };
                    let id = format!("{publisher}.{name}").to_ascii_lowercase();
                    ids.contains(&id.as_str())
                        && ["main", "browser"].iter().any(|field| {
                            manifest[field].as_str().is_some_and(|relative| {
                                let path = Path::new(relative);
                                !path.is_absolute()
                                    && !path
                                        .components()
                                        .any(|c| matches!(c, std::path::Component::ParentDir))
                                    && entry.path().join(path).is_file()
                            })
                        })
                })
            })
        })
    }

    fn installed(&self, key: &str) -> bool {
        let aliases = commands(key);
        (if aliases.is_empty() {
            self.command(key)
        } else {
            aliases.iter().any(|name| self.command(name))
        }) || apps(key).iter().any(|name| self.app(name))
            || self.extension(extensions(key))
    }

    fn system() -> Self {
        let mut bins: Vec<PathBuf> = std::env::var_os("PATH")
            .map(|path| std::env::split_paths(&path).collect())
            .unwrap_or_default();
        #[cfg(unix)]
        bins.extend(["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin"].map(PathBuf::from));
        let mut apps = Vec::new();
        #[cfg(target_os = "macos")]
        apps.push(PathBuf::from("/Applications"));
        #[cfg(windows)]
        for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(path) = std::env::var_os(key) {
                let root = PathBuf::from(path);
                apps.push(root.clone());
                apps.push(root.join("Programs"));
            }
        }
        let home = dirs::home_dir().unwrap_or_default();
        bins.extend(
            [
                ".local/bin",
                ".cargo/bin",
                ".opencode/bin",
                ".claude/local",
                ".bun/bin",
                ".npm-global/bin",
                ".volta/bin",
            ]
            .map(|path| home.join(path)),
        );
        #[cfg(target_os = "macos")]
        apps.push(home.join("Applications"));
        let mut probe = Self {
            bins,
            apps,
            extension_hosts: Vec::new(),
        };
        for (folder, command, app) in [
            (".vscode", "code", "Visual Studio Code"),
            (
                ".vscode-insiders",
                "code-insiders",
                "Visual Studio Code - Insiders",
            ),
            (".cursor", "cursor", "Cursor"),
            (".windsurf", "windsurf", "Windsurf"),
            (".wiscode", "wiscode", "WisCode"),
        ] {
            probe.extension_hosts.push((
                probe.command(command) || probe.app(app),
                home.join(folder).join("extensions"),
            ));
        }
        probe
    }
}

pub(super) fn is_installed(key: &str) -> bool {
    InstallationProbe::system().installed(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn probe(root: &Path) -> InstallationProbe {
        InstallationProbe {
            bins: vec![root.join("bin")],
            apps: vec![root.join("apps")],
            extension_hosts: vec![(true, root.join("extensions"))],
        }
    }
    fn write_executable(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "fixture").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
        }
    }
    #[test]
    fn settings_and_skills_are_not_installation_evidence() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join(".claude/skills/demo")).unwrap();
        fs::write(tmp.path().join(".claude/settings.json"), "{}").unwrap();
        fs::create_dir_all(tmp.path().join("bin/claude")).unwrap();
        assert!(!probe(tmp.path()).installed("claude_code"));
    }
    #[test]
    fn executable_alias_is_required_and_detected() {
        let tmp = tempfile::tempdir().unwrap();
        let cli = tmp.path().join(if cfg!(windows) {
            "bin/claude.cmd"
        } else {
            "bin/claude"
        });
        write_executable(&cli);
        assert!(probe(tmp.path()).installed("claude_code"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(cli, fs::Permissions::from_mode(0o644)).unwrap();
            assert!(!probe(tmp.path()).installed("claude_code"));
        }
        assert!(!probe(tmp.path()).installed("../claude"));
    }
    #[test]
    fn extension_requires_installed_host_identity_and_entrypoint_and_not_obsolete() {
        let tmp = tempfile::tempdir().unwrap();
        let mut probe = probe(tmp.path());
        let extension = tmp.path().join("extensions/copilot-fixture");
        fs::create_dir_all(&extension).unwrap();
        fs::write(
            extension.join("package.json"),
            r#"{"publisher":"GitHub","name":"copilot","main":"dist/extension.js"}"#,
        )
        .unwrap();
        assert!(!probe.installed("github_copilot"));
        fs::create_dir_all(extension.join("dist")).unwrap();
        fs::write(extension.join("dist/extension.js"), "fixture").unwrap();
        assert!(probe.installed("github_copilot"));
        probe.extension_hosts[0].0 = false;
        assert!(!probe.installed("github_copilot"));
        probe.extension_hosts[0].0 = true;
        fs::write(
            tmp.path().join("extensions/.obsolete"),
            r#"{"copilot-fixture":true}"#,
        )
        .unwrap();
        assert!(!probe.installed("github_copilot"));
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn desktop_bundle_needs_metadata_and_executable() {
        let tmp = tempfile::tempdir().unwrap();
        let bundle = tmp.path().join("apps/Cursor.app/Contents");
        fs::create_dir_all(&bundle).unwrap();
        fs::write(bundle.join("Info.plist"), "fixture").unwrap();
        assert!(!probe(tmp.path()).installed("cursor"));
        write_executable(&bundle.join("MacOS/Cursor"));
        assert!(probe(tmp.path()).installed("cursor"));
    }
}
