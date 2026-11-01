use super::*;
use std::fs;
use tempfile::tempdir;

// ── parse_git_source ──

#[test]
fn parses_github_tree_urls() {
    let parsed = parse_git_source("https://github.com/acme/skills/tree/main/tools/my-skill");
    assert_eq!(parsed.clone_url, "https://github.com/acme/skills.git");
    assert_eq!(parsed.branch.as_deref(), Some("main"));
    assert_eq!(parsed.subpath.as_deref(), Some("tools/my-skill"));
}

#[test]
fn parses_shorthand_urls() {
    let parsed = parse_git_source("acme/skills");
    assert_eq!(parsed.clone_url, "https://github.com/acme/skills.git");
    assert_eq!(parsed.branch, None);
    assert_eq!(parsed.subpath, None);
}

#[test]
fn parses_github_tree_url_branch_only() {
    let parsed = parse_git_source("https://github.com/acme/skills/tree/develop");
    assert_eq!(parsed.clone_url, "https://github.com/acme/skills.git");
    assert_eq!(parsed.branch.as_deref(), Some("develop"));
    assert_eq!(parsed.subpath, None);
}

#[test]
fn parses_full_https_url() {
    let parsed = parse_git_source("https://github.com/acme/skills.git");
    assert_eq!(parsed.clone_url, "https://github.com/acme/skills.git");
    assert_eq!(parsed.branch, None);
    assert_eq!(parsed.subpath, None);
}

#[test]
fn parses_git_ssh_url() {
    let parsed = parse_git_source("git@github.com:acme/skills.git");
    assert_eq!(parsed.clone_url, "git@github.com:acme/skills.git");
    assert_eq!(parsed.branch, None);
    assert_eq!(parsed.subpath, None);
}

#[test]
fn preserves_generic_repository_urls() {
    for url in [
        "https://git.example.invalid/team/skills.git",
        "http://git.example.invalid:8080/team/skills.git",
        "git@git.example.invalid:team/skills.git",
        "ssh://git@git.example.invalid:11022/team/skills.git",
        "ssh://git@git.example.invalid/team/subgroup/skills.git",
        "ssh://git@git.example.invalid:11022/team/skills",
        "ssh://git@git.example.invalid/team/skills/tree/main/tools",
    ] {
        validate_git_url(url).unwrap();
        let parsed = parse_git_source(&format!("  {url}  "));
        assert_eq!(parsed.original_url, url);
        assert_eq!(parsed.clone_url, url);
        assert_eq!(parsed.branch, None);
        assert_eq!(parsed.subpath, None);
        let resolved = parse_git_source_resolved(url, None);
        assert_eq!(resolved.clone_url, url);
        assert_eq!(resolved.branch, None);
        assert_eq!(resolved.subpath, None);
    }
}

#[test]
fn preserves_original_url() {
    let input = "  acme/skills  ";
    let parsed = parse_git_source(input);
    assert_eq!(parsed.original_url, "acme/skills");
}

#[test]
fn handles_plain_string_no_slash() {
    let parsed = parse_git_source("something");
    assert_eq!(parsed.clone_url, "something");
}

#[test]
fn normalize_http_url_passthrough() {
    let parsed = parse_git_source("http://gitlab.example.com/repo.git");
    assert_eq!(parsed.clone_url, "http://gitlab.example.com/repo.git");
    assert_eq!(parsed.branch, None);
}

// ── find_skill_dir ──

#[test]
fn find_skill_dir_root_with_skill_md() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("SKILL.md"), "---\nname: foo\n---").unwrap();
    let found = find_skill_dir(tmp.path(), None).unwrap();
    assert_eq!(found, tmp.path());
}

#[test]
fn find_skill_dir_root_with_claude_md() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("CLAUDE.md"), "# instructions").unwrap();
    let found = find_skill_dir(tmp.path(), None).unwrap();
    assert_eq!(found, tmp.path());
}

#[test]
fn find_skill_dir_skills_subdirectory() {
    let tmp = tempdir().unwrap();
    fs::create_dir_all(tmp.path().join("skills")).unwrap();
    let found = find_skill_dir(tmp.path(), None).unwrap();
    assert_eq!(found, tmp.path().join("skills"));
}

#[test]
fn find_skill_dir_skill_subdirectory() {
    let tmp = tempdir().unwrap();
    fs::create_dir_all(tmp.path().join("skill")).unwrap();
    let found = find_skill_dir(tmp.path(), None).unwrap();
    assert_eq!(found, tmp.path().join("skill"));
}

#[test]
fn find_skill_dir_by_id_direct() {
    let tmp = tempdir().unwrap();
    let skill = tmp.path().join("my-skill");
    fs::create_dir_all(&skill).unwrap();
    fs::write(skill.join("SKILL.md"), "content").unwrap();
    let found = find_skill_dir(tmp.path(), Some("my-skill")).unwrap();
    assert_eq!(found, skill);
}

#[test]
fn find_skill_dir_by_id_in_skills_subdir() {
    let tmp = tempdir().unwrap();
    let skill = tmp.path().join("skills").join("my-skill");
    fs::create_dir_all(&skill).unwrap();
    fs::write(skill.join("SKILL.md"), "content").unwrap();
    let found = find_skill_dir(tmp.path(), Some("my-skill")).unwrap();
    assert_eq!(found, skill);
}

