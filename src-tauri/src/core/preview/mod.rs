mod assets;
pub mod automation;
pub mod browser;
mod capture;
mod cdp;
pub mod cookies;
pub mod documents;
mod download_transfer;
pub mod downloads;
pub mod export;
mod frames;
mod inventory;
mod lifecycle;
pub mod packets;
mod page_actions;
mod profiles;
mod recovery;
mod remote_downloads;
#[cfg(test)]
mod remote_proxy_tests;
pub mod runtime;
pub mod uploads;
use super::error::AppError;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
#[derive(Serialize)]
pub struct OpenedDocument {
    #[serde(flatten)]
    pub document: documents::Document,
    pub url: String,
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LinkedResource {
    Document { document: OpenedDocument },
    Page { url: String },
}
pub struct Preview {
    pub browsers: Arc<browser::Browsers>,
    automation: Mutex<Option<automation::Automation>>,
    pub documents: Arc<documents::Documents>,
    pub packets: packets::Packets,
    pub cookie_imports: Arc<cookies::Imports>,
    assets: Mutex<Option<assets::Assets>>,
    closed: AtomicBool,
}
impl Default for Preview {
    fn default() -> Self {
        Self {
            browsers: browser::Browsers::shared(
                super::central_repo::home_base_dir().join("preview"),
            ),
            automation: Mutex::new(None),
            documents: Arc::new(documents::Documents::default()),
            packets: packets::Packets::new(
                super::central_repo::home_base_dir().join("preview/deliveries"),
            ),
            cookie_imports: cookies::Imports::shared(),
            assets: Mutex::new(None),
            closed: AtomicBool::new(false),
        }
    }
}
impl Preview {
    pub fn start_automation(&self) -> Result<(), AppError> {
        let mut automation = self
            .automation
            .lock()
            .map_err(|_| AppError::internal("Preview control unavailable"))?;
        if self.closed.load(Ordering::Acquire) {
            return Err(AppError::cancelled("Preview is shutting down"));
        }
        if automation.is_none() {
            *automation = Some(automation::Automation::start(self.browsers.clone())?);
        }
        Ok(())
    }
    pub fn open_document(&self, path: &std::path::Path) -> Result<OpenedDocument, AppError> {
        self.publish_document(self.documents.open(path)?)
    }
    pub fn open_at(
        &self,
        root: &std::path::Path,
        relative: &str,
    ) -> Result<OpenedDocument, AppError> {
        self.publish_document(self.documents.open_at(root, relative)?)
    }
    pub fn open_link(&self, id: &str, href: &str) -> Result<LinkedResource, AppError> {
        let link = self.documents.resolve_link(id, href)?;
        let relative = &link.relative;
        if matches!(
            std::path::Path::new(&relative)
                .extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_lowercase)
                .as_deref(),
            Some("md" | "markdown" | "html" | "htm")
        ) {
            return Ok(LinkedResource::Document {
                document: {
                    let mut document =
                        self.publish_document(self.documents.open_link(id, href)?)?;
                    document.url.push_str(&link.suffix);
                    document
                },
            });
        }
        Ok(LinkedResource::Page {
            url: self.resource_link(id, href)?,
        })
    }
    pub fn resource_link(&self, id: &str, href: &str) -> Result<String, AppError> {
        let link = self.documents.resolve_link(id, href)?;
        let assets = self
            .assets
            .lock()
            .map_err(|_| AppError::internal("Document resources unavailable"))?;
        let url = assets
            .as_ref()
            .ok_or_else(|| AppError::not_found("Document resources unavailable"))?
            .browser_document_url(id, &link.relative);
        Ok(format!("{url}{}", link.suffix))
    }
    fn publish_document(&self, document: documents::Document) -> Result<OpenedDocument, AppError> {
        let mut assets = self
            .assets
            .lock()
            .map_err(|_| AppError::internal("Document resource state unavailable"))?;
        if assets.is_none() {
            *assets = Some(assets::Assets::start(self.documents.clone())?);
        }
        let url = assets
            .as_ref()
            .ok_or_else(|| AppError::internal("Document resource server unavailable"))?
            .document_url(&document.id, &document.relative_path);
        let url = if document.kind == "html" {
            assets
                .as_ref()
                .ok_or_else(|| AppError::internal("Document resource server unavailable"))?
                .browser_document_url(&document.id, &document.relative_path)
        } else {
            url
        };
        Ok(OpenedDocument { document, url })
    }
    pub fn capture_rendered(
        &self,
        html: &str,
        width: u32,
        height: u32,
        profile: &str,
        full: bool,
        clip: Option<serde_json::Value>,
    ) -> Result<String, AppError> {
        if html.len() > 4 * 1024 * 1024 {
            return Err(AppError::invalid_input(
                "Rendered document exceeds the screenshot limit",
            ));
        }
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("rendered.html");
        std::fs::write(&path, html)?;
        let grant = self.documents.authorize_rendered(&path)?;
        let result = (|| {
            let mut assets = self
                .assets
                .lock()
                .map_err(|_| AppError::internal("Document resource state unavailable"))?;
            if assets.is_none() {
                *assets = Some(assets::Assets::start(self.documents.clone())?);
            }
            let url = assets
                .as_ref()
                .ok_or_else(|| AppError::internal("Document resource server unavailable"))?
                .browser_document_url(&grant, "rendered.html");
            drop(assets);
            let id = self.browsers.create_internal(profile, &url)?;
            let result = (|| {
                self.browsers.action(
                    &id,
                    browser::Action::Resize {
                        width,
                        height,
                        mobile: false,
                    },
                )?;
                self.browsers.action(&id,browser::Action::Evaluate{expression:"new Promise(resolve=>{if(document.readyState==='complete')resolve(true);else addEventListener('load',()=>resolve(true),{once:true})}).then(()=>document.fonts.ready).then(()=>true)".into()})?;
                let value = self.browsers.action(
                    &id,
                    browser::Action::Screenshot {
                        full,
                        clip,
                        expected_revision: None,
                    },
                )?;
                value["data"]
                    .as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| AppError::network("Rendered screenshot unavailable"))
            })();
            let _ = self.browsers.close(&id);
            result
        })();
        self.documents.close(&grant);
        result
    }
    pub fn clear(&self) {
        self.closed.store(true, Ordering::Release);
        if let Ok(mut automation) = self.automation.lock() {
            automation.take();
        }
        self.browsers.clear();
        self.packets.clear();
        self.cookie_imports.clear();
        if let Ok(mut assets) = self.assets.lock() {
            assets.take();
        }
    }
}

#[cfg(test)]
mod tests;
