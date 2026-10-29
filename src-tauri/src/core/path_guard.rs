//! Centralized path safety helpers.
//!
//! `sanitize_name` strips characters that are unsafe as filesystem names,
//! collapses dot sequences, and caps length — use for any caller-supplied
//! skill/directory name before joining it to a base path.
//!
//! `is_path_safe` canonicalizes both inputs and verifies the target stays
//! inside the base directory. Call before any write/delete/copy that
//! consumes a path derived from untrusted input.

use std::path::{Component, Path, PathBuf};

use super::error::AppError;

/// Directory links and Windows reparse points are unsafe deletion boundaries.
pub(crate) fn is_link_or_reparse_point(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    metadata.file_type().is_symlink()
}

pub(crate) fn ensure_safe_skill_relative_path(skill_relative_path: &str) -> Result<(), AppError> {
    if skill_relative_path.trim().is_empty() {
        return Err(AppError::invalid_input("Invalid skill directory path"));
    }
    let mut saw_component = false;
    for component in Path::new(skill_relative_path).components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(AppError::invalid_input("Invalid skill directory path"));
        }
        saw_component = true;
    }
    if !saw_component {
        return Err(AppError::invalid_input("Invalid skill directory path"));
    }
    Ok(())
}

pub(crate) fn ensure_dir_within_root(path: &Path, root: &Path) -> Result<(), AppError> {
    // First check that the lexical path (before symlink resolution) is under root.
    // This ensures the link itself lives where expected.
    let abs_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };
    let abs_root = if root.is_absolute() {
        root.to_path_buf()
    } else {
        std::env::current_dir()?.join(root)
    };
    if !abs_path.starts_with(&abs_root) {
        return Err(AppError::invalid_input("Invalid skill directory path"));
    }
    Ok(())
}

/// Refuse equal or nested publication paths. Callers resolve and validate
/// each path first, so comparisons cannot hide link aliases or `..` segments.
pub(crate) fn ensure_disjoint_paths(first: &Path, second: &Path) -> Result<(), AppError> {
    if first.starts_with(second) || second.starts_with(first) {
        return Err(AppError::invalid_input(
            "Project source and deployment paths overlap",
        ));
    }
    Ok(())
}

/// Maximum filesystem name length we'll allow. Matches the lowest common
/// denominator (most modern filesystems allow 255 bytes).
const MAX_NAME_LEN: usize = 200;

/// Fallback used when sanitization strips everything out.
const FALLBACK_NAME: &str = "unnamed";

/// Sanitize a filesystem name.
///
/// - Strips path separators and Windows-forbidden characters
/// - Removes null bytes and other control characters
/// - Collapses `..` sequences (no traversal)
/// - Trims leading/trailing dots and whitespace
/// - Truncates to MAX_NAME_LEN bytes
/// - Returns FALLBACK_NAME when input collapses to empty
pub fn sanitize_name(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        let drop = matches!(
            ch,
            '/' | '\\' | '\0' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
        ) || ch.is_control();
        if !drop {
            out.push(ch);
        }
    }

    // Collapse any run of dots into a single dot so ".." cannot survive,
    // even if other characters were stripped between dots.
    let mut collapsed = String::with_capacity(out.len());
    let mut prev_dot = false;
    for ch in out.chars() {
        if ch == '.' {
            if !prev_dot {
                collapsed.push('.');
            }
            prev_dot = true;
        } else {
            collapsed.push(ch);
            prev_dot = false;
        }
    }

    let trimmed = collapsed.trim_matches(|c: char| c == '.' || c.is_whitespace());

    let truncated = if trimmed.len() > MAX_NAME_LEN {
        // Cut on a char boundary at or below the byte limit.
        let mut end = MAX_NAME_LEN;
        while !trimmed.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        &trimmed[..end]
    } else {
        trimmed
    };

    if truncated.is_empty() {
        FALLBACK_NAME.to_string()
    } else {
        truncated.to_string()
    }
}

/// Verify that `target` resolves to a location inside `base`.
///
/// Both paths are canonicalized when possible so symlinks and `..` segments
/// are resolved before comparison. When canonicalize fails (e.g. target does
/// not yet exist), falls back to a normalized path comparison.
///
/// Returns `false` when the relationship cannot be established safely —
/// callers should treat that as a refusal.
pub fn is_path_safe(base: &Path, target: &Path) -> bool {
    let base_resolved = base.canonicalize().unwrap_or_else(|_| normalize(base));
    let target_resolved = target
        .canonicalize()
        .unwrap_or_else(|_| resolve_non_existing(target));

    target_resolved.starts_with(&base_resolved)
}

