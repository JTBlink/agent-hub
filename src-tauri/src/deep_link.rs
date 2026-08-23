use std::{collections::HashMap, fs, path::Path};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::skills::SourceRequest;

const DEFAULT_MARKETPLACE: &str = "claude-plugins-official";
const CATALOG_PATH: &str = ".claude/plugins/plugin-catalog-cache.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkInstallRequest {
    pub plugin_name: String,
    pub marketplace: String,
    pub catalog_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkResolution {
    pub plugin_name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub category: Option<String>,
    pub homepage: Option<String>,
    pub source_request: SourceRequest,
}

#[derive(Debug, Error)]
pub enum DeepLinkError {
    #[error("deep link URL is invalid: {0}")]
    InvalidUrl(String),
    #[error("deep link action is not recognized: {0}")]
    UnknownAction(String),
    #[error("plugin parameter is required")]
    MissingPlugin,
    #[error("plugin catalog cache is unavailable: {0}")]
    CatalogUnavailable(String),
    #[error("plugin not found in catalog: {0}")]
    PluginNotFound(String),
    #[error("plugin source is a local path and cannot be installed via deep link")]
    LocalSourceNotSupported,
    #[error("plugin source format is not recognized")]
    UnrecognizedSource,
}

pub fn parse_deep_link_url(raw_url: &str) -> Result<DeepLinkInstallRequest, DeepLinkError> {
    let url =
        url::Url::parse(raw_url).map_err(|error| DeepLinkError::InvalidUrl(error.to_string()))?;
    if url.scheme() != "agenthub" {
        return Err(DeepLinkError::InvalidUrl(format!(
            "expected agenthub:// scheme, got {}://",
            url.scheme()
        )));
    }
    let action = url.host_str().unwrap_or_default();
    if action != "install" {
        return Err(DeepLinkError::UnknownAction(action.to_owned()));
    }
    let params: HashMap<String, String> = url.query_pairs().into_owned().collect();
    let plugin_name = params
        .get("plugin")
        .filter(|value| !value.is_empty())
        .ok_or(DeepLinkError::MissingPlugin)?
        .to_owned();
    let marketplace = params
        .get("marketplace")
        .filter(|value| !value.is_empty())
        .cloned()
        .unwrap_or_else(|| DEFAULT_MARKETPLACE.to_owned());
    let catalog_key = format!("{plugin_name}@{marketplace}");
    Ok(DeepLinkInstallRequest {
        plugin_name,
        marketplace,
        catalog_key,
    })
}

pub fn resolve_from_catalog(
    home: &Path,
    request: &DeepLinkInstallRequest,
) -> Result<DeepLinkResolution, DeepLinkError> {
    let catalog = read_plugin_catalog(home)?;
    let entry = catalog
        .get(&request.catalog_key)
        .ok_or_else(|| DeepLinkError::PluginNotFound(request.catalog_key.clone()))?;
    let source_request = catalog_source_to_source_request(&entry.marketplace_entry.source)?;
    Ok(DeepLinkResolution {
        plugin_name: entry
            .marketplace_entry
            .name
            .clone()
            .unwrap_or_else(|| request.plugin_name.clone()),
        description: entry.marketplace_entry.description.clone(),
        author: entry.marketplace_entry.author.clone(),
        category: entry.marketplace_entry.category.clone(),
        homepage: entry.marketplace_entry.homepage.clone(),
        source_request,
    })
}

#[derive(Debug, Deserialize)]
struct PluginCatalogCache {
    catalog: PluginCatalog,
}

#[derive(Debug, Deserialize)]
struct PluginCatalog {
    plugins: HashMap<String, PluginEntry>,
}

#[derive(Debug, Deserialize)]
struct PluginEntry {
    marketplace_entry: MarketplaceEntryData,
}

#[derive(Debug, Deserialize)]
struct MarketplaceEntryData {
    name: Option<String>,
    description: Option<String>,
    author: Option<String>,
    category: Option<String>,
    homepage: Option<String>,
    source: Value,
}

fn read_plugin_catalog(home: &Path) -> Result<HashMap<String, PluginEntry>, DeepLinkError> {
    let path = home.join(CATALOG_PATH);
    let bytes = fs::read(&path).map_err(|error| {
        DeepLinkError::CatalogUnavailable(format!("{}: {error}", path.display()))
    })?;
    let cache: PluginCatalogCache = serde_json::from_slice(&bytes).map_err(|error| {
        DeepLinkError::CatalogUnavailable(format!("failed to parse catalog: {error}"))
    })?;
    Ok(cache.catalog.plugins)
}

