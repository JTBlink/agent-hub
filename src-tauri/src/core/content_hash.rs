use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const IGNORED: &[&str] = &[".git", ".gitignore"];

/// Generated caches and OS metadata that need no delivery or removal warning.
pub(crate) fn is_regenerable(name: &str) -> bool {
    matches!(name, "__pycache__" | ".DS_Store" | "Thumbs.db") || name.ends_with(".pyc")
}

/// True for names excluded from a skill's content scope: the exact-match
/// [`IGNORED`] entries plus [`is_regenerable`] artifacts. Python caches are
/// regenerated whenever a skill's Python scripts run, so without excluding
/// them a copy-mode deployment would read as permanently "changed" against
/// the library the first time the skill is used.
fn is_ignored(name: &str) -> bool {
    IGNORED.contains(&name) || is_regenerable(name)
}

/// Dependency installs (`npm install`, a Python venv) inside a skill. They stay
/// in the content hash — a directory that holds them is not interchangeable
/// with one that doesn't, and repairs that replace a directory on hash
/// equality must keep seeing the difference. Only the update-check tiebreaker
/// ([`hash_directory_eol_insensitive`]) looks past them (#502). The cost is
/// that an edit to a file a skill keeps under a directory with one of these
/// names goes unnoticed by that tiebreaker — nobody authors skill files there.
const DEPENDENCY_DIRS: &[&str] = &["node_modules", ".venv", "venv"];

/// One file in a skill's canonical "content scope" — the set of files that
/// both [`hash_directory`] and the source-diff command operate on. Sharing
/// this enumeration keeps the update badge and the diff from ever
/// disagreeing about which files count.
pub struct ContentEntry {
    /// Path relative to the scanned directory, in the same lossy form the
    /// hash consumes (keeps the hashed byte stream stable).
    pub relative_path: String,
    pub path: PathBuf,
    /// `mode & 0o111` on unix when metadata is readable, else `None`.
    /// Always `None` on non-unix. `None` means "not folded into the hash".
    pub exec_bits: Option<u32>,
    /// Modification time in ms since the Unix epoch, captured during the walk
    /// so callers don't need a second `metadata()` syscall (or a separate
    /// recursive walk) just to learn when the content last changed.
    pub modified_ms: Option<i64>,
}

impl ContentEntry {
    pub fn is_executable(&self) -> bool {
        self.exec_bits.is_some_and(|bits| bits != 0)
    }
}

#[cfg(unix)]
fn exec_bits_of(path: &Path) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    path.metadata().ok().map(|m| m.permissions().mode() & 0o111)
}

#[cfg(not(unix))]
fn exec_bits_of(_path: &Path) -> Option<u32> {
    None
}

/// Enumerate the files that make up a skill's content, sorted by path and
/// filtered by the shared ignore-list. Single source of truth for "what is
/// skill content"; hashing and diffing both build on it.
///
/// Traversal errors are dropped, so an unreadable subdirectory reads as absent.
/// Callers that must not mistake "could not look" for "not there" want
/// [`list_content_files_strict`] instead.
pub fn list_content_files(dir: &Path) -> Vec<ContentEntry> {
    // The lossy walk cannot fail: every error is skipped below.
    walk_content_files(dir, false, false).unwrap_or_default()
}

/// [`list_content_files`] over the same content scope, but a directory that
/// cannot be traversed is an error rather than an empty one.
pub fn list_content_files_strict(dir: &Path) -> Result<Vec<ContentEntry>> {
    walk_content_files(dir, true, false)
}

