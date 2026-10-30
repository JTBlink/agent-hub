use super::*;
use sha2::{Digest, Sha256};
use std::{fs, io::Read};

pub(super) fn regular_directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_dir() || crate::core::path_guard::is_link_or_reparse_point(&metadata) {
        return Err("Task package directories cannot be links or junctions".into());
    }
    Ok(())
}

pub(super) fn bytes(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file()
        || metadata.len() > 512 * 1024
        || crate::core::path_guard::is_link_or_reparse_point(&metadata)
    {
        return Err("Task package entries must be regular files up to 512 KiB".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(512 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 512 * 1024 {
        return Err("Task package entry is too large".into());
    }
    Ok(bytes)
}

pub(super) fn json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    serde_json::from_slice(&bytes(path)?).map_err(|e| format!("Invalid task package JSON: {e}"))
}

pub(in crate::core::automation) fn fingerprint(draft: &AutomationDraft) -> Result<String, String> {
    let mut portable = draft.clone();
    portable.script_dir = None;
    // Local bindings also invalidate an open editor, but never enter task.json.
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&portable).map_err(|e| e.to_string())?)
    ))
}

pub(in crate::core::automation) fn read(path: &Path) -> Result<ManagedAutomation, String> {
    regular_directory(path)?;
    regular_directory(&path.join(".local"))?;
    let receipt: Receipt = json(&path.join(".local/receipt.json"))?;
    if ["updating", "update_failed"].contains(&receipt.state.as_str()) {
        let snapshot: UpdateSnapshot = json(&path.join(".local/operation.json"))?;
        if snapshot.record.draft.script_dir.as_deref() != Some(path.to_string_lossy().as_ref())
            || !valid_id(&snapshot.record.id)
        {
            return Err("Interrupted update has an invalid recovery journal".into());
        }
        return Ok(snapshot.record);
    }
    let manifest: Manifest = json(&path.join("task.json"))?;
    if manifest.schema_version != 1
        || !valid_id(&manifest.instance_id)
        || !["sh", "powershell"].contains(&manifest.shell.as_str())
        || !manifest.draft.files.is_empty()
        || manifest.draft.script_dir.is_some()
        || manifest.draft.workdir.is_some()
        || manifest.draft.package_options.is_some()
    {
        return Err("Unsupported task package or nonportable manifest".into());
    }
    let mut draft = manifest.draft;
    for relative in manifest.files {
        super::exchange::validate_path(&relative)?;
        let file =
            super::super::native::bundle_files::path(&path.to_string_lossy(), &relative, false)?;
        draft.files.push(super::super::AutomationScriptFile {
            path: relative,
            content: String::from_utf8(bytes(&file)?).map_err(|e| e.to_string())?,
        });
    }
    draft.script_dir = Some(path.to_string_lossy().into_owned());
    draft.workdir = json::<Binding>(&path.join(".local/binding.json"))?.workdir;
    if manifest.version.is_some() || !manifest.dependencies.is_empty() || manifest.hermes.is_some()
    {
        draft.package_options = Some(PackageOptions {
            version: manifest.version.clone(),
            dependencies: manifest.dependencies.clone(),
            hermes: manifest.hermes.clone(),
        });
    }
    let mut portable = draft.clone();
    portable.package_options = None;
    portable.workdir = None;
    portable.script_dir = None;
    super::exchange::AutomationPackage {
        version: manifest.version,
        schema_version: manifest.schema_version,
        shell: manifest.shell,
        draft: portable,
        dependencies: manifest.dependencies,
        hermes: manifest.hermes,
    }
    .validate()?;
    if draft
        .workdir
        .as_ref()
        .is_some_and(|p| !Path::new(p).is_absolute())
    {
        return Err("Task project binding must be an absolute path".into());
    }
    let observed = fingerprint(&draft)?;
    let revision = if observed != receipt.fingerprint {
        // Opaque and exactly representable in JavaScript. Two uncommitted file
        // edits must not both appear as receipt.revision + 1 to open editors.
        u64::from_str_radix(&observed[..13], 16).map_err(|e| e.to_string())?
    } else {
        receipt.revision
    };
    Ok(ManagedAutomation {
        id: manifest.instance_id,
        revision,
        draft,
        source: receipt.source,
        identifier: receipt.identifier,
        location: receipt.location,
    })
}

pub(in crate::core::automation) fn discover(state: &Path) -> (Vec<ManagedAutomation>, Vec<String>) {
    let root = root(state);
    let mut records = Vec::new();
    let mut errors = Vec::new();
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return (records, errors),
        Err(e) => return (records, vec![format!("Cannot read task packages: {e}")]),
    };
    if let Err(error) = regular_directory(&root) {
        return (records, vec![error]);
    }
    let mut ids = std::collections::HashSet::new();
    for entry in entries {
        let result = (|| {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            // Only direct, nonlinked folders containing a manifest are packages.
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir()
                || !path.join("task.json").exists()
            {
                return Ok(None);
            }
            let record =
                read(&path).map_err(|e| format!("{}: {e}", entry.file_name().to_string_lossy()))?;
            if super::receipt(&record)?.archived {
                return Ok(None);
            }
            Ok(Some(record))
        })();
        match result {
            Ok(Some(record)) if ids.insert(record.id.clone()) => records.push(record),
            Ok(Some(record)) => {
                records.retain(|r| r.id != record.id);
                errors.push(format!("Duplicate task package instance: {}", record.id));
            }
            Ok(None) => {}
            Err(error) => errors.push(error),
        }
    }
    (records, errors)
}

pub(in crate::core::automation) fn write_receipt(
    record: &ManagedAutomation,
    receipt: &Receipt,
) -> Result<(), String> {
    let path = directory(record).ok_or("Missing task package")?;
    regular_directory(&path)?;
    regular_directory(&path.join(".local"))?;
    json_write(&path.join(".local/receipt.json"), receipt)
}

pub(super) fn materialize(
    record: &ManagedAutomation,
    dependencies: Vec<Dependency>,
    hermes: Option<HermesScripts>,
) -> Result<(), String> {
    let path = directory(record)
        .or_else(|| record.draft.script_dir.as_ref().map(PathBuf::from))
        .ok_or("Missing task package directory")?;
    regular_directory(&path)?;
    let mut draft = record.draft.clone();
    json_write(
        &path.join(".local/binding.json"),
        &Binding {
            workdir: draft.workdir.clone(),
        },
    )?;
    let mut files = Vec::new();
    for file in &draft.files {
        super::exchange::validate_path(&file.path)?;
        let target =
            super::super::native::bundle_files::path(&path.to_string_lossy(), &file.path, true)?;
        json_write_guard(&target)?;
        store::write(&target, file.content.as_bytes())?;
        files.push(file.path.clone());
    }
    draft.files.clear();
    draft.package_options = None;
    draft.script_dir = None;
    draft.workdir = None;
    json_write(
        &path.join("task.json"),
        &Manifest {
            version: record
                .draft
                .package_options
                .as_ref()
                .and_then(|options| options.version.clone()),
            schema_version: 1,
            instance_id: record.id.clone(),
            shell: super::super::command_shell().into(),
            draft,
            files,
            dependencies,
            hermes,
        },
    )
}

fn json_write_guard(path: &Path) -> Result<(), String> {
    if fs::symlink_metadata(path)
        .is_ok_and(|m| crate::core::path_guard::is_link_or_reparse_point(&m))
    {
        return Err("Task package files cannot be links or junctions".into());
    }
    Ok(())
}
