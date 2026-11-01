use super::{
    classify_sync_status, ensure_distinct_linked_workspace_roots, find_best_center_match,
    project_to_dto, remove_workspace_skill_target,
};
use crate::core::content_hash;
use crate::core::project_scanner::{AgentSkillConfig, ProjectSkillInfo};
use crate::core::skill_store::{ProjectRecord, SkillRecord};
use std::fs;
use tempfile::tempdir;

fn sample_managed_skill(
    central_path: String,
    content_hash: Option<String>,
    updated_at: i64,
) -> SkillRecord {
    SkillRecord {
        id: "skill-1".to_string(),
        name: "Example Skill".to_string(),
        description: None,
        source_type: "local".to_string(),
        source_ref: None,
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path,
        content_hash,
        enabled: true,
        created_at: 0,
        updated_at,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    }
}

/// Build a library skill with the given identity fields, so a test can
/// assert the order the layers resolve in.
fn managed_skill_with_identity(
    id: &str,
    name: &str,
    central_path: String,
    content_hash: Option<String>,
) -> SkillRecord {
    SkillRecord {
        id: id.to_string(),
        name: name.to_string(),
        description: None,
        source_type: "skillssh".to_string(),
        source_ref: None,
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path,
        content_hash,
        enabled: true,
        created_at: 0,
        updated_at: 0,
        status: "ok".to_string(),
        update_status: "unknown".to_string(),
        last_checked_at: None,
        last_check_error: None,
    }
}

fn sample_project_skill(
    path: String,
    content_hash: Option<String>,
    last_modified_at: Option<i64>,
) -> ProjectSkillInfo {
    ProjectSkillInfo {
        name: "Example Skill".to_string(),
        dir_name: "example-skill".to_string(),
        relative_path: "example-skill".to_string(),
        description: None,
        path,
        files: vec!["SKILL.md".to_string()],
        enabled: true,
        agent: "claude_code".to_string(),
        agent_display_name: "Claude Code".to_string(),
        tags: Vec::new(),
        in_center: true,
        sync_status: "project_only".to_string(),
        center_skill_id: Some("skill-1".to_string()),
        last_modified_at,
        content_hash,
    }
}

/// Build a project skill with the given directory name and agent, to
/// stand in for one per-agent copy.
fn project_skill_with_dir(
    dir_name: &str,
    path: String,
    content_hash: Option<String>,
    agent: &str,
) -> ProjectSkillInfo {
    ProjectSkillInfo {
        name: dir_name.to_string(),
        dir_name: dir_name.to_string(),
        relative_path: dir_name.to_string(),
        description: None,
        path,
        files: vec!["SKILL.md".to_string()],
        enabled: true,
        agent: agent.to_string(),
        agent_display_name: agent.to_string(),
        tags: Vec::new(),
        in_center: false,
        sync_status: "project_only".to_string(),
        center_skill_id: None,
        last_modified_at: Some(1_000),
        content_hash,
    }
}

/// Directory identity must win over a content hash several skills share.
#[test]
fn find_best_center_match_prefers_directory_identity_over_shared_hash() {
    let shared_hash = Some("same-content-hash".to_string());
    let project = project_skill_with_dir(
        "adapt",
        "/tmp/project/.claude/skills/adapt".to_string(),
        shared_hash.clone(),
        "claude_code",
    );
    let all_managed = vec![
        managed_skill_with_identity(
            "adapt-id",
            "adapt",
            "/tmp/center/adapt".to_string(),
            shared_hash.clone(),
        ),
        managed_skill_with_identity(
            "polish-id",
            "polish",
            "/tmp/center/polish".to_string(),
            shared_hash,
        ),
    ];

    let matched = find_best_center_match(&project, &all_managed).unwrap();

    assert_eq!(matched.id, "adapt-id");
}

/// The central directory name must win over a frontmatter name that repeats.
#[test]
fn find_best_center_match_uses_central_directory_before_frontmatter_name() {
    let project = project_skill_with_dir(
        "adapt",
        "/tmp/project/.claude/skills/adapt".to_string(),
        None,
        "claude_code",
    );
    let all_managed = vec![
        managed_skill_with_identity(
            "adapt-id",
            "impeccable",
            "/tmp/center/adapt".to_string(),
            None,
        ),
        managed_skill_with_identity(
            "layout-id",
            "impeccable",
            "/tmp/center/layout".to_string(),
            None,
        ),
    ];

    let matched = find_best_center_match(&project, &all_managed).unwrap();

    assert_eq!(matched.id, "adapt-id");
}