#[test]
fn find_skill_dir_prefers_agents_skills_over_provider_variants() {
    // When a repo publishes both the unified `.agents/skills/<id>` variant
    // and provider-specific variants (e.g. `.cursor/skills/<id>`), we must
    // pick the unified one — the recursive fallback is non-deterministic
    // across filesystems.
    let tmp = tempdir().unwrap();
    let agents = tmp.path().join(".agents").join("skills").join("my-skill");
    let cursor = tmp.path().join(".cursor").join("skills").join("my-skill");
    let claude = tmp.path().join(".claude").join("skills").join("my-skill");
    for dir in [&agents, &cursor, &claude] {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join("SKILL.md"), "content").unwrap();
    }
    let found = find_skill_dir(tmp.path(), Some("my-skill")).unwrap();
    assert_eq!(found, agents);
}

#[test]
fn find_skill_dir_skips_invalid_basename_match() {
    // A directory with the right basename but no SKILL.md must NOT be
    // returned; the search should continue and find the real skill deeper.
    let tmp = tempdir().unwrap();
    let bogus = tmp.path().join("my-skill"); // bogus: dir name matches but empty
    fs::create_dir_all(&bogus).unwrap();
    let real = tmp.path().join("category").join("my-skill");
    fs::create_dir_all(&real).unwrap();
    fs::write(real.join("SKILL.md"), "content").unwrap();

    let found = find_skill_dir(tmp.path(), Some("my-skill")).unwrap();
    assert_eq!(found, real);
}

#[test]
fn find_skill_dir_errors_when_skill_id_missing_even_if_root_is_skill() {
    // When a skill id is requested but doesn't match, we must error even if
    // the repo root happens to be a skill — previously this fell back to the
    // root and installed an unrelated skill under the requested name (#278).
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("SKILL.md"), "---\nname: root\n---").unwrap();
    let bogus_dir = tmp.path().join("my-skill");
    fs::create_dir_all(&bogus_dir).unwrap();

    let found = find_skill_dir(tmp.path(), Some("my-skill"));
    assert!(
        found.is_err(),
        "expected error for missing skill id, got {:?}",
        found
    );
}

#[test]
fn find_skill_dir_errors_when_requested_skill_id_missing() {
    // Repro for "install a skill whose name doesn't exist upstream" (issue #278).
    // Repo layout mirrors mattpocock/skills: skills/<category>/<skill>/SKILL.md.
    // Asking for a skill id that doesn't exist MUST error, not silently return
    // the skills/ container (which would install the entire repo as one skill).
    let tmp = tempdir().unwrap();
    let ask_matt = tmp
        .path()
        .join("skills")
        .join("engineering")
        .join("ask-matt");
    let tdd = tmp.path().join("skills").join("engineering").join("tdd");
    fs::create_dir_all(&ask_matt).unwrap();
    fs::write(ask_matt.join("SKILL.md"), "---\nname: ask-matt\n---").unwrap();
    fs::create_dir_all(&tdd).unwrap();
    fs::write(tdd.join("SKILL.md"), "---\nname: tdd\n---").unwrap();

    // Existing skill resolves fine.
    let found = find_skill_dir(tmp.path(), Some("ask-matt")).unwrap();
    assert_eq!(found, ask_matt);

    // Missing skill id must error instead of returning the skills/ container.
    let missing = find_skill_dir(tmp.path(), Some("caveman"));
    assert!(
        missing.is_err(),
        "expected an error for missing skill id, got {:?}",
        missing
    );
}

#[test]
fn find_skill_dir_by_id_matches_root_skill_md_name() {
    // A single-skill repo whose root SKILL.md carries `name: root-name`.
    // Requesting that id must still resolve to the root via the frontmatter
    // name match — the #278 bail! only fires when *nothing* matches, and must
    // not regress this legitimate root case.
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("SKILL.md"), "---\nname: root-name\n---").unwrap();

    // Matching id resolves to the root via the frontmatter name match.
    let found = find_skill_dir(tmp.path(), Some("root-name")).unwrap();
    assert_eq!(found, tmp.path());

    // Non-matching id on the SAME root-skill repo must error, not fall back
    // to the root. This proves the positive case above returns the root via
    // name_match rather than the skill_id==None root fallback — so the test
    // would fail if the old fall-through were reintroduced.
    let missing = find_skill_dir(tmp.path(), Some("nope-not-here"));
    assert!(
        missing.is_err(),
        "expected error for non-matching id on a root-skill repo, got {:?}",
        missing
    );
}

#[test]
fn find_skill_dir_fallback_to_root() {
    let tmp = tempdir().unwrap();
    let found = find_skill_dir(tmp.path(), None).unwrap();
    assert_eq!(found, tmp.path());
}

// ── relative_subpath ──

#[test]
fn relative_subpath_nested() {
    let tmp = tempdir().unwrap();
    let repo = tmp.path().join("repo");
    let skill = repo.join("tools").join("my-skill");
    assert_eq!(
        relative_subpath(&repo, &skill).map(|s| s.replace('\\', "/")),
        Some("tools/my-skill".to_string())
    );
}