fn walk_content_files(dir: &Path, strict: bool, skip_deps: bool) -> Result<Vec<ContentEntry>> {
    let mut entries = Vec::new();
    for result in WalkDir::new(dir).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !is_ignored(&name)
            && !(skip_deps
                && e.depth() > 0
                && e.file_type().is_dir()
                && DEPENDENCY_DIRS.contains(&name.as_ref()))
    }) {
        match result {
            Ok(entry) if entry.file_type().is_file() => entries.push(entry),
            Ok(_) => {}
            Err(err) if strict => {
                return Err(
                    anyhow::Error::new(err).context(format!("failed to walk {}", dir.display()))
                );
            }
            Err(_) => {}
        }
    }

    entries.sort_by(|a, b| a.path().cmp(b.path()));

    let mapped = entries
        .into_iter()
        .map(|entry| {
            let relative_path = entry
                .path()
                .strip_prefix(dir)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .into_owned();
            // Normalize Windows separators to `/` so the hashed byte
            // stream is identical across platforms — otherwise Windows
            // feeds `sub\c.md` into the hash and disagrees with every
            // other OS about the same content. Windows-only because `\`
            // is a legal filename character on unix.
            #[cfg(windows)]
            let relative_path = relative_path.replace('\\', "/");
            let exec_bits = exec_bits_of(entry.path());
            // Reuse WalkDir's already-fetched metadata for the mtime: no extra
            // stat, and no separate recursive walk to answer "last modified?".
            let modified_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64);
            ContentEntry {
                relative_path,
                path: entry.into_path(),
                exec_bits,
                modified_ms,
            }
        })
        .collect();
    Ok(mapped)
}

/// Hash a prepared content-file list. Split out from [`hash_directory`] so a
/// caller that already walked the tree (via [`list_content_files`]) can hash
/// and inspect the same entries without walking again (#248).
pub fn hash_entries(entries: &[ContentEntry]) -> String {
    let mut hasher = Sha256::new();
    for entry in entries {
        hasher.update(entry.relative_path.as_bytes());
        if let Ok(content) = std::fs::read(&entry.path) {
            hasher.update(&content);
        }
        // Include executable bit so permission-only changes are detected.
        #[cfg(unix)]
        if let Some(bits) = entry.exec_bits {
            hasher.update(bits.to_le_bytes());
        }
    }
    hex::encode(hasher.finalize())
}

/// Latest content-file modification time (ms since epoch) from a prepared
/// entry list. Scoped to the same files the hash covers: dirs, `.git`,
/// `.DS_Store`, and `*.pyc` are excluded, so it reflects real content change.
pub fn latest_modified_ms(entries: &[ContentEntry]) -> Option<i64> {
    entries.iter().filter_map(|e| e.modified_ms).max()
}

pub fn hash_directory(dir: &Path) -> Result<String> {
    Ok(hash_entries(&list_content_files(dir)))
}

/// True when `content` is text this may safely fold: valid UTF-8 with no NUL.
///
/// Both halves are needed, and both are deliberately stricter than git's
/// heuristic (a NUL in the first 8000 bytes). Git is deciding how to *display*
/// a file; this decides whether two files are the same, so every wrong answer
/// here hides a real change:
/// - a binary whose first NUL falls past byte 8000 is text to git, and two such
///   files differing by one `\r` would fold into each other;
/// - a binary with no NUL at all (`FF 0D 0A` vs `FF 0A`) passes any NUL test,
///   so "no NUL" cannot establish text on its own.
///
/// Requiring valid UTF-8 draws the line at a representation whose `\r\n` really
/// is a line ending. It also means text in a non-UTF-8 encoding is treated as
/// binary and its line endings are not folded — that direction is the safe one:
/// an update is offered that may not be needed, rather than a real one hidden.
fn is_foldable_text(content: &[u8]) -> bool {
    !content.contains(&0) && std::str::from_utf8(content).is_ok()
}

