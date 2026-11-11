//! Stage clipboard copies before publishing new entries without replacing user data.
use super::{existing_path, named_child, rename_without_replace};
use anyhow::{bail, Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn copy_into(root: &Path, relative: &str, sources: &[PathBuf]) -> Result<Vec<String>> {
    let destination = existing_path(root, relative)?;
    if !destination.is_dir() {
        bail!("Select a destination directory");
    }
    if sources.is_empty() {
        bail!("The clipboard contains no files. Copy files in your file manager first.");
    }
    if sources.len() > 4000 {
        bail!("Paste up to 4000 entries at a time");
    }
    let mut plan = Vec::new();
    for source in sources {
        let canonical = source
            .canonicalize()
            .context("A clipboard file is no longer available")?;
        if destination.starts_with(&canonical) {
            bail!("A directory cannot be pasted into itself or its descendants");
        }
        let name = source
            .file_name()
            .and_then(|name| name.to_str())
            .context("Clipboard entry must have a valid file name")?;
        let target = named_child(&destination, name)?;
        if plan.iter().any(|(_, existing)| existing == &target) {
            bail!("Clipboard entries have duplicate names");
        }
        plan.push((source, target));
    }
    // Same filesystem staging allows an atomic, non-replacing rename per entry.
    let staging = tempfile::Builder::new()
        .prefix(".agent-hub-paste-")
        .tempdir_in(&destination)?;
    let mut count = 0;
    for (index, (source, _)) in plan.iter().enumerate() {
        copy_entry(
            source,
            &staging.path().join(index.to_string()),
            0,
            &mut count,
        )?;
    }
    if existing_path(root, relative)? != destination {
        bail!("Destination directory changed; retry the paste");
    }
    let mut copied = Vec::new();
    for (index, (_, target)) in plan.iter().enumerate() {
        rename_without_replace(&staging.path().join(index.to_string()), target).with_context(
            || {
                format!(
                    "Paste stopped after {} entries; existing files were preserved",
                    copied.len()
                )
            },
        )?;
        copied.push(
            target
                .strip_prefix(root)?
                .to_string_lossy()
                .replace('\\', "/"),
        );
    }
    Ok(copied)
}

fn copy_entry(source: &Path, target: &Path, depth: usize, count: &mut usize) -> Result<()> {
    *count += 1;
    if *count > 100_000 || depth > 128 {
        bail!("Directory is too large or too deep; copy it in your file manager");
    }
    let metadata = fs::symlink_metadata(source)?;
    if crate::core::path_guard::is_link_or_reparse_point(&metadata)
        || source
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case(".git"))
    {
        bail!("Clipboard copies cannot contain symbolic links or Git metadata");
    }
    if metadata.is_dir() {
        fs::create_dir(target)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_entry(
                &entry.path(),
                &target.join(entry.file_name()),
                depth + 1,
                count,
            )?;
        }
    } else if metadata.is_file() {
        let mut input = fs::File::open(source)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)?;
        std::io::copy(&mut input, &mut output)?;
        fs::set_permissions(target, metadata.permissions())?;
    } else {
        bail!("Only regular files and directories can be pasted");
    }
    Ok(())
}

#[cfg(test)]
mod tests;