#[test]
fn relative_subpath_root_returns_none() {
    let tmp = tempdir().unwrap();
    let repo = tmp.path().join("repo");
    assert_eq!(relative_subpath(&repo, &repo), None);
}

#[test]
fn relative_subpath_unrelated_returns_none() {
    let tmp = tempdir().unwrap();
    let repo = tmp.path().join("repo");
    let other = tmp.path().join("other").join("skill");
    assert_eq!(relative_subpath(&repo, &other), None);
}

#[test]
fn parse_github_tree_url_with_dot_git_suffix() {
    let parsed = parse_git_source("https://github.com/acme/skills.git/tree/main/sub");
    assert_eq!(parsed.clone_url, "https://github.com/acme/skills.git");
    assert_eq!(parsed.branch.as_deref(), Some("main"));
    assert_eq!(parsed.subpath.as_deref(), Some("sub"));
}

#[test]
fn parse_non_github_url_no_tree_extraction() {
    let parsed = parse_git_source("https://gitlab.com/acme/skills/tree/main/sub");
    assert_eq!(
        parsed.clone_url,
        "https://gitlab.com/acme/skills/tree/main/sub"
    );
    assert_eq!(parsed.branch, None);
}

// ── remote ref resolution ──

#[test]
fn candidate_refs_prefer_branch_then_peeled_tag_then_tag() {
    assert_eq!(
        candidate_ref_names(Some("v0.8.0")),
        vec![
            "refs/heads/v0.8.0",
            "refs/tags/v0.8.0^{}",
            "refs/tags/v0.8.0",
        ]
    );
    assert_eq!(candidate_ref_names(None), vec!["HEAD"]);
}

#[test]
fn resolves_annotated_tag_to_its_peeled_commit() {
    // Both lines come back for an annotated tag. The first one is the tag
    // object; only the peeled line is the commit the tag points at.
    let stdout = "857196de\trefs/tags/v0.8.0\n346411fa\trefs/tags/v0.8.0^{}\n";
    assert_eq!(
        select_remote_revision(stdout, &candidate_ref_names(Some("v0.8.0"))),
        Some("346411fa".to_string())
    );
}

#[test]
fn resolves_lightweight_tag_without_peeled_line() {
    let stdout = "c2ad91cc\trefs/tags/preview-1\n";
    assert_eq!(
        select_remote_revision(stdout, &candidate_ref_names(Some("preview-1"))),
        Some("c2ad91cc".to_string())
    );
}

#[test]
fn branch_wins_over_a_tag_of_the_same_name() {
    let stdout = "aaaa\trefs/tags/release\nbbbb\trefs/heads/release\n";
    assert_eq!(
        select_remote_revision(stdout, &candidate_ref_names(Some("release"))),
        Some("bbbb".to_string())
    );
}

#[test]
fn unrelated_refs_do_not_resolve() {
    // Guards the old "just take the first line" behaviour: a ref the remote
    // does not have must fail rather than borrow another ref's revision.
    let stdout = "aaaa\trefs/heads/main\n";
    assert_eq!(
        select_remote_revision(stdout, &candidate_ref_names(Some("v9.9.9"))),
        None
    );
}

#[test]
fn head_resolves_when_no_ref_is_pinned() {
    let stdout = "94f6d9c0\tHEAD\naaaa\trefs/heads/master\n";
    assert_eq!(
        select_remote_revision(stdout, &candidate_ref_names(None)),
        Some("94f6d9c0".to_string())
    );
}

#[test]
fn remote_ref_names_split_heads_from_tags_and_drop_peeled_duplicates() {
    let stdout = "aaaa\trefs/heads/main\n\
                      bbbb\trefs/tags/v1.0\n\
                      cccc\trefs/tags/v1.0^{}\n\
                      dddd\trefs/pull/7/head\n";
    let refs = parse_remote_ref_names(stdout);
    assert_eq!(refs.heads, vec!["main"]);
    assert_eq!(refs.tags, vec!["v1.0"]);
}

#[test]
fn a_tag_cannot_steal_a_url_that_a_branch_explains() {
    // Longest-match across heads and tags at once would read this as tag
    // `main/v1` + subpath `skills`, silently re-pointing the skill.
    let refs = parse_remote_ref_names("aaaa\trefs/heads/main\nbbbb\trefs/tags/main/v1\n");
    let (branch, subpath) = split_tree_path_with_known_refs("main/v1/skills", &refs);
    assert_eq!(branch, "main");
    assert_eq!(subpath.as_deref(), Some("v1/skills"));
}

#[test]
fn a_slash_tag_still_resolves_when_no_branch_matches() {
    let refs = parse_remote_ref_names("aaaa\trefs/heads/master\nbbbb\trefs/tags/release/v0.8.0\n");
    let (branch, subpath) = split_tree_path_with_known_refs("release/v0.8.0/skills/herdr", &refs);
    assert_eq!(branch, "release/v0.8.0");
    assert_eq!(subpath.as_deref(), Some("skills/herdr"));
}

// ── split_tree_branch_path ──

