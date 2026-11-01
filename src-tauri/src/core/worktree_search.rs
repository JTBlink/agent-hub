//! Bounded text search and optimistic replacements inside one authorized checkout.
use anyhow::{bail, Context, Result};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    time::{Duration, Instant},
};

use super::{path_guard, project_file_edit, project_worktrees};
const MAX_MATCHES: usize = 1000;
const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_ENTRIES: usize = 20_000;

#[derive(Clone, Deserialize)]
pub struct SearchOptions {
    pub query: String,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub regex: bool,
    pub include: String,
    pub exclude: String,
    pub use_ignore: bool,
}
#[derive(Serialize)]
pub struct SearchMatch {
    pub line: usize,
    /// One-based UTF-16 columns, matching the editor's coordinates.
    pub column: usize,
    pub end_column: usize,
    pub preview: String,
    pub preview_start: usize,
}
#[derive(Serialize, Deserialize)]
pub struct SearchFile {
    pub path: String,
    pub fingerprint: String,
    #[serde(skip_deserializing)]
    pub matches: Vec<SearchMatch>,
}
#[derive(Serialize, Default)]
pub struct SearchResult {
    pub files: Vec<SearchFile>,
    pub count: usize,
    pub truncated: bool,
    pub skipped: usize,
}

fn matcher(options: &SearchOptions) -> Result<Regex> {
    if options.query.is_empty() || options.query.len() > 4096 {
        bail!("Enter a search query between 1 and 4096 bytes");
    }
    let pattern = if options.regex {
        options.query.clone()
    } else {
        regex::escape(&options.query)
    };
    let pattern = if options.whole_word {
        format!(r"\b(?:{pattern})\b")
    } else {
        pattern
    };
    RegexBuilder::new(&pattern)
        .case_insensitive(!options.case_sensitive)
        .multi_line(true)
        .size_limit(1024 * 1024)
        .build()
        .context("Invalid search expression")
}

/// The include/exclude fields accept comma-separated paths with *, ** and ?.
fn path_filter(raw: &str) -> Result<Option<Regex>> {
    if raw.len() > 4096 {
        bail!("File filters exceed the 4096 byte limit");
    }
    let mut patterns = Vec::new();
    for pattern in raw
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        let pattern = pattern.trim_end_matches('/');
        let mut chars = pattern.chars().peekable();
        let mut expression = if pattern.contains('/') {
            "^".to_string()
        } else {
            "(?:^|/)".to_string()
        };
        while let Some(ch) = chars.next() {
            match ch {
                '*' if chars.peek() == Some(&'*') => {
                    chars.next();
                    if chars.peek() == Some(&'/') {
                        chars.next();
                        expression.push_str("(?:.*/)?");
                    } else {
                        expression.push_str(".*");
                    }
                }
                '*' => expression.push_str("[^/]*"),
                '?' => expression.push_str("[^/]"),
                _ => expression.push_str(&regex::escape(&ch.to_string())),
            }
        }
        expression.push_str("(?:/.*)?$");
        patterns.push(expression);
    }
    if patterns.is_empty() {
        return Ok(None);
    }
    Ok(Some(Regex::new(&patterns.join("|"))?))
}
fn fingerprint(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

fn find_matches(content: &str, regex: &Regex, remaining: usize) -> (Vec<SearchMatch>, bool) {
    let mut result = Vec::new();
    let mut line_start = 0;
    let mut line_number = 1;
    for found in regex.find_iter(content) {
        if result.len() == remaining {
            return (result, true);
        }
        while let Some(newline) = content[line_start..found.start()].find('\n') {
            line_start += newline + 1;
            line_number += 1;
        }
        let line_end = content[found.start()..]
            .find('\n')
            .map_or(content.len(), |offset| found.start() + offset);
        // Bound long lines around the match, on Unicode character boundaries.
        let mut preview_start = found.start().saturating_sub(160).max(line_start);
        while !content.is_char_boundary(preview_start) {
            preview_start += 1;
        }
        let mut preview_end = (found.start() + 240).min(line_end);
        while !content.is_char_boundary(preview_end) {
            preview_end -= 1;
        }
        let preview = content[preview_start..preview_end]
            .trim_end_matches('\r')
            .to_string();
        result.push(SearchMatch {
            line: line_number,
            column: content[line_start..found.start()].encode_utf16().count() + 1,
            end_column: content[line_start..found.end().min(line_end)]
                .encode_utf16()
                .count()
                + 1,
            preview,
            preview_start: content[line_start..preview_start].encode_utf16().count() + 1,
        });
    }
    (result, false)
}

fn excluded(
    entry: &walkdir::DirEntry,
    root: &Path,
    options: &SearchOptions,
    repo: Option<&git2::Repository>,
    exclude: Option<&Regex>,
) -> bool {
    let name = entry.file_name().to_string_lossy();
    if name.eq_ignore_ascii_case(".git") {
        return true;
    }
    if options.use_ignore
        && matches!(
            name.as_ref(),
            "node_modules" | "target" | "dist" | ".next" | ".cache"
        )
        && entry.file_type().is_dir()
    {
        return true;
    }
    if entry.file_type().is_symlink() {
        return true;
    }
    if let Ok(metadata) = std::fs::symlink_metadata(entry.path()) {
        if path_guard::is_link_or_reparse_point(&metadata) {
            return true;
        }
    }
    let Ok(relative) = entry.path().strip_prefix(root) else {
        return true;
    };
    let relative = relative.to_string_lossy().replace('\\', "/");
    if exclude.is_some_and(|filter| filter.is_match(&relative)) {
        return true;
    }
    if options.use_ignore
        && repo.is_some_and(|repo| {
            repo.status_should_ignore(Path::new(&relative))
                .unwrap_or(false)
        })
    {
        return true;
    }
    false
}

pub fn search(root: &Path, options: &SearchOptions) -> Result<SearchResult> {
    let regex = matcher(options)?;
    let include = path_filter(&options.include)?;
    let exclude = path_filter(&options.exclude)?;
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])
            .ok();
    let started = Instant::now();
    let mut result = SearchResult::default();
    let mut bytes = 0;
    let mut walker = walkdir::WalkDir::new(root)
        .min_depth(1)
        .follow_links(false)
        .into_iter();
    let mut visited = 0;
    while let Some(entry) = walker.next() {
        visited += 1;
        if visited > MAX_ENTRIES || bytes >= MAX_BYTES || started.elapsed() > Duration::from_secs(3)
        {
            result.truncated = true;
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                result.skipped += 1;
                continue;
            }
        };
        if excluded(&entry, root, options, repo.as_ref(), exclude.as_ref()) {
            if entry.file_type().is_dir() {
                walker.skip_current_dir();
            }
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry
            .path()
            .strip_prefix(root)?
            .to_string_lossy()
            .replace('\\', "/");
        if include
            .as_ref()
            .is_some_and(|filter| !filter.is_match(&path))
        {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => {
                result.skipped += 1;
                continue;
            }
        };
        if metadata.len() > 1024 * 1024 {
            result.skipped += 1;
            continue;
        }
        bytes += metadata.len() as usize;
        let content = match project_worktrees::read_file(root, &path) {
            Ok(content) => content,
            Err(_) => {
                result.skipped += 1;
                continue;
            }
        };
        let (matches, truncated) = find_matches(&content, &regex, MAX_MATCHES - result.count);
        result.count += matches.len();
        if !matches.is_empty() {
            result.files.push(SearchFile {
                path,
                fingerprint: fingerprint(&content),
                matches,
            });
        }
        if truncated {
            result.truncated = true;
            break;
        }
    }
    result
        .files
        .sort_by(|left, right| left.path.cmp(&right.path));
    Ok(result)
}

