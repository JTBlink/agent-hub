//! Rename a managed skill without reinstalling it or creating a second source.
use anyhow::{bail, Context, Result};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use super::{
    audit_log::AuditDraft,
    central_repo, content_hash, path_guard,
    repo_lock::RepoLock,
    skill_metadata,
    skill_store::{SkillRecord, SkillStore, SkillTargetRecord},
    sync_engine::{self, ReplacePolicy, TargetState},
    sync_metadata,
};

struct Deployment {
    record: SkillTargetRecord,
    old: PathBuf,
    new: PathBuf,
    direct: bool,
    retained: Option<tempfile::TempDir>,
    published: bool,
}

/// Move the library directory, refresh existing deployments and preserve its ID.
pub fn rename_skill(store: &SkillStore, id: &str, new_name: &str) -> Result<()> {
    let name = new_name.trim();
    if name.is_empty() || name.chars().any(char::is_control) {
        bail!("技能名称不能为空或包含控制字符");
    }
    let slug = skill_metadata::sanitize_skill_name(name).context("无效的技能名称")?;
    let _lock = RepoLock::acquire_foreground("rename skill")?;
    let mut skill = store.get_skill_by_id(id)?.context("技能不存在")?;
    if skill.name == name {
        return sync_metadata::ensure_skill_metadata_unlocked(store, id);
    }
    let old = Path::new(&skill.central_path);
    let library = central_repo::skills_dir();
    if old == library
        || !sync_engine::is_library_entry(old)
        || !path_guard::is_path_safe(&library, old)
        || sync_engine::classify_target(old, None)? != TargetState::RealDir
    {
        bail!("只能重命名技能库内的实际技能目录");
    }
    let new = old.parent().context("技能目录没有父目录")?.join(slug);
    if new != old && sync_engine::classify_target(&new, None)? != TargetState::Absent {
        bail!("目标目录已存在：{}", new.display());
    }
    if let Some(existing) = store.get_skill_by_central_path(&new.to_string_lossy())? {
        if existing.id != skill.id {
            bail!("目标目录已由其他技能登记");
        }
    }
    // A source may be a managed agent link back to this very directory.
    // Preserve one authority instead of leaving an old alias as a missing source.
    if matches!(skill.source_type.as_str(), "local" | "import")
        && skill
            .source_ref
            .as_deref()
            .and_then(|p| Path::new(p).canonicalize().ok())
            == Some(old.canonicalize()?)
    {
        skill.source_ref = Some(skill.central_path.clone());
    }
    let mut deployments = plan_deployments(store, &skill, &new)?;
    let originals = read_skill_markers(old)?;
    super::file_watcher::mute_self_writes(old);
    super::file_watcher::mute_self_writes(&new);
    if old != new {
        fs::rename(old, &new).context("无法移动技能目录")?;
    }
    let result = publish(store, &skill, name, &new, &mut deployments);
    if let Err(error) = result {
        if let Err(recovery) = rollback(old, &new, &originals, &mut deployments) {
            bail!("改名失败：{error}；恢复未完成：{recovery}");
        }
        return Err(error.context("改名失败，已恢复原技能和部署入口"));
    }
    // DB is committed. Metadata failure is reported, and retrying the same name
    // above repairs it without repeating filesystem mutations.
    sync_metadata::ensure_skill_metadata_unlocked(store, id)
        .context("技能已改名，备份元数据未写入；请重试同一改名命令")?;
    store.log_audit(AuditDraft::new("rename").skill(id, name).ok());
    Ok(())
}

fn plan_deployments(
    store: &SkillStore,
    skill: &SkillRecord,
    new: &Path,
) -> Result<Vec<Deployment>> {
    let old = Path::new(&skill.central_path);
    let all_targets = store.get_all_targets()?;
    let mut destinations = HashSet::new();
    let mut plans = Vec::new();
    for record in store.get_targets_for_skill(&skill.id)? {
        let target = PathBuf::from(&record.target_path);
        let direct = target == old;
        let destination = if direct {
            new.to_owned()
        } else {
            let parent = target.parent().context("部署目录没有父目录")?;
            parent.join(new.file_name().context("无效的技能目录")?)
        };
        if !destinations.insert(destination.clone()) {
            bail!("多个部署记录指向同一改名目标");
        }
        if !direct {
            sync_engine::ensure_dst_not_inside_src(old, &target)?;
            sync_engine::ensure_dst_not_inside_src(old, &destination)?;
            let state = sync_engine::classify_target(&target, Some(old))?;
            let matches = state == TargetState::Absent
                || (record.mode == "copy" && state == TargetState::RealDir)
                || (record.mode == "symlink" && state == TargetState::LinkToSource);
            if !matches {
                bail!("部署入口已被修改，保留原内容：{}", target.display());
            }
            if destination != target
                && sync_engine::classify_target(&destination, None)? != TargetState::Absent
            {
                bail!("部署目标已存在，保留原内容：{}", destination.display());
            }
        }
        if all_targets.iter().any(|other| {
            other.id != record.id && other.target_path == destination.to_string_lossy()
        }) {
            bail!("改名后的部署目标已被其他记录使用");
        }
        plans.push(Deployment {
            record,
            old: target,
            new: destination,
            direct,
            retained: None,
            published: false,
        });
    }
    Ok(plans)
}