#[test]
fn split_tree_branch_path_defaults_to_first_segment_when_no_branches_known() {
    // Optimistic (offline) parse: first segment is the branch.
    let (b, s) = split_tree_branch_path("main/sub/dir", &[]);
    assert_eq!(b, "main");
    assert_eq!(s.as_deref(), Some("sub/dir"));
}

#[test]
fn split_tree_branch_path_picks_longest_known_branch_with_slash() {
    // When the branch name contains `/`, only the known-branches list lets
    // us pick the right split. Issue #121 follow-up: branch `feature/x`.
    let branches = vec!["main".to_string(), "feature/x".to_string()];
    let (b, s) = split_tree_branch_path("feature/x/skills/foo", &branches);
    assert_eq!(b, "feature/x");
    assert_eq!(s.as_deref(), Some("skills/foo"));
}

#[test]
fn split_tree_branch_path_prefers_longer_when_multiple_match() {
    // Both `feature` and `feature/x` are valid prefixes; pick the longer.
    let branches = vec!["feature".to_string(), "feature/x".to_string()];
    let (b, s) = split_tree_branch_path("feature/x/sub", &branches);
    assert_eq!(b, "feature/x");
    assert_eq!(s.as_deref(), Some("sub"));
}

#[test]
fn split_tree_branch_path_branch_only_no_subpath() {
    let branches = vec!["release/2.0".to_string()];
    let (b, s) = split_tree_branch_path("release/2.0", &branches);
    assert_eq!(b, "release/2.0");
    assert_eq!(s, None);
}

#[test]
fn split_tree_branch_path_falls_back_when_no_known_branch_matches() {
    // Defensive: if `known_branches` is non-empty but nothing matches
    // (e.g. ls-remote returned stale data), fall back to optimistic parse.
    let branches = vec!["develop".to_string()];
    let (b, s) = split_tree_branch_path("main/sub", &branches);
    assert_eq!(b, "main");
    assert_eq!(s.as_deref(), Some("sub"));
}

#[test]
fn split_tree_branch_path_does_not_match_partial_segment() {
    // `feat` must not match path `feature/x` even though it's a string prefix.
    let branches = vec!["feat".to_string()];
    let (b, s) = split_tree_branch_path("feature/x/sub", &branches);
    assert_eq!(b, "feature"); // falls through to optimistic parse
    assert_eq!(s.as_deref(), Some("x/sub"));
}

#[test]
fn split_tree_branch_path_handles_a_tag_with_a_slash() {
    let refs = vec!["master".to_string(), "release/v0.8.0".to_string()];
    let (b, s) = split_tree_branch_path("release/v0.8.0/skills/herdr", &refs);
    assert_eq!(b, "release/v0.8.0");
    assert_eq!(s.as_deref(), Some("skills/herdr"));
}

#[test]
fn split_tree_branch_path_trailing_slash() {
    // `main/` (trailing slash, no subpath) — branch `main`, subpath None.
    let (b, s) = split_tree_branch_path("main/", &[]);
    assert_eq!(b, "main");
    assert_eq!(s, None);
}

// ── repo_cache_dir ──

#[test]
fn repo_cache_dir_is_deterministic() {
    let a = repo_cache_dir("https://github.com/acme/skills.git");
    let b = repo_cache_dir("https://github.com/acme/skills.git");
    assert_eq!(a, b);
}

#[test]
fn repo_cache_dir_differs_for_different_urls() {
    let a = repo_cache_dir("https://github.com/acme/skills.git");
    let b = repo_cache_dir("https://github.com/acme/other.git");
    assert_ne!(a, b);
}

#[test]
fn repo_cache_dir_canonicalizes_dot_git_suffix() {
    // `…/y` and `…/y.git` clone the same repo; they must share a cache slot.
    let a = repo_cache_dir("https://github.com/acme/skills");
    let b = repo_cache_dir("https://github.com/acme/skills.git");
    assert_eq!(a, b);
}

#[test]
fn repo_cache_dir_canonicalizes_trailing_slash() {
    let a = repo_cache_dir("https://github.com/acme/skills/");
    let b = repo_cache_dir("https://github.com/acme/skills");
    assert_eq!(a, b);
}

#[test]
fn repo_cache_dir_canonicalizes_dot_git_with_trailing_slash() {
    // `.git` after a trailing slash strip — must collapse to the same key.
    let a = repo_cache_dir("https://github.com/acme/skills.git/");
    let b = repo_cache_dir("https://github.com/acme/skills");
    assert_eq!(a, b);
}

#[test]
fn canonicalize_clone_url_preserves_distinct_repos() {
    // Sanity: canonicalization must not collapse genuinely different URLs.
    assert_ne!(
        canonicalize_clone_url("https://github.com/acme/skills"),
        canonicalize_clone_url("https://github.com/acme/other")
    );
    assert_ne!(
        canonicalize_clone_url("https://github.com/acme/skills"),
        canonicalize_clone_url("git@github.com:acme/skills")
    );
}

// ── cleanup_temp ──

#[test]
fn cleanup_temp_removes_non_cache_dir() {
    let tmp = tempdir().unwrap();
    let dir = tmp.path().join("some-temp");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("file.txt"), "data").unwrap();
    cleanup_temp(&dir);
    assert!(!dir.exists());
}
// ── narrow (partial + sparse) clone ──