/// Fold CRLF line endings to LF in content [`is_foldable_text`] accepts;
/// everything else is returned untouched.
///
/// The guarantee is bounded, and worth stating exactly: content that fails that
/// test is never folded, so the `FF 0D 0A` / `FF 0A` class of binary cannot
/// normalize together. It is *not* a claim that no two meaningfully different
/// files can — a file that is valid UTF-8 and NUL-free is folded whether or not
/// its `\r\n` carries meaning (a fixture asserting CRLF handling, say). Drawing
/// the line anywhere admits some such file; this one is drawn where `\r\n`
/// almost always is a line ending.
///
/// A lone `\r` (old-Mac line ending, or a carriage return inside a progress
/// bar) is left alone — only `\r\n` is a line ending both platforms mean the
/// same thing by.
fn fold_crlf(content: &[u8]) -> Cow<'_, [u8]> {
    if !is_foldable_text(content) || !content.windows(2).any(|pair| pair == b"\r\n") {
        return Cow::Borrowed(content);
    }
    let mut folded = Vec::with_capacity(content.len());
    let mut index = 0;
    while index < content.len() {
        if content[index] == b'\r' && content.get(index + 1) == Some(&b'\n') {
            index += 1; // drop the CR, keep the LF the next iteration copies
            continue;
        }
        folded.push(content[index]);
        index += 1;
    }
    Cow::Owned(folded)
}

/// Hash the same content scope as [`hash_entries`], with CRLF folded to LF in
/// text files.
///
/// This is a **tiebreaker, not a replacement**: [`hash_entries`] stays the
/// stored, byte-exact identity of a skill, and this is only consulted once two
/// byte hashes already disagree, to answer the narrower question "do these two
/// trees differ by anything other than line endings?".
///
/// It exists because a skill that reaches one machine through a git checkout
/// and another through our own byte copy legitimately holds the same content in
/// two encodings: Git for Windows defaults to `core.autocrlf=true`, so the same
/// file is CRLF there and LF on macOS. Nothing is wrong in that case and the
/// user must not be told there is an update.
///
/// Unlike [`hash_entries`], an unreadable file is an **error, not an empty
/// file**. The two differ in what a wrong answer costs: a byte hash that cannot
/// read a file reports "changed" and the user is offered an update they may not
/// need, while this function's answer *suppresses* an update, so a file it
/// could not read must never be quietly treated as matching the other side.
///
/// Each field is length-framed, where [`hash_entries`] concatenates a path
/// directly onto its content. Unframed, a rename that shifts bytes across the
/// boundary collides: `ab` holding `c\n` and `a` holding `bc\r\n` both feed
/// `abc\n` into the hasher, so a removed file, an added file and a content
/// change all read as "no difference". `hash_entries` shares that flaw and is
/// deliberately left alone — it is the stored identity of every skill, and
/// reframing it would invalidate every hash on disk.
pub fn hash_entries_eol_insensitive(entries: &[ContentEntry]) -> Result<String> {
    let mut hasher = Sha256::new();
    for entry in entries {
        let path = entry.relative_path.as_bytes();
        hasher.update((path.len() as u64).to_le_bytes());
        hasher.update(path);
        let content = std::fs::read(&entry.path)
            .with_context(|| format!("failed to read {}", entry.path.display()))?;
        let folded = fold_crlf(&content);
        hasher.update((folded.len() as u64).to_le_bytes());
        hasher.update(folded.as_ref());
        // Kept in step with `hash_entries`: a permission-only change is still
        // a change, and must not hide behind the line-ending comparison.
        #[cfg(unix)]
        if let Some(bits) = entry.exec_bits {
            hasher.update(bits.to_le_bytes());
        }
    }
    Ok(hex::encode(hasher.finalize()))
}

/// [`hash_entries_eol_insensitive`] over a directory, enumerated strictly.
///
/// Two refusals rather than an answer, both because this function's answer can
/// only ever *suppress* an update:
/// - a directory that cannot be traversed is an error, not an absent one —
///   otherwise two trees whose unreadable subtrees hold different files would
///   match on what remains;
/// - an empty or missing directory is an error, not "the hash of nothing",
///   which every empty tree would share.
///
/// Dependency installs ([`DEPENDENCY_DIRS`]) are skipped as well: `npm install`
/// in a local skill's source is not an update to offer (#502).
pub fn hash_directory_eol_insensitive(dir: &Path) -> Result<String> {
    let entries = walk_content_files(dir, true, true)?;
    if entries.is_empty() {
        anyhow::bail!("no content files under {}", dir.display());
    }
    hash_entries_eol_insensitive(&entries)
}

#[cfg(test)]
mod tests;
