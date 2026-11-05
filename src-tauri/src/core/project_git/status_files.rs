//! System Git uses its native index optimizations when inspecting large checkouts.
use super::{actions::git_command, GitFile};
use anyhow::{bail, Context, Result};
use std::path::Path;

pub(super) fn status_files(root: &Path) -> Result<(Vec<GitFile>, bool)> {
    let mut command = git_command(root);
    // No stat-cache writes, rename similarity search, or quoted/line-delimited paths.
    command.args([
        "--no-optional-locks",
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--no-renames",
    ]);
    let (output, _) = crate::core::cli_process::capture_prepared(command, "git", 30, None)
        .map_err(anyhow::Error::msg)
        .context("Unable to read Git changes")?;
    parse_status(&output)
}

fn parse_status(output: &str) -> Result<(Vec<GitFile>, bool)> {
    let mut files = Vec::new();
    for record in output.split_terminator('\0') {
        if files.len() == 1000 {
            return Ok((files, true));
        }
        let code = record.as_bytes();
        if code.len() < 4 || code[2] != b' ' {
            bail!("Git returned an invalid status record");
        }
        let path = record
            .get(3..)
            .context("Git returned an invalid file path")?;
        let conflicted = matches!(
            &code[..2],
            b"DD" | b"AU" | b"UD" | b"UA" | b"DU" | b"AA" | b"UU"
        );
        let untracked = &code[..2] == b"??";
        files.push(GitFile {
            path: path.to_owned(),
            staged: !conflicted && matches!(code[0], b'M' | b'T' | b'A' | b'D'),
            unstaged: !conflicted && (untracked || matches!(code[1], b'M' | b'T' | b'A' | b'D')),
            conflicted,
            status: if conflicted {
                "conflict"
            } else if code[..2].contains(&b'D') {
                "deleted"
            } else if untracked || code[..2].contains(&b'A') {
                "added"
            } else {
                "modified"
            }
            .into(),
        });
    }
    Ok((files, false))
}

#[cfg(test)]
mod tests;