#[test]
fn sparse_slot_is_separate_from_the_full_slot() {
    let url = "https://github.com/acme/skills";
    assert_ne!(
        repo_cache_dir_for(url, true),
        repo_cache_dir_for(url, false)
    );
    assert_eq!(repo_cache_dir_for(url, false), repo_cache_dir(url));
    // Both slots still canonicalize the URL the same way.
    assert_eq!(
        repo_cache_dir_for(url, true),
        repo_cache_dir_for("https://github.com/acme/skills.git/", true)
    );
}

#[test]
fn sparse_pattern_accepts_plain_subpaths_and_rejects_the_rest() {
    assert_eq!(
        sparse_pattern(Some("skills/foo")).as_deref(),
        Some("skills/foo")
    );
    assert_eq!(sparse_pattern(Some("a")).as_deref(), Some("a"));

    // Nothing to narrow to, or something we refuse to hand to git. Every one
    // of these means "use the full checkout", never an error.
    assert_eq!(sparse_pattern(None), None);
    assert_eq!(sparse_pattern(Some("")), None);
    assert_eq!(sparse_pattern(Some("   ")), None);
    assert_eq!(sparse_pattern(Some("/")), None);
    assert_eq!(sparse_pattern(Some("../escape")), None);
    assert_eq!(sparse_pattern(Some("skills/../../etc")), None);
    assert_eq!(sparse_pattern(Some("skills/./foo")), None);
    assert_eq!(sparse_pattern(Some("skills//foo")), None);
    assert_eq!(sparse_pattern(Some("/skills/foo")), None);
    assert_eq!(sparse_pattern(Some("skills/foo/")), None);
}

/// The pattern handed to git has to name the same directory the caller will
/// join onto the checkout. Tidying these up instead of refusing them would
/// narrow to a neighbouring directory, pass the guard, and leave the caller
/// reading a path the checkout does not have — with no failure to fall back
/// on, because from git's point of view everything succeeded.
#[cfg(unix)]
#[test]
fn sparse_pattern_refuses_names_it_would_have_to_rewrite() {
    // A trailing space and a backslash are both legal in a unix directory name.
    assert_eq!(sparse_pattern(Some("skills/foo ")), None);
    assert_eq!(sparse_pattern(Some(" skills/foo")), None);
    assert_eq!(sparse_pattern(Some("skills\\foo")), None);
}

#[test]
fn sparse_checkout_holds_a_skill_distinguishes_a_skill_from_leftovers() {
    let tmp = tempdir().unwrap();
    let root = tmp.path();

    // Missing entirely — what `sparse-checkout set` leaves behind when the
    // path does not exist upstream, silently and with exit code 0.
    assert!(!sparse_checkout_holds_a_skill(root, "skills/gone"));

    // Present but empty.
    fs::create_dir_all(root.join("skills/empty")).unwrap();
    assert!(!sparse_checkout_holds_a_skill(root, "skills/empty"));

    // Non-empty but not a skill and holding none: upstream reorganized and
    // left something else at the recorded path. This must fail so the caller
    // falls back to a full checkout, where the locator search can find the
    // skill at its new home.
    fs::create_dir_all(root.join("skills/moved")).unwrap();
    fs::write(root.join("skills/moved/README.md"), "moved elsewhere").unwrap();
    assert!(!sparse_checkout_holds_a_skill(root, "skills/moved"));

    // A skill.
    fs::create_dir_all(root.join("skills/real")).unwrap();
    fs::write(root.join("skills/real/SKILL.md"), "---\nname: real\n---").unwrap();
    assert!(sparse_checkout_holds_a_skill(root, "skills/real"));

    // A directory that only *contains* skills is refused, even though the
    // narrow checkout of it looks perfectly healthy. `resolve_skill_dir` takes
    // a stored path only when the path itself is a skill and otherwise
    // searches the whole repository for its locator id; against a tree holding
    // one directory that search does not fail cleanly, it can land on whatever
    // skill happens to be inside the narrow scope. Refusing containers here is
    // what keeps that search on a full checkout.
    fs::create_dir_all(root.join("group/inner")).unwrap();
    fs::write(root.join("group/inner/SKILL.md"), "---\nname: inner\n---").unwrap();
    assert!(!sparse_checkout_holds_a_skill(root, "group"));
}

/// The cancelled-reset guard in `try_update_cached_repo` recognizes a
/// cancellation by its message, so the two have to keep agreeing: if they
/// drift, cancelling an install goes back to deleting a healthy cache.
#[test]
fn a_cancelled_git_run_reports_itself_as_a_cancellation() {
    let tmp = tempdir().unwrap();
    let cancel = Arc::new(AtomicBool::new(true));
    let err = run_git_watched_at(tmp.path(), &["status"], None, Some(&cancel), &None)
        .expect_err("a set cancel flag must abort the run");
    assert!(is_cancellation(&err), "got {err}");
}

