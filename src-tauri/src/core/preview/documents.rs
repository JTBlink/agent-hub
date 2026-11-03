//! Authorized document handles share the existing file reader and atomic save boundary.
use super::super::{error::AppError, project_file_edit, project_worktrees};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
};
#[derive(Clone, Serialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub relative_path: String,
    pub kind: String,
    pub content: String,
    pub revision: String,
}
pub struct DocumentLink {
    pub relative: String,
    pub suffix: String,
}
#[derive(Clone)]
struct Grant {
    root: PathBuf,
    relative: String,
}
#[derive(Default)]
pub struct Documents {
    grants: Mutex<HashMap<String, Grant>>,
}
pub(super) fn resource_path(relative: &str) -> String {
    relative
        .split('/')
        .map(|part| urlencoding::encode(part).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}
fn revision(text: &str) -> String {
    hex::encode(Sha256::digest(text.as_bytes()))
}
fn resource_revision(path: &Path) -> Result<String, AppError> {
    let mut file = std::fs::File::open(path)?.take(super::resource_bridge::LIMIT + 1);
    let mut hasher = Sha256::new();
    let mut count = 0u64;
    let mut buffer = [0u8; 8192];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        count += read as u64;
        if count > super::resource_bridge::LIMIT {
            return Err(AppError::invalid_input(
                "Preview resource exceeds the 16 MiB limit",
            ));
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}
fn kind(path: &Path) -> Result<&'static str, AppError> {
    super::file_types::kind(path)
        .ok_or_else(|| AppError::invalid_input("Unsupported browser preview file type"))
}
impl Documents {
    /// Call only after a native file selection or an authorized project request.
    pub fn open(&self, path: &Path) -> Result<Document, AppError> {
        let path = path.canonicalize()?;
        let root = path
            .parent()
            .ok_or_else(|| AppError::invalid_input("Document has no parent"))?;
        let relative = path
            .file_name()
            .ok_or_else(|| AppError::invalid_input("Invalid document"))?
            .to_string_lossy();
        self.open_at(root, &relative)
    }
    pub fn open_at(&self, root: &Path, relative: &str) -> Result<Document, AppError> {
        let root = root.canonicalize()?;
        let path = project_worktrees::file_path(&root, relative).map_err(AppError::io)?;
        let kind = kind(&path)?;
        // Resource documents are read-only handles: bytes stay in the capability bridge,
        // never pass through the text editor or UTF-8 conversion.
        let content = if kind == "resource" {
            if !path.is_file() || std::fs::metadata(&path)?.len() > super::resource_bridge::LIMIT {
                return Err(AppError::invalid_input(
                    "Preview resource exceeds the 16 MiB limit",
                ));
            }
            String::new()
        } else {
            project_worktrees::read_file(&root, relative).map_err(AppError::io)?
        };
        let id = uuid::Uuid::new_v4().to_string();
        let relative = relative.replace('\\', "/");
        let document = Document {
            id: id.clone(),
            title: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            relative_path: relative.clone(),
            kind: kind.into(),
            revision: if kind == "resource" {
                resource_revision(&path)?
            } else {
                revision(&content)
            },
            content,
        };
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| AppError::internal("Document state unavailable"))?;
        if grants.len() >= 100 {
            return Err(AppError::invalid_input("Close unused documents first"));
        }
        grants.insert(id.clone(), Grant { root, relative });
        drop(grants);
        if kind == "resource" {
            if let Err(error) = self.resource(&id, &document.relative_path) {
                self.close(&id);
                return Err(error);
            }
        }
        Ok(document)
    }
    pub fn open_link(&self, id: &str, href: &str) -> Result<Document, AppError> {
        let grant = self.grant(id)?;
        let relative = self.link_relative(id, href)?;
        self.open_at(&grant.root, &relative)
    }
    pub fn link_relative(&self, id: &str, href: &str) -> Result<String, AppError> {
        Ok(self.resolve_link(id, href)?.relative)
    }
    pub fn resolve_link(&self, id: &str, href: &str) -> Result<DocumentLink, AppError> {
        if href.len() > 8192 {
            return Err(AppError::invalid_input(
                "Document link exceeds the supported limit",
            ));
        }
        let grant = self.grant(id)?;
        let mut base = reqwest::Url::parse("http://resources.invalid/").map_err(AppError::io)?;
        base.set_path(&format!("/{}", resource_path(&grant.relative)));
        let target = base
            .join(href)
            .map_err(|error| AppError::invalid_input(error.to_string()))?;
        if target.host_str() != Some("resources.invalid") || target.scheme() != "http" {
            return Err(AppError::invalid_input("Not a local document link"));
        }
        let relative =
            urlencoding::decode(target.path().trim_start_matches('/')).map_err(AppError::io)?;
        let _ = self.resource(id, &relative)?;
        let suffix = format!(
            "{}{}",
            target
                .query()
                .map(|query| format!("?{query}"))
                .unwrap_or_default(),
            target
                .fragment()
                .map(|fragment| format!("#{fragment}"))
                .unwrap_or_default()
        );
        Ok(DocumentLink {
            relative: relative.into_owned(),
            suffix,
        })
    }
    pub(super) fn authorize_rendered(&self, path: &Path) -> Result<String, AppError> {
        let root = path
            .parent()
            .ok_or_else(|| AppError::invalid_input("Invalid rendered document"))?
            .canonicalize()?;
        let relative = path
            .file_name()
            .ok_or_else(|| AppError::invalid_input("Invalid rendered document"))?
            .to_string_lossy()
            .into_owned();
        let id = uuid::Uuid::new_v4().to_string();
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| AppError::internal("Document state unavailable"))?;
        if grants.len() >= 100 {
            return Err(AppError::invalid_input("Close unused documents first"));
        }
        grants.insert(id.clone(), Grant { root, relative });
        Ok(id)
    }
    pub fn read(&self, id: &str) -> Result<Document, AppError> {
        let grant = self.grant(id)?;
        let content = if kind(Path::new(&grant.relative))? == "resource" {
            let _ = self.resource(id, &grant.relative)?;
            String::new()
        } else {
            project_worktrees::read_file(&grant.root, &grant.relative).map_err(AppError::io)?
        };
        Ok(Document {
            id: id.into(),
            title: Path::new(&grant.relative)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            kind: kind(Path::new(&grant.relative))?.into(),
            relative_path: grant.relative.clone(),
            revision: if kind(Path::new(&grant.relative))? == "resource" {
                resource_revision(&self.resource(id, &grant.relative)?)?
            } else {
                revision(&content)
            },
            content,
        })
    }
    pub fn save(
        &self,
        id: &str,
        content: &str,
        expected_revision: &str,
    ) -> Result<Document, AppError> {
        let grant = self.grant(id)?;
        if kind(Path::new(&grant.relative))? == "resource" {
            return Err(AppError::invalid_input("Browser resources are read-only"));
        }
        let current =
            project_worktrees::read_file(&grant.root, &grant.relative).map_err(AppError::io)?;
        if revision(&current) != expected_revision {
            return Err(AppError::invalid_input("PREVIEW_DOCUMENT_CONFLICT"));
        }
        project_file_edit::save(&grant.root, &grant.relative, &current, content)
            .map_err(AppError::io)?;
        self.read(id)
    }
    pub fn resource(&self, id: &str, relative: &str) -> Result<PathBuf, AppError> {
        let grant = self.grant(id)?;
        super::super::path_guard::ensure_safe_skill_relative_path(relative)?;
        if relative
            .split(['/', '\\'])
            .any(|part| part.starts_with('.') || part.contains(':'))
        {
            return Err(AppError::invalid_input("Hidden resource is not accessible"));
        }
        let path = grant.root.join(relative).canonicalize()?;
        if !path.starts_with(&grant.root)
            || path.strip_prefix(&grant.root).is_ok_and(|relative| {
                relative
                    .components()
                    .any(|component| component.as_os_str().to_string_lossy().starts_with('.'))
            })
            || !path.is_file()
            || std::fs::metadata(&path)?.len() > super::resource_bridge::LIMIT
        {
            return Err(AppError::invalid_input(
                "Resource is outside the authorized directory or too large",
            ));
        }
        Ok(path)
    }
    pub fn close(&self, id: &str) {
        if let Ok(mut grants) = self.grants.lock() {
            grants.remove(id);
        }
    }
    fn grant(&self, id: &str) -> Result<Grant, AppError> {
        self.grants
            .lock()
            .map_err(|_| AppError::internal("Document state unavailable"))?
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::not_found("Document authorization expired; reopen the file"))
    }
}
#[cfg(test)]
#[path = "documents/tests.rs"]
mod tests;