/// A unique content hash outranks a directory name owned by a different
/// skill. A library holding both "Code Review" and "code-review" exports
/// the first under the slug `code-review`, which is the second one's
/// library directory — matching on the directory binds the copy to the
/// wrong row, and that row is also where an import writes back.
#[test]
fn find_best_center_match_prefers_a_unique_hash_over_another_skills_directory() {
    let exported_hash = Some("code-review-content".to_string());
    let project = project_skill_with_dir(
        "code-review",
        "/tmp/project/.claude/skills/code-review".to_string(),
        exported_hash.clone(),
        "claude_code",
    );
    let all_managed = vec![
        managed_skill_with_identity(
            "spaced-id",
            "Code Review",
            "/tmp/center/Code Review".to_string(),
            exported_hash,
        ),
        managed_skill_with_identity(
            "slug-id",
            "code-review",
            "/tmp/center/code-review".to_string(),
            Some("unrelated-content".to_string()),
        ),
    ];

    let matched = find_best_center_match(&project, &all_managed).unwrap();

    assert_eq!(matched.id, "spaced-id");
}

/// The sidebar project count dedupes by logical skill rather than adding
/// up per-agent copies.
#[test]
fn project_to_dto_counts_logical_skills_not_agent_copies() {
    let tmp = tempdir().unwrap();
    let project_path = tmp.path().join("project");
    let claude_skill = project_path.join(".claude/skills/shared-skill");
    let codex_skill = project_path.join(".codex/skills/shared-skill");
    fs::create_dir_all(&claude_skill).unwrap();
    fs::create_dir_all(&codex_skill).unwrap();
    fs::write(claude_skill.join("SKILL.md"), "# Shared\n").unwrap();
    fs::write(codex_skill.join("SKILL.md"), "# Shared\n").unwrap();

    let record = ProjectRecord {
        id: "project-1".to_string(),
        name: "Project".to_string(),
        path: project_path.to_string_lossy().to_string(),
        workspace_type: "project".to_string(),
        linked_agent_key: None,
        linked_agent_name: None,
        disabled_path: None,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
        visited_at: None,
    };
    let configs = vec![
        AgentSkillConfig {
            key: "claude_code".to_string(),
            display_name: "Claude Code".to_string(),
            relative_skills_dir: ".claude/skills".to_string(),
        },
        AgentSkillConfig {
            key: "codex".to_string(),
            display_name: "Codex".to_string(),
            relative_skills_dir: ".codex/skills".to_string(),
        },
    ];

    let dto = project_to_dto(&record, &[], &configs);

    assert_eq!(dto.skill_count, 1);
    assert_eq!(dto.sync_health.project_only, 1);
}

#[test]
fn classify_sync_status_uses_live_center_hash_when_db_hash_is_stale() {
    let center_dir = tempdir().unwrap();
    fs::write(center_dir.path().join("SKILL.md"), "# Example\n").unwrap();
    let live_hash = content_hash::hash_directory(center_dir.path()).unwrap();

    let managed = sample_managed_skill(
        center_dir.path().to_string_lossy().to_string(),
        Some("stale-db-hash".to_string()),
        1_000,
    );
    let project = sample_project_skill(
        center_dir.path().to_string_lossy().to_string(),
        Some(live_hash),
        Some(5_000),
    );

    assert_eq!(classify_sync_status(&project, Some(&managed)), "in_sync");
}

/// Newest content mtime of a directory, the same figure the project side
/// is built from, so both sides of the comparison use one ruler.
fn center_mtime_ms(dir: &std::path::Path) -> i64 {
    content_hash::latest_modified_ms(&content_hash::list_content_files(dir)).unwrap()
}

