//! Import or adopt one project central version before publishing Agent entries.
use super::*;

struct PreparedCentral {
    directory: tempfile::TempDir,
    before: Option<String>,
    hash: String,
    reused: bool,
}

fn prepare_central(
    root: &Path,
    skill: &SkillRecord,
    name: &str,
    canonical: &str,
) -> Result<PreparedCentral> {
    let central = entries::path(root, canonical)?;
    let before = entries::fingerprint_entry(&central)?;
    let staged = tempfile::tempdir()?;
    let content = staged.path().join("content");
    let mut reused = false;
    if central.is_symlink() {
        let source = Path::new(&skill.central_path).canonicalize()?;
        if central.canonicalize()? != source {
            bail!("Existing project central link points to another source; existing files were preserved");
        }
        // Replace only the link entry; never write through to the personal source.
        transaction::copy_project_content(&source, &content)?;
        if fingerprint(&source)? != fingerprint(&content)? {
            bail!("Skill source changed while preparing project contents; retry");
        }
    } else if central.is_dir() {
        if !super::super::skill_metadata::is_valid_skill_dir(&central) {
            bail!(
                "Existing project central directory is not a Skill; existing files were preserved"
            );
        }
        transaction::copy_project_content(&central, &content)?;
        reused = true;
    } else if before.is_some() {
        bail!("Project central path is not a Skill directory; existing files were preserved");
    } else {
        installer::install_from_local_to_destination(
            Path::new(&skill.central_path),
            Some(name),
            &content,
        )?;
    }
    let hash = fingerprint(&content)?.context("Project central Skill is empty")?;
    if reused && fingerprint(&central)?.as_deref() != Some(&hash) {
        bail!("Project central content changed while preparing entries; retry");
    }
    Ok(PreparedCentral {
        directory: staged,
        before,
        hash,
        reused,
    })
}

pub(super) fn install_unlocked(
    root: &Path,
    lock: &ProjectLock,
    skill: &SkillRecord,
    targets: &[ToolAdapter],
    manifest: &mut ProjectManifest,
    name: &str,
    copy: bool,
) -> Result<()> {
    let canonical = format!("{LIBRARY}/{name}");
    let _source_lock =
        super::super::repo_lock::RepoLock::acquire_foreground("prepare project central Skill")?;
    let PreparedCentral {
        directory: staged,
        before,
        hash,
        reused,
    } = prepare_central(root, skill, name, &canonical)?;
    let content = staged.path().join("content");
    let paths = target_paths(root, name, targets)?;
    let mut entry = ProjectEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: skill.name.clone(),
        content_hash: hash.clone(),
        targets: paths.clone(),
        source: if reused { None } else { portable_source(skill) },
        disabled: false,
        disabled_targets: BTreeSet::new(),
        linked_targets: BTreeSet::new(),
        extra: BTreeMap::new(),
    };
    let mut publication = Publication::new(root)?;
    if reused {
        publication.observe(canonical.clone(), Some(hash.clone()));
    } else {
        publication.add(root, canonical.clone(), Some(&content), before.as_deref())?;
    }
    for path in unique_paths(paths.values()) {
        if path == canonical {
            continue;
        }
        let target = entries::path(root, &path)?;
        let baseline = entries::fingerprint_entry(&target)?;
        if target.is_symlink() {
            let belongs_to_project = entries::points_to(root, &path, &canonical);
            let matches_source = target.canonicalize().ok()
                == Path::new(&skill.central_path).canonicalize().ok()
                && target.canonicalize().ok().is_some_and(|source| {
                    fingerprint(&source).ok().flatten().as_deref() == Some(&hash)
                });
            if !belongs_to_project && !matches_source {
                bail!(
                    "Agent entry points to another source; existing files were preserved: {path}"
                );
            }
        } else {
            check_replace(root, &path, None, Some(&hash))?;
        }
        let linked = if copy {
            publication.add(root, path.clone(), Some(&content), baseline.as_deref())?;
            false
        } else {
            publication.add_link(
                root,
                path.clone(),
                &canonical,
                &content,
                baseline.as_deref(),
            )?
        };
        if linked {
            entry.linked_targets.extend(
                paths
                    .iter()
                    .filter(|(_, target)| **target == path)
                    .map(|(agent, _)| agent.clone()),
            );
        }
    }
    manifest.skills.insert(name.into(), entry);
    publish_manifest(root, lock, publication, manifest)
}

pub(super) fn linked_path(entry: &ProjectEntry, path: &str) -> bool {
    entry.targets.iter().any(|(agent, target)| {
        entry.linked_targets.contains(agent)
            && actual_target(
                target,
                entry.disabled || entry.disabled_targets.contains(agent),
            ) == path
    })
}

pub(super) fn publish_target(
    publication: &mut Publication,
    root: &Path,
    entry: &mut ProjectEntry,
    path: String,
    canonical: &str,
    content: &Path,
    baseline: Option<&str>,
) -> Result<()> {
    if path != canonical && (linked_path(entry, &path) || entries::path(root, &path)?.is_symlink())
    {
        let linked = publication.add_link(root, path.clone(), canonical, content, baseline)?;
        for (agent, target) in &entry.targets {
            if actual_target(
                target,
                entry.disabled || entry.disabled_targets.contains(agent),
            ) == path
            {
                if linked {
                    entry.linked_targets.insert(agent.clone());
                } else {
                    entry.linked_targets.remove(agent);
                }
            }
        }
    } else {
        publication.add(root, path, Some(content), baseline)?;
    }
    Ok(())
}
