use super::*;
use std::fs;
use tempfile::tempdir;

// ── parse_frontmatter ──

#[test]
fn parse_frontmatter_full() {
    let content = "---\nname: my-skill\ndescription: A great skill\nversion: 1.1.0\n---\n# Content";
    let meta = parse_frontmatter(content);
    assert_eq!(meta.name.as_deref(), Some("my-skill"));
    assert_eq!(meta.description.as_deref(), Some("A great skill"));
    assert_eq!(meta.version.as_deref(), Some("1.1.0"));
}

#[test]
fn parse_frontmatter_name_only() {
    let content = "---\nname: test-skill\n---\n";
    let meta = parse_frontmatter(content);
    assert_eq!(meta.name.as_deref(), Some("test-skill"));
    assert_eq!(meta.description, None);
}

#[test]
fn parse_frontmatter_no_frontmatter() {
    let content = "# Just markdown\nNo frontmatter here.";
    let meta = parse_frontmatter(content);
    assert_eq!(meta.name, None);
    assert_eq!(meta.description, None);
}

#[test]
fn parse_frontmatter_empty_string() {
    let meta = parse_frontmatter("");
    assert_eq!(meta.name, None);
}

#[test]
fn parse_frontmatter_invalid_yaml() {
    let content = "---\n: : broken yaml\n---\n";
    let meta = parse_frontmatter(content);
    // Should not panic, just return None
    assert_eq!(meta.name, None);
}

#[test]
fn parse_frontmatter_extra_fields_ignored() {
    let content = "---\nname: foo\nauthor: bar\nversion: 1.0\n---\n";
    let meta = parse_frontmatter(content);
    assert_eq!(meta.name.as_deref(), Some("foo"));
}

// ── parse_skill_md (filesystem) ──

#[test]
fn parse_skill_md_reads_skill_md() {
    let tmp = tempdir().unwrap();
    fs::write(
        tmp.path().join("SKILL.md"),
        "---\nname: from-skill\ndescription: desc\n---\n",
    )
    .unwrap();

    let meta = parse_skill_md(tmp.path());
    assert_eq!(meta.name.as_deref(), Some("from-skill"));
    assert_eq!(meta.description.as_deref(), Some("desc"));
}

#[test]
fn parse_skill_md_reads_lowercase_skill_md() {
    let tmp = tempdir().unwrap();
    fs::write(
        tmp.path().join("skill.md"),
        "---\nname: from-lowercase\ndescription: desc\n---\n",
    )
    .unwrap();

    let meta = parse_skill_md(tmp.path());
    assert_eq!(meta.name.as_deref(), Some("from-lowercase"));
    assert_eq!(meta.description.as_deref(), Some("desc"));
}

#[test]
fn parse_skill_md_ignores_claude_md() {
    let tmp = tempdir().unwrap();
    fs::write(
        tmp.path().join("CLAUDE.md"),
        "---\nname: from-claude\n---\n",
    )
    .unwrap();

    let meta = parse_skill_md(tmp.path());
    assert_eq!(meta.name, None);
}

#[test]
fn parse_skill_md_prefers_skill_md_when_claude_md_is_present() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("SKILL.md"), "---\nname: from-skill\n---\n").unwrap();
    fs::write(
        tmp.path().join("CLAUDE.md"),
        "---\nname: from-claude\n---\n",
    )
    .unwrap();

    let meta = parse_skill_md(tmp.path());
    assert_eq!(meta.name.as_deref(), Some("from-skill"));
}

#[test]
fn parse_skill_md_empty_dir() {
    let tmp = tempdir().unwrap();
    let meta = parse_skill_md(tmp.path());
    assert_eq!(meta.name, None);
    assert_eq!(meta.description, None);
}

// ── is_valid_skill_dir ──

#[test]
fn is_valid_skill_dir_with_skill_md() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("SKILL.md"), "content").unwrap();
    assert!(is_valid_skill_dir(tmp.path()));
}

#[test]
fn is_valid_skill_dir_accepts_lowercase_skill_md() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("skill.md"), "content").unwrap();
    assert!(is_valid_skill_dir(tmp.path()));
}