#[test]
fn copy_dir_contents_copies_nested_files() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("src");
    fs::create_dir_all(src.join("a/b")).unwrap();
    fs::write(src.join("top.txt"), "top").unwrap();
    fs::write(src.join("a/b/deep.txt"), "deep").unwrap();

    let dst = tmp.path().join("dst");
    copy_dir_contents(&src, &dst, None).unwrap();

    assert_eq!(fs::read_to_string(dst.join("top.txt")).unwrap(), "top");
    assert_eq!(
        fs::read_to_string(dst.join("a/b/deep.txt")).unwrap(),
        "deep"
    );
}

#[cfg(unix)]
#[test]
fn copy_dir_contents_skips_symlinks_instead_of_following_them_out() {
    let tmp = tempdir().unwrap();
    let outside = tmp.path().join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("secret.txt"), "not ours").unwrap();

    let src = tmp.path().join("src");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("kept.txt"), "kept").unwrap();
    std::os::unix::fs::symlink(&outside, src.join("escape")).unwrap();

    let dst = tmp.path().join("dst");
    copy_dir_contents(&src, &dst, None).unwrap();

    assert!(dst.join("kept.txt").exists());
    assert!(
        !dst.join("escape").exists(),
        "a symlink out of the cache must not be followed into the checkout"
    );
}

#[test]
fn copy_dir_contents_honours_cancellation() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("src");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("a.txt"), "a").unwrap();

    let cancel = Arc::new(AtomicBool::new(true));
    let err = copy_dir_contents(&src, &tmp.path().join("dst"), Some(&cancel)).unwrap_err();
    assert!(is_cancellation(&err), "got {err}");
}

// ── narrow clone, end to end (network; run with `-- --ignored`) ──

const SPARSE_REPO: &str = "https://github.com/anthropics/skills";
const SPARSE_SUBPATH: &str = "skills/mcp-builder";
const SPARSE_SIBLING: &str = "skills/canvas-design";

#[test]
#[ignore = "hits the network"]
fn narrow_clone_fetches_one_skill_and_leaves_its_siblings_behind() {
    let tmp = tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().to_path_buf()));

    let checkout = clone_repo_ref_scoped(SPARSE_REPO, None, Some(SPARSE_SUBPATH), None, None, None)
        .expect("narrow clone must succeed against a filter-capable remote");

    assert!(
        checkout.join(SPARSE_SUBPATH).join("SKILL.md").is_file(),
        "the requested skill must be checked out"
    );
    assert!(
        !checkout.join(SPARSE_SIBLING).exists(),
        "a sibling skill must not be downloaded — that is the whole point"
    );
    assert!(
        repo_cache_dir_for(SPARSE_REPO, true).exists(),
        "the narrow checkout must come from the sparse cache slot"
    );
    assert!(
        !repo_cache_dir_for(SPARSE_REPO, false).exists(),
        "the full cache slot must be left untouched"
    );
    // End to end, over a real partial clone: what the caller receives is not
    // one. Callers run plain git against this directory, so it has to be
    // incapable of wandering onto the network behind their back.
    for key in ["remote.origin.promisor", "remote.origin.partialclonefilter"] {
        let out = Command::new("git")
            .arg("-C")
            .arg(&checkout)
            .args(["config", "--get", key])
            .output()
            .unwrap();
        assert!(
            !out.status.success(),
            "the install checkout must be detached from the promisor remote ({key})"
        );
    }

    // A second skill from the same repo reuses the cache — its objects are
    // what cost something — and re-scopes the worktree to itself.
    let second = clone_repo_ref_scoped(SPARSE_REPO, None, Some(SPARSE_SIBLING), None, None, None)
        .expect("a second skill must reuse the cache");
    assert!(second.join(SPARSE_SIBLING).join("SKILL.md").is_file());
    assert!(
        !second.join(SPARSE_SUBPATH).exists(),
        "each checkout carries the skill it asked for, not every earlier one"
    );

    cleanup_temp(&checkout);
    cleanup_temp(&second);
    central_repo::set_test_base_dir_override(None);
}

#[test]
#[ignore = "hits the network"]
fn a_container_subpath_falls_back_to_the_full_checkout() {
    let tmp = tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().to_path_buf()));

    // `skills` holds skills but is not one. Narrowing to it would leave the
    // locator search looking at a fraction of the repository.
    let checkout = clone_repo_ref_scoped(SPARSE_REPO, None, Some("skills"), None, None, None)
        .expect("a container subpath must degrade to a full checkout");

    assert!(checkout.join(SPARSE_SUBPATH).join("SKILL.md").is_file());
    assert!(
        checkout.join(SPARSE_SIBLING).join("SKILL.md").is_file(),
        "the fallback must be a full checkout, siblings included"
    );

    cleanup_temp(&checkout);
    central_repo::set_test_base_dir_override(None);
}

