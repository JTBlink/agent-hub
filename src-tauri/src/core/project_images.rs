//! Bounded image reads from an authorized checkout or immutable Git objects.
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::{io::Read, path::Path};

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageRevision {
    Working,
    Index,
    Head,
    Commit,
    Parent,
}

fn mime(path: &str) -> Result<&'static str> {
    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => Ok("image/png"),
        Some("jpg" | "jpeg") => Ok("image/jpeg"),
        Some("gif") => Ok("image/gif"),
        Some("webp") => Ok("image/webp"),
        Some("bmp") => Ok("image/bmp"),
        Some("ico") => Ok("image/x-icon"),
        Some("svg") => Ok("image/svg+xml"),
        _ => bail!("Unsupported image format"),
    }
}

fn commit_id(sha: &str) -> Result<git2::Oid> {
    if sha.len() != 40 || !sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        bail!("Invalid full commit ID");
    }
    Ok(git2::Oid::from_str(sha)?)
}

pub fn read_image(
    root: &Path,
    path: &str,
    revision: ImageRevision,
    sha: Option<&str>,
) -> Result<Option<Vec<u8>>> {
    if path.is_empty() {
        bail!("Select an image file");
    }
    let target = super::project_worktrees::file_path(root, path)?;
    let mime = mime(path)?;
    let bytes = if matches!(revision, ImageRevision::Working) {
        read_working_image(&target)?
    } else {
        read_git_image(root, path, revision, sha)?
    };
    let Some(bytes) = bytes else {
        return Ok(None);
    };
    if bytes.len() > MAX_IMAGE_BYTES {
        bail!("Image exceeds the 20 MiB preview limit");
    }
    if bytes.is_empty() {
        bail!("Image file is empty");
    }
    if mime != "image/svg+xml" {
        let (width, height) = image::ImageReader::new(std::io::Cursor::new(&bytes))
            .with_guessed_format()?
            .into_dimensions()?;
        if width == 0
            || height == 0
            || width > 32_768
            || height > 32_768
            || u64::from(width) * u64::from(height) > 32 * 1024 * 1024
        {
            bail!(
                "Image dimensions exceed the preview limit (32768 px per side, 32 Mi pixels total)"
            );
        }
    }
    Ok(Some(bytes))
}

fn read_working_image(target: &Path) -> Result<Option<Vec<u8>>> {
    if target.exists() && !target.is_file() {
        bail!("Select a regular image file");
    }
    let file = match std::fs::File::open(target) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if !file.metadata()?.is_file() {
        bail!("Select a regular image file");
    }
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    Ok(Some(bytes))
}

fn read_git_image(
    root: &Path,
    path: &str,
    revision: ImageRevision,
    sha: Option<&str>,
) -> Result<Option<Vec<u8>>> {
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    let entry = if matches!(revision, ImageRevision::Index) {
        repo.index()?
            .get_path(Path::new(path), 0)
            .map(|entry| (entry.id, entry.mode))
    } else {
        let tree = match revision {
            ImageRevision::Head => match repo.head() {
                Ok(head) => Some(head.peel_to_tree()?),
                Err(error)
                    if matches!(
                        error.code(),
                        git2::ErrorCode::UnbornBranch | git2::ErrorCode::NotFound
                    ) =>
                {
                    None
                }
                Err(error) => return Err(error.into()),
            },
            ImageRevision::Commit | ImageRevision::Parent => {
                let commit = repo.find_commit(commit_id(sha.context("Missing commit ID")?)?)?;
                if matches!(revision, ImageRevision::Parent) {
                    if commit.parent_count() == 0 {
                        None
                    } else {
                        Some(commit.parent(0)?.tree()?)
                    }
                } else {
                    Some(commit.tree()?)
                }
            }
            _ => unreachable!(),
        };
        match tree {
            Some(tree) => match tree.get_path(Path::new(path)) {
                Ok(entry) => Some((entry.id(), entry.filemode() as u32)),
                Err(error) if error.code() == git2::ErrorCode::NotFound => None,
                Err(error) => return Err(error.into()),
            },
            None => None,
        }
    };
    let Some((oid, mode)) = entry else {
        return Ok(None);
    };
    if mode & 0o170000 != 0o100000 {
        bail!("Select a regular image file");
    }
    let blob = repo.find_blob(oid)?;
    if blob.size() > MAX_IMAGE_BYTES {
        bail!("Image exceeds the 20 MiB preview limit");
    }
    Ok(Some(blob.content().to_vec()))
}

#[cfg(test)]
mod tests;
