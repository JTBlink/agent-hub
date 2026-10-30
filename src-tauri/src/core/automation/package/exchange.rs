//! Bounded, portable directory/JSON interchange; import never runs package code.
use super::*;
use std::io::Write;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AutomationPackage {
    pub schema_version: u32,
    pub shell: String,
    pub draft: AutomationDraft,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hermes: Option<HermesScripts>,
}

pub(super) fn validate_path(path: &str) -> Result<(), String> {
    crate::core::path_guard::ensure_safe_skill_relative_path(path).map_err(|e| e.to_string())?;
    if !path.starts_with("scripts/") && !["README.md", "prompt.md", "herdr.json"].contains(&path) {
        return Err(
            "Task files must be under scripts/ or be README.md, prompt.md or herdr.json".into(),
        );
    }
    if path.split('/').any(|part| part.starts_with('.')) {
        return Err("Task package cannot import private or hidden files".into());
    }
    Ok(())
}

impl AutomationPackage {
    pub(super) fn validate(&mut self) -> Result<(), String> {
        self.validate_portable()?;
        if self.shell != super::super::command_shell() {
            return Err("Unsupported package version or shell for this computer".into());
        }
        Ok(())
    }

    fn validate_portable(&mut self) -> Result<(), String> {
        if self.schema_version != 1 || !["sh", "powershell"].contains(&self.shell.as_str()) {
            return Err("Unsupported task package version or shell".into());
        }
        if self.draft.script_dir.is_some() || self.draft.workdir.is_some() {
            return Err("Portable tasks cannot contain local script or project directories".into());
        }
        if self.draft.package_options.is_some() {
            return Err("Package requirements must be declared once at the top level".into());
        }
        for file in &self.draft.files {
            validate_path(&file.path)?;
        }
        if let Some(hermes) = &self.hermes {
            if self.draft.provider != super::super::Provider::Hermes
                || (hermes.no_agent && (hermes.script.is_none() || hermes.monitor_script.is_some()))
            {
                return Err("Invalid Hermes script configuration".into());
            }
            for path in [&hermes.script, &hermes.monitor_script]
                .into_iter()
                .flatten()
            {
                validate_path(path)?;
                if !path.starts_with("scripts/")
                    || !self.draft.files.iter().any(|file| file.path == *path)
                {
                    return Err("Hermes script must name a declared file under scripts/".into());
                }
            }
        }
        super::dependencies::validate(&self.dependencies)?;
        self.draft.validate()
    }
}

/// Preview only reads declared files; no extraction, setup hook or registration.
pub fn preview_package(source: &Path) -> Result<AutomationPackage, String> {
    read_package(source, true)
}

fn read_package(source: &Path, native_shell: bool) -> Result<AutomationPackage, String> {
    let manifest_file = !source.is_dir()
        && super::storage::json::<serde_json::Value>(source)?
            .get("files")
            .is_some();
    let mut package = if source.is_dir() || manifest_file {
        let directory = if source.is_dir() {
            source
        } else {
            source.parent().ok_or("Missing task package directory")?
        };
        super::storage::regular_directory(directory)?;
        let manifest: Manifest = super::storage::json(&if source.is_dir() {
            source.join("task.json")
        } else {
            source.to_path_buf()
        })?;
        let mut draft = manifest.draft;
        for relative in manifest.files {
            validate_path(&relative)?;
            let path = super::super::native::bundle_files::path(
                &directory.to_string_lossy(),
                &relative,
                false,
            )?;
            draft.files.push(super::super::AutomationScriptFile {
                path: relative,
                content: String::from_utf8(super::storage::bytes(&path)?)
                    .map_err(|e| e.to_string())?,
            });
        }
        AutomationPackage {
            schema_version: manifest.schema_version,
            shell: manifest.shell,
            draft,
            dependencies: manifest.dependencies,
            hermes: manifest.hermes,
        }
    } else {
        super::storage::json(source)?
    };
    if native_shell {
        package.validate()?;
    } else {
        package.validate_portable()?;
    }
    package.draft.enabled = false;
    Ok(package)
}

/// Cloud repositories use the same independent directory format as discovery.
/// Stable identity is portable; local receipts, bindings and runtime files are not.
pub(crate) fn write_backup_directory(
    backup: &super::super::backup::AutomationBackup,
    target: &Path,
) -> Result<(), String> {
    if !valid_id(&backup.id) {
        return Err("Invalid automation backup ID".into());
    }
    let mut draft = backup.draft.clone();
    draft.workdir = None;
    draft.script_dir = None;
    draft.enabled = false;
    let options = draft.package_options.take().unwrap_or(PackageOptions {
        dependencies: vec![],
        hermes: None,
    });
    if draft.provider == super::super::Provider::System {
        if super::super::native::shell_entry::entry(&draft).is_none() {
            super::super::native::shell_entry::wrap(&mut draft, &backup.shell);
        }
        normalize(&mut draft);
    }
    let mut package = AutomationPackage {
        schema_version: 1,
        shell: backup.shell.clone(),
        draft,
        dependencies: options.dependencies,
        hermes: options.hermes,
    };
    package.validate_portable()?;
    std::fs::create_dir(target).map_err(|e| e.to_string())?;
    let mut manifest = Manifest {
        schema_version: 1,
        instance_id: backup.id.clone(),
        shell: package.shell,
        draft: package.draft,
        files: vec![],
        dependencies: package.dependencies,
        hermes: package.hermes,
    };
    for file in std::mem::take(&mut manifest.draft.files) {
        let path = target.join(&file.path);
        std::fs::create_dir_all(path.parent().ok_or("Missing script parent")?)
            .map_err(|e| e.to_string())?;
        store::write(&path, file.content.as_bytes())?;
        manifest.files.push(file.path);
    }
    json_write(&target.join("task.json"), &manifest)
}