fn catalog_source_to_source_request(source: &Value) -> Result<SourceRequest, DeepLinkError> {
    if source.is_string() {
        return Err(DeepLinkError::LocalSourceNotSupported);
    }
    let object = source
        .as_object()
        .ok_or(DeepLinkError::UnrecognizedSource)?;
    let source_type = object
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match source_type {
        "git-subdir" => {
            let url = object
                .get("url")
                .and_then(Value::as_str)
                .ok_or(DeepLinkError::UnrecognizedSource)?
                .to_owned();
            let requested_ref = object.get("ref").and_then(Value::as_str).map(str::to_owned);
            let subdirectory = object
                .get("path")
                .and_then(Value::as_str)
                .map(str::to_owned);
            Ok(SourceRequest::Git {
                url,
                requested_ref,
                subdirectory,
            })
        }
        "url" => {
            let url = object
                .get("url")
                .and_then(Value::as_str)
                .ok_or(DeepLinkError::UnrecognizedSource)?
                .to_owned();
            Ok(SourceRequest::Git {
                url,
                requested_ref: None,
                subdirectory: None,
            })
        }
        "github" => {
            let repo = object
                .get("repo")
                .and_then(Value::as_str)
                .ok_or(DeepLinkError::UnrecognizedSource)?;
            let url = format!("https://github.com/{repo}.git");
            let requested_ref = object.get("ref").and_then(Value::as_str).map(str::to_owned);
            let subdirectory = object
                .get("path")
                .and_then(Value::as_str)
                .map(str::to_owned);
            Ok(SourceRequest::Git {
                url,
                requested_ref,
                subdirectory,
            })
        }
        _ => Err(DeepLinkError::UnrecognizedSource),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_url_with_both_params() {
        let result =
            parse_deep_link_url("agenthub://install?plugin=adobe-for-creativity&marketplace=my-mp")
                .unwrap();
        assert_eq!(result.plugin_name, "adobe-for-creativity");
        assert_eq!(result.marketplace, "my-mp");
        assert_eq!(result.catalog_key, "adobe-for-creativity@my-mp");
    }

    #[test]
    fn parse_valid_url_default_marketplace() {
        let result = parse_deep_link_url("agenthub://install?plugin=frontend-design").unwrap();
        assert_eq!(result.plugin_name, "frontend-design");
        assert_eq!(result.marketplace, DEFAULT_MARKETPLACE);
        assert_eq!(
            result.catalog_key,
            "frontend-design@claude-plugins-official"
        );
    }

    #[test]
    fn parse_rejects_missing_plugin() {
        let result = parse_deep_link_url("agenthub://install");
        assert!(matches!(result, Err(DeepLinkError::MissingPlugin)));
    }

    #[test]
    fn parse_rejects_empty_plugin() {
        let result = parse_deep_link_url("agenthub://install?plugin=");
        assert!(matches!(result, Err(DeepLinkError::MissingPlugin)));
    }

    #[test]
    fn parse_rejects_unknown_action() {
        let result = parse_deep_link_url("agenthub://browse?plugin=test");
        assert!(matches!(result, Err(DeepLinkError::UnknownAction(_))));
    }

    #[test]
    fn parse_rejects_wrong_scheme() {
        let result = parse_deep_link_url("https://install?plugin=test");
        assert!(matches!(result, Err(DeepLinkError::InvalidUrl(_))));
    }

    #[test]
    fn source_conversion_git_subdir() {
        let source = serde_json::json!({
            "source": "git-subdir",
            "url": "https://github.com/foo/bar.git",
            "path": "plugins/my-plugin",
            "ref": "v1.0.0",
            "sha": "abc123"
        });
        let result = catalog_source_to_source_request(&source).unwrap();
        assert!(matches!(
            result,
            SourceRequest::Git {
                ref url,
                ref requested_ref,
                ref subdirectory,
            } if url == "https://github.com/foo/bar.git"
                && requested_ref.as_deref() == Some("v1.0.0")
                && subdirectory.as_deref() == Some("plugins/my-plugin")
        ));
    }

    #[test]
    fn source_conversion_url() {
        let source = serde_json::json!({
            "source": "url",
            "url": "https://github.com/org/repo.git",
            "sha": "def456"
        });
        let result = catalog_source_to_source_request(&source).unwrap();
        assert!(matches!(
            result,
            SourceRequest::Git {
                ref url,
                ref requested_ref,
                ref subdirectory,
            } if url == "https://github.com/org/repo.git"
                && requested_ref.is_none()
                && subdirectory.is_none()
        ));
    }

    #[test]
    fn source_conversion_github() {
        let source = serde_json::json!({
            "source": "github",
            "repo": "anthropics/skills"
        });
        let result = catalog_source_to_source_request(&source).unwrap();
        assert!(matches!(
            result,
            SourceRequest::Git {
                ref url,
                ..
            } if url == "https://github.com/anthropics/skills.git"
        ));
    }

    #[test]
    fn source_conversion_rejects_local_string() {
        let source = serde_json::json!("./plugins/local-plugin");
        let result = catalog_source_to_source_request(&source);
        assert!(matches!(
            result,
            Err(DeepLinkError::LocalSourceNotSupported)
        ));
    }

    #[test]
    fn source_conversion_rejects_unknown_type() {
        let source = serde_json::json!({ "source": "npm", "package": "foo" });
        let result = catalog_source_to_source_request(&source);
        assert!(matches!(result, Err(DeepLinkError::UnrecognizedSource)));
    }

    #[test]
    fn read_catalog_from_fixture() {
        let temp = tempfile::tempdir().unwrap();
        let claude_dir = temp.path().join(".claude/plugins");
        fs::create_dir_all(&claude_dir).unwrap();
        let catalog_json = serde_json::json!({
            "version": 1,
            "fetchedAt": "2026-01-01T00:00:00Z",
            "catalog": {
                "generated_at": "2026-01-01T00:00:00Z",
                "plugins": {
                    "test-plugin@test-mp": {
                        "plugin": "test-plugin",
                        "version": "1.0.0",
                        "marketplace_entry": {
                            "name": "test-plugin",
                            "description": "A test plugin",
                            "author": "Tester",
                            "category": "dev",
                            "homepage": "https://example.com",
                            "source": {
                                "source": "url",
                                "url": "https://github.com/test/plugin.git",
                                "sha": "abc123"
                            }
                        }
                    }
                }
            }
        });
        fs::write(
            claude_dir.join("plugin-catalog-cache.json"),
            serde_json::to_vec(&catalog_json).unwrap(),
        )
        .unwrap();
        let request = DeepLinkInstallRequest {
            plugin_name: "test-plugin".into(),
            marketplace: "test-mp".into(),
            catalog_key: "test-plugin@test-mp".into(),
        };
        let resolution = resolve_from_catalog(temp.path(), &request).unwrap();
        assert_eq!(resolution.plugin_name, "test-plugin");
        assert_eq!(resolution.description.as_deref(), Some("A test plugin"));
        assert!(matches!(
            resolution.source_request,
            SourceRequest::Git { ref url, .. } if url == "https://github.com/test/plugin.git"
        ));
    }

    #[test]
    fn read_catalog_missing_file() {
        let temp = tempfile::tempdir().unwrap();
        let request = DeepLinkInstallRequest {
            plugin_name: "foo".into(),
            marketplace: "bar".into(),
            catalog_key: "foo@bar".into(),
        };
        let result = resolve_from_catalog(temp.path(), &request);
        assert!(matches!(result, Err(DeepLinkError::CatalogUnavailable(_))));
    }

    #[test]
    fn read_catalog_plugin_not_found() {
        let temp = tempfile::tempdir().unwrap();
        let claude_dir = temp.path().join(".claude/plugins");
        fs::create_dir_all(&claude_dir).unwrap();
        let catalog_json = serde_json::json!({
            "version": 1,
            "fetchedAt": "2026-01-01T00:00:00Z",
            "catalog": { "plugins": {} }
        });
        fs::write(
            claude_dir.join("plugin-catalog-cache.json"),
            serde_json::to_vec(&catalog_json).unwrap(),
        )
        .unwrap();
        let request = DeepLinkInstallRequest {
            plugin_name: "nonexistent".into(),
            marketplace: "mp".into(),
            catalog_key: "nonexistent@mp".into(),
        };
        let result = resolve_from_catalog(temp.path(), &request);
        assert!(matches!(result, Err(DeepLinkError::PluginNotFound(_))));
    }
}