#[test]
fn is_valid_skill_dir_ignores_readme_only_dirs() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("README.md"), "content").unwrap();
    assert!(!is_valid_skill_dir(tmp.path()));
}

#[test]
fn is_valid_skill_dir_ignores_claude_only_dirs() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("CLAUDE.md"), "content").unwrap();
    assert!(!is_valid_skill_dir(tmp.path()));
}

#[test]
fn is_valid_skill_dir_empty() {
    let tmp = tempdir().unwrap();
    assert!(!is_valid_skill_dir(tmp.path()));
}

#[test]
fn is_valid_skill_dir_file_not_dir() {
    let tmp = tempdir().unwrap();
    let file = tmp.path().join("not-a-dir");
    fs::write(&file, "content").unwrap();
    assert!(!is_valid_skill_dir(&file));
}

// ── sanitize_skill_name ──

#[test]
fn sanitize_normal_name() {
    assert_eq!(sanitize_skill_name("my-skill"), Some("my-skill".into()));
}

#[test]
fn sanitize_strips_path_traversal() {
    assert_eq!(
        sanitize_skill_name("../../../../.bashrc"),
        Some(".bashrc".into())
    );
}

#[test]
fn sanitize_rejects_dotdot() {
    assert_eq!(sanitize_skill_name(".."), None);
    assert_eq!(sanitize_skill_name("."), None);
}

#[test]
fn sanitize_preserves_spaces_and_unicode() {
    assert_eq!(
        sanitize_skill_name("my skill (v2)"),
        Some("my skill (v2)".into())
    );
    assert_eq!(sanitize_skill_name("技能-测试"), Some("技能-测试".into()));
}

#[test]
fn sanitize_distinct_inputs_produce_distinct_outputs() {
    // "a b" and "a-b" must NOT collapse to the same name.
    let a = sanitize_skill_name("a b");
    let b = sanitize_skill_name("a-b");
    assert_ne!(a, b);
}

#[test]
fn sanitize_replaces_control_chars_with_underscore() {
    // Replace rather than remove, so "a\x00b" → "a_b" not "ab"
    assert_eq!(sanitize_skill_name("a\x00b\x07c"), Some("a_b_c".into()));
}

#[test]
fn sanitize_replaces_windows_reserved_chars() {
    assert_eq!(
        sanitize_skill_name("foo:bar*baz"),
        Some("foo_bar_baz".into())
    );
    assert_eq!(sanitize_skill_name("a<b>c"), Some("a_b_c".into()));
}

#[test]
fn sanitize_trims_whitespace_and_trailing_dots() {
    assert_eq!(sanitize_skill_name("  foo  "), Some("foo".into()));
    assert_eq!(sanitize_skill_name("bar..."), Some("bar".into()));
}

#[test]
fn sanitize_rejects_empty_after_cleaning() {
    assert_eq!(sanitize_skill_name("   "), None);
    assert_eq!(sanitize_skill_name("..."), None);
}

#[test]
fn sanitize_control_only_input_produces_underscores() {
    // Control chars become `_`, not removed — so result is non-empty.
    assert_eq!(sanitize_skill_name("\x00\x01"), Some("__".into()));
}

#[test]
fn sanitize_avoids_windows_reserved_device_names() {
    assert_eq!(sanitize_skill_name("CON"), Some("_CON".into()));
    assert_eq!(sanitize_skill_name("nul.txt"), Some("_nul.txt".into()));
    assert_eq!(sanitize_skill_name("Com1"), Some("_Com1".into()));
}

// ── infer_skill_name ──

#[test]
fn infer_skill_name_from_metadata() {
    let tmp = tempdir().unwrap();
    let skill_dir = tmp.path().join("directory-name");
    fs::create_dir_all(&skill_dir).unwrap();
    fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: metadata-name\n---\n",
    )
    .unwrap();

    assert_eq!(infer_skill_name(&skill_dir), "metadata-name");
}

#[test]
fn infer_skill_name_falls_back_to_dirname() {
    let tmp = tempdir().unwrap();
    let skill_dir = tmp.path().join("my-cool-skill");
    fs::create_dir_all(&skill_dir).unwrap();

    assert_eq!(infer_skill_name(&skill_dir), "my-cool-skill");
}
