//! Only task-private environments are installed. Existing tools are borrowed.
use super::*;
use sha2::{Digest, Sha256};

pub(super) fn validate(dependencies: &[Dependency]) -> Result<(), String> {
    if dependencies.len() > 16 {
        return Err("Too many task dependencies".into());
    }
    for dependency in dependencies {
        match dependency {
            Dependency::Command { name }
                if !name.is_empty()
                    && name.len() <= 100
                    && name
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c)) => {}
            Dependency::Python { packages }
                if packages.len() <= 64
                    && packages.iter().all(|p| {
                        p.split_once("==").is_some_and(|(name, version)| {
                            !name.is_empty()
                                && !version.is_empty()
                                && !name.starts_with('-')
                                && p.len() <= 160
                                && name
                                    .bytes()
                                    .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
                                && version
                                    .bytes()
                                    .all(|c| c.is_ascii_alphanumeric() || b".+!-_".contains(&c))
                        })
                    }) => {}
            _ => {
                return Err(
                    "Dependencies require command names or exact Python name==version pins".into(),
                )
            }
        }
    }
    if dependencies
        .iter()
        .filter(|d| matches!(d, Dependency::Python { .. }))
        .count()
        > 1
    {
        return Err("Declare Python dependencies in a single environment".into());
    }
    Ok(())
}

pub(super) fn prepare(path: &Path, dependencies: &[Dependency]) -> Result<(), String> {
    validate(dependencies)?;
    for dependency in dependencies {
        match dependency {
            Dependency::Command { name } => {
                if crate::core::tool_detection::find_command(name).is_none() {
                    return Err(format!("Required external command is missing: {name}"));
                }
            }
            Dependency::Python { packages } => {
                let python = super::super::native::python_runtime()?;
                let env = path.join(".local/env");
                let manifest: Manifest = super::storage::json(&path.join("task.json"))?;
                let owner = path.join(".local/env-owner.json");
                if owner.exists() {
                    let id: String = super::storage::json(&owner)?;
                    if id != manifest.instance_id {
                        return Err("Python environment belongs to another task".into());
                    }
                    if !env.exists() {
                        std::fs::create_dir(&env).map_err(|e| e.to_string())?;
                    }
                    super::storage::regular_directory(&env)?;
                } else if env.symlink_metadata().is_ok() {
                    return Err(
                        "Python environment has no ownership receipt; files were preserved".into(),
                    );
                } else {
                    // Record intent before creating a private environment, so a
                    // killed installer can recognize and repair a partial venv.
                    json_write(&owner, &manifest.instance_id)?;
                    std::fs::create_dir(&env).map_err(|e| e.to_string())?;
                }
                let version =
                    super::super::process::read_command(&python.to_string_lossy(), &["--version"])?;
                let key = format!(
                    "{:x}",
                    Sha256::digest(
                        serde_json::to_vec(&(packages, version)).map_err(|e| e.to_string())?
                    )
                );
                let environment = env.join(key);
                if !environment.exists() {
                    std::fs::create_dir(&environment).map_err(|e| e.to_string())?;
                }
                super::storage::regular_directory(&environment)?;
                let interpreter = environment.join(if cfg!(windows) {
                    "Scripts/python.exe"
                } else {
                    "bin/python"
                });
                if !interpreter.exists() {
                    super::super::process::command_with_timeout(
                        &python.to_string_lossy(),
                        &["-m", "venv", &environment.to_string_lossy()],
                        &[],
                        300,
                    )?;
                }
                let stamp = environment.join(".agent-hub-packages.json");
                if !packages.is_empty()
                    && super::storage::json::<Vec<String>>(&stamp).ok().as_ref() != Some(packages)
                {
                    let mut args = vec![
                        "-m",
                        "pip",
                        "install",
                        "--disable-pip-version-check",
                        "--no-input",
                    ];
                    args.extend(packages.iter().map(String::as_str));
                    super::super::process::command_with_timeout(
                        &interpreter.to_string_lossy(),
                        &args,
                        &[],
                        600,
                    )?;
                }
                json_write(&stamp, packages)?;
                let marker = path.join(".local/python-path");
                store::write(&marker, interpreter.to_string_lossy().as_bytes())?;
            }
        }
    }
    Ok(())
}

pub(super) fn cleanup(path: &Path) -> Result<(), String> {
    // This fixed directory is created exclusively by prepare, never a global interpreter.
    let local = path.join(".local");
    let owner = local.join("env-owner.json");
    if local.join("env").exists() {
        let id: String = super::storage::json(&owner)
            .map_err(|_| "Python environment has no ownership receipt; files were preserved")?;
        let manifest: Manifest = super::storage::json(&path.join("task.json"))?;
        if id != manifest.instance_id {
            return Err("Python environment ownership changed; files were preserved".into());
        }
    }
    for name in ["env", "python-path"] {
        let target = local.join(name);
        super::super::output::checked(&local, &target)?;
        match std::fs::symlink_metadata(&target) {
            Ok(metadata) if crate::core::path_guard::is_link_or_reparse_point(&metadata) => {
                return Err("Dependency environment cannot be a link or junction".into())
            }
            Ok(metadata) if metadata.is_dir() => std::fs::remove_dir_all(target),
            Ok(_) => std::fs::remove_file(target),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        }
        .map_err(|e| e.to_string())?;
    }
    if owner.exists() {
        std::fs::remove_file(owner).map_err(|e| e.to_string())?;
    }
    Ok(())
}