/// `updated_at` is a database column, not a filesystem mtime. With the
/// project copy genuinely newer on disk, a much later `updated_at` must not
/// flip the answer to "center_newer" — that reading invited a pull and
/// overwrote the edit the user had just made (#328).
#[test]
fn classify_sync_status_ignores_the_db_column_when_the_project_is_newer_on_disk() {
    let center_dir = tempdir().unwrap();
    fs::write(center_dir.path().join("SKILL.md"), "# Center\n").unwrap();
    let center_mtime = center_mtime_ms(center_dir.path());

    let project_dir = tempdir().unwrap();
    fs::write(project_dir.path().join("SKILL.md"), "# Project changed\n").unwrap();
    let project_hash = content_hash::hash_directory(project_dir.path()).unwrap();

    let managed = sample_managed_skill(
        center_dir.path().to_string_lossy().to_string(),
        Some("stale-db-hash".to_string()),
        center_mtime + 60_000,
    );
    let project = sample_project_skill(
        project_dir.path().to_string_lossy().to_string(),
        Some(project_hash),
        Some(center_mtime + 5_000),
    );

    assert_eq!(
        classify_sync_status(&project, Some(&managed)),
        "project_newer"
    );
}

/// The other direction, and the reason the fix is not simply "always say
/// project_newer": a center that really is ahead still reports so, with an
/// `updated_at` old enough that only the real mtime can produce it.
#[test]
fn classify_sync_status_reports_a_center_that_is_newer_on_disk() {
    let center_dir = tempdir().unwrap();
    fs::write(center_dir.path().join("SKILL.md"), "# Center\n").unwrap();
    let center_mtime = center_mtime_ms(center_dir.path());

    let project_dir = tempdir().unwrap();
    fs::write(project_dir.path().join("SKILL.md"), "# Project older\n").unwrap();
    let project_hash = content_hash::hash_directory(project_dir.path()).unwrap();

    let managed = sample_managed_skill(
        center_dir.path().to_string_lossy().to_string(),
        Some("stale-db-hash".to_string()),
        0,
    );
    let project = sample_project_skill(
        project_dir.path().to_string_lossy().to_string(),
        Some(project_hash),
        Some(center_mtime - 5_000),
    );

    assert_eq!(
        classify_sync_status(&project, Some(&managed)),
        "center_newer"
    );
}

#[test]
fn linked_workspace_roots_reject_same_directory() {
    let tmp = tempdir().unwrap();
    let root = tmp.path().join("skills");
    fs::create_dir_all(&root).unwrap();

    let err = ensure_distinct_linked_workspace_roots(&root, &root).unwrap_err();
    assert!(
        err.to_string().contains("must not overlap"),
        "unexpected error: {err}"
    );
}

#[test]
fn linked_workspace_roots_reject_nested_directory() {
    let tmp = tempdir().unwrap();
    let root = tmp.path().join("skills");
    let nested = root.join("disabled");
    fs::create_dir_all(&nested).unwrap();

    let err = ensure_distinct_linked_workspace_roots(&root, &nested).unwrap_err();
    assert!(
        err.to_string().contains("must not overlap"),
        "unexpected error: {err}"
    );
}

#[test]
fn linked_workspace_roots_allow_distinct_directories() {
    let tmp = tempdir().unwrap();
    let root = tmp.path().join("skills");
    let disabled = tmp.path().join("skills-disabled");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&disabled).unwrap();

    ensure_distinct_linked_workspace_roots(&root, &disabled).unwrap();
}

#[cfg(unix)]
#[test]
fn remove_workspace_skill_target_removes_symlink_without_touching_target() {
    let tmp = tempdir().unwrap();
    let real = tmp.path().join("real-skill");
    let link = tmp.path().join("linked-skill");
    fs::create_dir_all(&real).unwrap();
    fs::write(real.join("SKILL.md"), "# hello").unwrap();
    std::os::unix::fs::symlink(&real, &link).unwrap();

    remove_workspace_skill_target(&link).unwrap();

    assert!(!link.exists());
    assert!(real.exists());
    assert!(real.join("SKILL.md").exists());
}

#[cfg(windows)]
#[test]
fn remove_workspace_skill_target_removes_directory_symlink_without_touching_target() {
    let tmp = tempdir().unwrap();
    let real = tmp.path().join("real-skill");
    let link = tmp.path().join("linked-skill");
    fs::create_dir_all(&real).unwrap();
    fs::write(real.join("SKILL.md"), "# hello").unwrap();
    std::os::windows::fs::symlink_dir(&real, &link).unwrap();

    remove_workspace_skill_target(&link).unwrap();

    assert!(!link.exists());
    assert!(real.exists());
    assert!(real.join("SKILL.md").exists());
}