#[test]
#[ignore = "hits the network"]
fn a_subpath_that_no_longer_exists_falls_back_to_the_full_checkout() {
    let tmp = tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().to_path_buf()));

    // `sparse-checkout set` succeeds on a path that is not in the tree — it
    // simply leaves it absent — so without the post-checkout inspection this
    // would hand back a checkout missing the very directory it was asked for,
    // instead of a repository the locator search can walk.
    let checkout = clone_repo_ref_scoped(
        SPARSE_REPO,
        None,
        Some("skills/this-skill-does-not-exist"),
        None,
        None,
        None,
    )
    .expect("a stale subpath must degrade to a full checkout, not an error");

    assert!(
        checkout.join(SPARSE_SUBPATH).join("SKILL.md").is_file(),
        "the fallback must be a full checkout the caller can search"
    );

    cleanup_temp(&checkout);
    central_repo::set_test_base_dir_override(None);
}
// ── the promisor boundary ──

/// The rule this locks in: nothing handed outside this module is a partial
/// clone. If someone removes the detach, callers' plain `git` calls silently
/// become network calls again — which is the maintenance cost the narrow
/// clone would otherwise impose on every future change.
#[test]
fn an_install_checkout_is_never_left_attached_to_a_promisor_remote() {
    let tmp = tempdir().unwrap();
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();
    assert!(Command::new("git")
        .arg("-C")
        .arg(&repo)
        .arg("init")
        .status()
        .is_ok_and(|s| s.success()));
    for (key, value) in [
        ("remote.origin.url", "https://example.invalid/x.git"),
        ("remote.origin.promisor", "true"),
        ("remote.origin.partialclonefilter", "blob:none"),
    ] {
        Command::new("git")
            .arg("-C")
            .arg(&repo)
            .args(["config", key, value])
            .status()
            .unwrap();
    }

    detach_from_promisor(&repo);

    for key in ["remote.origin.promisor", "remote.origin.partialclonefilter"] {
        let out = Command::new("git")
            .arg("-C")
            .arg(&repo)
            .args(["config", "--get", key])
            .output()
            .unwrap();
        assert!(
            !out.status.success(),
            "{key} must be gone, still reads {}",
            String::from_utf8_lossy(&out.stdout).trim()
        );
    }
    // The remote itself stays: it is what `source_ref_resolved` reports and
    // what a later fetch of this checkout would use.
    let url = Command::new("git")
        .arg("-C")
        .arg(&repo)
        .args(["config", "--get", "remote.origin.url"])
        .output()
        .unwrap();
    assert!(url.status.success());
}

/// Pins the *outcome* rather than the config keys: a checkout that has been
/// detached must fail on a missing object without reaching for the remote.
///
/// Naming the keys is not enough on its own. Git registers a promisor remote
/// from any of three settings, so a key set that is right for today's git and
/// wrong for another would leave lazy fetching switched back on with every
/// key-checking test still green. This one asks the question the boundary is
/// actually about, and needs no network to do it: the partial clone is served
/// over `file://` from a repo in the same temp directory.
#[test]
fn a_detached_checkout_fails_on_a_missing_object_without_reaching_the_remote() {
    fn git(dir: &Path, args: &[&str]) -> std::process::Output {
        Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .expect("git must be runnable")
    }

    let tmp = tempdir().unwrap();
    let source = tmp.path().join("source");
    fs::create_dir_all(source.join("kept")).unwrap();
    fs::create_dir_all(source.join("absent")).unwrap();
    fs::write(source.join("kept/f.txt"), "kept").unwrap();
    fs::write(source.join("absent/f.txt"), "absent").unwrap();
    git(&source, &["init"]);
    git(&source, &["add", "-A"]);
    git(
        &source,
        &[
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-m",
            "init",
        ],
    );
    // The filter is served by the *source* repo, so the switch belongs there.
    git(&source, &["config", "uploadpack.allowFilter", "true"]);

    // `file://` needs forward slashes and, on Windows, a slash before the
    // drive letter: `file:///C:/…` where unix wants `file:///tmp/…`.
    fn file_url(path: &Path) -> String {
        let raw = path.display().to_string().replace('\\', "/");
        if raw.starts_with('/') {
            format!("file://{raw}")
        } else {
            format!("file:///{raw}")
        }
    }

    let checkout = tmp.path().join("checkout");
    let source_url = file_url(&source);
    let cloned = Command::new("git")
        .args(["clone", "--filter=blob:none", "--no-local", "--no-checkout"])
        .arg("--sparse")
        .arg(&source_url)
        .arg(&checkout)
        .output()
        .unwrap();
    assert!(
        cloned.status.success(),
        "clone failed: {}",
        String::from_utf8_lossy(&cloned.stderr)
    );
    git(&checkout, &["sparse-checkout", "set", "--cone", "kept"]);
    git(&checkout, &["checkout"]);
    // Stand in for a git that records the promisor under `extensions` instead
    // of, or as well as, the two `remote.origin.*` keys. Today's git writes
    // only the latter pair, so without this line the third key in
    // `detach_from_promisor` would be defensive code no test ever exercises —
    // and dropping it from the list would go unnoticed.
    git(&checkout, &["config", "extensions.partialClone", "origin"]);

    let oid = git(&checkout, &["rev-parse", "HEAD:absent/f.txt"]);
    let oid = String::from_utf8_lossy(&oid.stdout).trim().to_string();

    // Point origin somewhere that does not exist, so any attempt to reach it
    // is unmistakable in the error rather than quietly succeeding.
    let gone = file_url(&tmp.path().join("gone"));
    git(&checkout, &["config", "remote.origin.url", &gone]);

    // Precondition, asserted rather than assumed: this really is a partial
    // clone with that object missing. Without it the test could pass on a git
    // that ignored the filter and fetched everything.
    let before = git(&checkout, &["cat-file", "-s", &oid]);
    let before_err = String::from_utf8_lossy(&before.stderr).to_string();
    assert!(
        !before.status.success() && before_err.contains("promisor"),
        "setup must produce a genuine partial clone, got: {before_err}"
    );

    detach_from_promisor(&checkout);

    let after = git(&checkout, &["cat-file", "-s", &oid]);
    let after_err = String::from_utf8_lossy(&after.stderr).to_string();
    assert!(!after.status.success(), "the object is still missing");
    assert!(
        !after_err.contains("promisor") && !after_err.contains(&gone),
        "a detached checkout must not go to the remote for a missing object, got: {after_err}"
    );

    // And the objects it does have are still readable.
    assert_eq!(
        fs::read_to_string(checkout.join("kept/f.txt")).unwrap(),
        "kept"
    );
}