/// Resolve a path that may not exist yet by walking from the nearest
/// existing ancestor.
fn resolve_non_existing(path: &Path) -> PathBuf {
    for anc in path.ancestors() {
        if let Ok(real) = anc.canonicalize() {
            let mut out = real;
            if let Ok(rest) = path.strip_prefix(anc) {
                out.push(rest);
            }
            return normalize(&out);
        }
    }
    normalize(path)
}

/// Resolve `.` and `..` segments without touching the filesystem.
pub(crate) fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn sanitize_strips_path_separators() {
        assert_eq!(sanitize_name("foo/bar"), "foobar");
        assert_eq!(sanitize_name("foo\\bar"), "foobar");
    }

    #[test]
    fn sanitize_blocks_traversal() {
        assert_eq!(sanitize_name("../etc/passwd"), "etcpasswd");
        assert_eq!(sanitize_name(".."), FALLBACK_NAME);
        assert_eq!(sanitize_name("../../.."), FALLBACK_NAME);
    }

    #[test]
    fn sanitize_strips_windows_forbidden() {
        assert_eq!(sanitize_name("a:b*c?d\"e<f>g|h"), "abcdefgh");
    }

    #[test]
    fn sanitize_strips_null_and_control() {
        assert_eq!(sanitize_name("foo\0bar"), "foobar");
        assert_eq!(sanitize_name("foo\nbar"), "foobar");
    }

    #[test]
    fn sanitize_trims_dots_and_whitespace() {
        assert_eq!(sanitize_name("  .hidden  "), "hidden");
        assert_eq!(sanitize_name("..."), FALLBACK_NAME);
        assert_eq!(sanitize_name(".foo."), "foo");
    }

    #[test]
    fn sanitize_collapses_consecutive_dots() {
        // ".." collapses to "." which is then trimmed away — no traversal possible.
        assert_eq!(sanitize_name("foo..bar"), "foo.bar");
    }

    #[test]
    fn sanitize_truncates_long_names() {
        let long = "a".repeat(MAX_NAME_LEN + 50);
        let out = sanitize_name(&long);
        assert!(out.len() <= MAX_NAME_LEN);
    }

    #[test]
    fn sanitize_empty_yields_fallback() {
        assert_eq!(sanitize_name(""), FALLBACK_NAME);
        assert_eq!(sanitize_name("   "), FALLBACK_NAME);
    }

    #[test]
    fn sanitize_preserves_unicode() {
        assert_eq!(sanitize_name("技能-foo"), "技能-foo");
    }

    #[test]
    fn path_safe_allows_subpath() {
        let tmp = tempdir().unwrap();
        let base = tmp.path();
        let sub = base.join("foo").join("bar");
        fs::create_dir_all(&sub).unwrap();
        assert!(is_path_safe(base, &sub));
    }

    #[test]
    fn path_safe_rejects_sibling() {
        let tmp = tempdir().unwrap();
        let base = tmp.path().join("a");
        let other = tmp.path().join("b");
        fs::create_dir_all(&base).unwrap();
        fs::create_dir_all(&other).unwrap();
        assert!(!is_path_safe(&base, &other));
    }

    #[test]
    fn path_safe_rejects_traversal() {
        let tmp = tempdir().unwrap();
        let base = tmp.path().join("base");
        fs::create_dir_all(&base).unwrap();
        let escape = base.join("..").join("escape");
        assert!(!is_path_safe(&base, &escape));
    }

    #[test]
    fn path_safe_handles_non_existing_target() {
        let tmp = tempdir().unwrap();
        let base = tmp.path();
        let future = base.join("not_yet_created").join("skill");
        assert!(is_path_safe(base, &future));
    }

    #[test]
    fn path_safe_rejects_symlink_escape() {
        #[cfg(unix)]
        {
            let tmp = tempdir().unwrap();
            let base = tmp.path().join("base");
            let outside = tmp.path().join("outside");
            fs::create_dir_all(&base).unwrap();
            fs::create_dir_all(&outside).unwrap();
            let link = base.join("escape");
            std::os::unix::fs::symlink(&outside, &link).unwrap();
            // Once canonicalized, link resolves to `outside` which is not under `base`.
            assert!(!is_path_safe(&base, &link));
        }
    }

    #[test]
    fn path_safe_accepts_base_itself() {
        let tmp = tempdir().unwrap();
        assert!(is_path_safe(tmp.path(), tmp.path()));
    }
}