pub(crate) fn read_backup_directory(
    source: &Path,
) -> Result<super::super::backup::AutomationBackup, String> {
    let manifest: Manifest = super::storage::json(&source.join("task.json"))?;
    if !valid_id(&manifest.instance_id) {
        return Err("Invalid automation backup identity".into());
    }
    let mut package = read_package(source, false)?;
    package.draft.package_options = Some(PackageOptions {
        dependencies: package.dependencies,
        hermes: package.hermes,
    });
    Ok(super::super::backup::AutomationBackup {
        schema_version: 1,
        id: manifest.instance_id,
        shell: package.shell,
        draft: package.draft,
    })
}

/// Import allocates a new identity and remains uninstalled until install is requested.
pub fn import_package(source: &Path, workdir: Option<String>) -> Result<String, String> {
    import_definition(preview_package(source)?, workdir)
}

/// Import the exact already-previewed bytes, avoiding a source-file race.
pub fn import_definition(
    mut package: AutomationPackage,
    workdir: Option<String>,
) -> Result<String, String> {
    package.validate()?;
    package.draft.enabled = false;
    package.draft.workdir = workdir;
    package.draft.validate()?;
    super::lifecycle::create_with_hermes(
        &store::root(),
        package.draft,
        package.dependencies,
        package.hermes,
        false,
    )
}

/// A single JSON file contains portable intent and declared text files only.
pub fn export_package(id: &str, target: &Path) -> Result<(), String> {
    let state = store::root();
    let _lock = lock(&state, id)?;
    let record = find(&state, id)?;
    let path = checked(&state, &record)?;
    let manifest: Manifest = super::storage::json(&path.join("task.json"))?;
    let mut draft = record.draft;
    draft.script_dir = None;
    draft.workdir = None;
    draft.package_options = None;
    draft.enabled = false;
    let mut package = AutomationPackage {
        schema_version: 1,
        shell: manifest.shell,
        draft,
        dependencies: manifest.dependencies,
        hermes: manifest.hermes,
    };
    package.validate()?;
    if target.exists() {
        return Err("Export destination already exists; choose a new file".into());
    }
    let parent = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary
        .write_all(&serde_json::to_vec_pretty(&package).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    // The destination may have appeared after the dialog or existence check.
    temporary
        .persist_noclobber(target)
        .map_err(|e| format!("Cannot export without overwriting an existing file: {e}"))?;
    Ok(())
}

/// Normalize new templates/commands; legacy tasks keep their original layout.
pub(in crate::core::automation) fn normalize(draft: &mut AutomationDraft) {
    let entry = super::super::native::shell_entry::entry(draft).map(|f| f.path.clone());
    let mut replacements = Vec::new();
    for file in &draft.files {
        let name = file.path.rsplit('/').next().unwrap_or(&file.path);
        let new = if ["README.md", "prompt.md", "herdr.json"].contains(&name) {
            name.to_string()
        } else if file.path.starts_with("scripts/") {
            file.path.clone()
        } else {
            format!("scripts/{name}")
        };
        if new != file.path {
            replacements.push((file.path.clone(), new));
        }
    }
    for file in &mut draft.files {
        for (old, new) in &replacements {
            if file.path == *old {
                file.path = new.clone();
            }
            file.content = file.content.replace(
                &format!("AGENT_HUB_SCRIPT_DIR/{old}"),
                &format!("AGENT_HUB_SCRIPT_DIR/{new}"),
            );
        }
    }
    if let Some(entry) = entry {
        let path = replacements
            .iter()
            .find(|(old, _)| *old == entry)
            .map_or(entry.as_str(), |(_, new)| new);
        draft.content = super::super::native::shell_entry::command(path);
    } else if draft.provider == super::super::Provider::System {
        let shell = super::super::command_shell();
        let path = if shell == "powershell" {
            "scripts/run.ps1"
        } else {
            "scripts/run.sh"
        };
        let content = std::mem::replace(
            &mut draft.content,
            super::super::native::shell_entry::command(path),
        );
        if let Some(file) = draft.files.iter_mut().find(|file| file.path == path) {
            file.content = content;
        } else {
            draft.files.push(super::super::AutomationScriptFile {
                path: path.into(),
                content,
            });
        }
    }
    if !draft.files.iter().any(|f| f.path == "README.md") {
        draft.files.push(super::super::AutomationScriptFile { path: "README.md".into(),
            content: "# Automation task\n\nInstall and uninstall through AgentHub. Local state and logs are in `.local/`.\n".into() });
    }
}