// ── cache prune ──

/// Writes the marker deep inside the slot, the way git writes fetched objects,
/// so the recency signal has to come from a walk rather than the slot's own
/// directory mtime.
fn seed_cache_slot(root: &Path, name: &str, bytes: usize, used: std::time::SystemTime) {
    let deep = root.join(name).join(".git").join("objects");
    fs::create_dir_all(&deep).unwrap();
    let blob = deep.join("pack");
    fs::write(&blob, vec![b'x'; bytes]).unwrap();
    std::fs::File::options()
        .write(true)
        .open(&blob)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(used))
        .unwrap();
}

#[test]
fn prune_is_a_no_op_while_the_cache_fits() {
    let tmp = tempdir().unwrap();
    let root = tmp.path();
    seed_cache_slot(root, "a", 1024, std::time::UNIX_EPOCH);

    prune_cache_root(root, &root.join("nothing"), 8192);

    assert!(
        root.join("a").exists(),
        "a cache under the limit is left alone"
    );
}

#[test]
fn prune_ranks_by_the_newest_file_inside_a_slot_not_the_slot_itself() {
    // Both slots were created now; only their contents differ in age. Ranking
    // on the directory's own mtime cannot tell them apart, which is exactly
    // the mistake this guards against.
    let tmp = tempdir().unwrap();
    let root = tmp.path();

    let now = std::time::SystemTime::now();
    seed_cache_slot(root, "stale", 4096, now - Duration::from_secs(86_400 * 30));
    seed_cache_slot(root, "fresh", 4096, now);

    // Make the two signals disagree on purpose, or this test proves nothing:
    // adding an entry to `stale` bumps that directory's own mtime to now, so
    // by directory mtime `stale` looks like the *most* recently used slot,
    // while the only file in it is a month old. Ranking on the directory
    // therefore evicts `fresh` and keeps `stale` — the exact inversion this
    // guards against. An empty directory adds no bytes and no file mtime, so
    // it cannot move the correct signal.
    fs::create_dir_all(root.join("stale").join("refs")).unwrap();

    prune_cache_root(root, &root.join("nothing"), 6000);

    assert!(!root.join("stale").exists(), "the stale slot goes first");
    assert!(root.join("fresh").exists(), "the recently used slot stays");
}

#[test]
fn prune_evicts_the_least_recently_used_and_spares_the_slot_being_written() {
    let tmp = tempdir().unwrap();
    let root = tmp.path();

    let now = std::time::SystemTime::now();
    let day = Duration::from_secs(86_400);
    // `being-written` is deliberately the *least* recently used slot. If it
    // were the newest, plain LRU would spare it anyway and the guard could be
    // deleted with every assertion still green — which is exactly how the
    // first version of this test proved nothing.
    seed_cache_slot(root, "being-written", 4096, now - day * 30);
    seed_cache_slot(root, "middle", 4096, now - day);
    seed_cache_slot(root, "newest", 4096, now);

    // Fits two of the three.
    prune_cache_root(root, &root.join("being-written"), 10_000);

    assert!(
        root.join("being-written").exists(),
        "the slot the caller is about to clone into must survive, even as the \
             least recently used one"
    );
    assert!(
        !root.join("middle").exists(),
        "eviction moves past the protected slot to the next oldest"
    );
    assert!(root.join("newest").exists(), "eviction stops once it fits");
}

#[test]
fn prune_skips_a_slot_another_install_is_holding() {
    let tmp = tempdir().unwrap();
    let root = tmp.path();

    let now = std::time::SystemTime::now();
    seed_cache_slot(root, "held", 4096, now - Duration::from_secs(86_400 * 30));
    seed_cache_slot(root, "free", 4096, now - Duration::from_secs(86_400));

    // Stand in for another install that already holds the oldest slot.
    let held = lock_repo_cache(&root.join("held"), &None).unwrap();

    prune_cache_root(root, &root.join("nothing"), 6000);

    assert!(
        root.join("held").exists(),
        "deleting a checkout out from under a running install would break it"
    );
    assert!(
        !root.join("free").exists(),
        "eviction moves on to the next candidate instead of giving up"
    );
    drop(held);
}