fn read_skill_markers(dir: &Path) -> Result<Vec<(String, Vec<u8>)>> {
    let mut originals = Vec::new();
    for name in skill_metadata::SKILL_DIR_MARKERS {
        match fs::read(dir.join(name)) {
            Ok(bytes) => originals.push((name.to_string(), bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(originals)
}

fn publish(
    store: &SkillStore,
    skill: &SkillRecord,
    name: &str,
    new: &Path,
    deployments: &mut [Deployment],
) -> Result<()> {
    skill_metadata::update_skill_md_name(new, name)?;
    let hash = content_hash::hash_directory(new)?;
    for deployment in deployments.iter_mut() {
        if !deployment.direct {
            move_old_deployment(deployment)?;
            let mode = sync_engine::sync_mode_for_tool("", Some(&deployment.record.mode));
            let actual =
                sync_engine::sync_skill(new, &deployment.new, mode, ReplacePolicy::NoClobber)?;
            deployment.record.mode = actual.as_str().into();
            deployment.published = true;
        }
        deployment.record.target_path = deployment.new.to_string_lossy().into_owned();
        deployment.record.source_hash = Some(hash.clone());
    }
    let records: Vec<_> = deployments.iter().map(|d| d.record.clone()).collect();
    store.commit_skill_rename(skill, name, new, &hash, &records)
}

fn move_old_deployment(deployment: &mut Deployment) -> Result<()> {
    super::file_watcher::mute_self_writes(&deployment.old);
    super::file_watcher::mute_self_writes(&deployment.new);
    let state = sync_engine::classify_target(&deployment.old, None)?;
    if state == TargetState::Absent {
        return Ok(());
    }
    if !sync_engine::matches_recorded_deployment(&deployment.old, &deployment.record.mode)? {
        bail!("部署入口在改名期间发生变化：{}", deployment.old.display());
    }
    let parent = deployment.old.parent().context("部署目录没有父目录")?;
    let retained = tempfile::Builder::new()
        .prefix(".agent-hub-rename-")
        .tempdir_in(parent)?;
    fs::rename(&deployment.old, retained.path().join("old"))?;
    deployment.retained = Some(retained);
    let retained = deployment.retained.as_ref().context("原部署未保留")?;
    if sync_engine::classify_target(&retained.path().join("old"), None)? != state {
        bail!("部署入口在移动期间发生变化，保留原内容");
    }
    Ok(())
}

fn rollback(
    old: &Path,
    new: &Path,
    originals: &[(String, Vec<u8>)],
    deployments: &mut [Deployment],
) -> Result<()> {
    let mut errors = Vec::new();
    for deployment in deployments.iter_mut().rev() {
        let recovery = (|| -> Result<()> {
            if deployment.published
                && !sync_engine::remove_recorded_target(&deployment.new, &deployment.record.mode)?
            {
                bail!("新部署入口已改变：{}", deployment.new.display());
            }
            if let Some(retained) = deployment.retained.as_ref() {
                if sync_engine::classify_target(&deployment.old, None)? != TargetState::Absent {
                    bail!("原部署路径已占用：{}", deployment.old.display());
                }
                fs::rename(retained.path().join("old"), &deployment.old)?;
            }
            Ok(())
        })();
        if let Err(error) = recovery {
            let retained = deployment.retained.take().map(|d| d.keep());
            errors.push(format!("{error}; 保留的原部署：{retained:?}"));
        }
    }
    for (name, bytes) in originals {
        if let Err(error) = fs::write(new.join(name), bytes) {
            errors.push(error.to_string());
        }
    }
    if old != new {
        if sync_engine::classify_target(old, None)? != TargetState::Absent {
            errors.push(format!("原技能路径已占用：{}", old.display()));
        } else if let Err(error) = fs::rename(new, old) {
            errors.push(error.to_string());
        }
    }
    if !errors.is_empty() {
        bail!("{}", errors.join("；"));
    }
    Ok(())
}