fn replacement_content(
    original: &str,
    regex: &Regex,
    replacement: &str,
    expand: bool,
) -> Result<(String, usize)> {
    const LIMIT: usize = 1024 * 1024;
    let mut updated = String::new();
    let mut previous = 0;
    let mut count = 0;
    for captures in regex.captures_iter(original) {
        let found = captures.get(0).context("Missing search match")?;
        count += 1;
        if count > MAX_MATCHES {
            bail!("Too many replacements; narrow the search first");
        }
        let mut expanded = String::new();
        let replacement = if expand && replacement.contains('$') {
            let max_capture = captures
                .iter()
                .flatten()
                .map(|value| value.len())
                .max()
                .unwrap_or(0);
            if replacement.len().saturating_mul(max_capture + 1) > 2 * LIMIT {
                bail!("Replacement expansion exceeds the editor limit");
            }
            captures.expand(replacement, &mut expanded);
            expanded.as_str()
        } else {
            replacement
        };
        if updated.len() + found.start() - previous + replacement.len() > LIMIT {
            bail!("Replacement exceeds the 1 MiB editor limit");
        }
        updated.push_str(&original[previous..found.start()]);
        updated.push_str(replacement);
        previous = found.end();
    }
    if updated.len() + original.len() - previous > LIMIT {
        bail!("Replacement exceeds the 1 MiB editor limit");
    }
    updated.push_str(&original[previous..]);
    Ok((updated, count))
}

#[derive(Serialize)]
pub struct ReplaceResult {
    pub replaced: usize,
    pub files: usize,
    pub errors: Vec<String>,
}
/// Every file is verified against its search snapshot, then saved through the editor's atomic writer.
pub fn replace(
    root: &Path,
    options: &SearchOptions,
    replacement: &str,
    files: &[SearchFile],
) -> Result<ReplaceResult> {
    if files.is_empty() || files.len() > MAX_MATCHES || replacement.len() > 64 * 1024 {
        bail!("Invalid replacement request");
    }
    let regex = matcher(options)?;
    let mut result = ReplaceResult {
        replaced: 0,
        files: 0,
        errors: Vec::new(),
    };
    for file in files {
        let attempt = (|| -> Result<usize> {
            let original = project_worktrees::read_file(root, &file.path)?;
            if fingerprint(&original) != file.fingerprint {
                bail!("File changed on disk; search again before replacing");
            }
            let (updated, count) =
                replacement_content(&original, &regex, replacement, options.regex)?;
            project_file_edit::save(root, &file.path, &original, &updated)?;
            Ok(count)
        })();
        match attempt {
            Ok(count) => {
                result.replaced += count;
                result.files += 1;
            }
            Err(error) => result.errors.push(format!("{}: {error}", file.path)),
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests;
