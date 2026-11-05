//! Optional development information. Failure never discards a readable task.
#[cfg(any(feature = "github", feature = "gitlab"))]
use super::{metadata, TaskLink, TaskReview};
use super::{Provider, TaskDevelopment, TaskFailure, TaskKind};
use serde_json::Value;

#[cfg(any(feature = "github", feature = "gitlab"))]
pub(crate) fn optional(
    info: &mut TaskDevelopment,
    section: &str,
    endpoint: String,
    read: &mut impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<Option<Value>, TaskFailure> {
    match read(endpoint) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind == "cancelled" => Err(error),
        Err(_) => {
            if !info.warnings.iter().any(|item| item == section) {
                info.warnings.push(section.into());
            }
            Ok(None)
        }
    }
}

#[cfg(any(feature = "github", feature = "gitlab"))]
pub(crate) fn array(info: &mut TaskDevelopment, section: &str, value: Option<Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(items)) => {
            if items.len() >= 100 && !info.truncated.iter().any(|item| item == section) {
                info.truncated.push(section.into());
            }
            items
        }
        Some(_) => {
            info.warnings.push(section.into());
            Vec::new()
        }
        None => Vec::new(),
    }
}

#[cfg(any(feature = "github", feature = "gitlab"))]
pub(crate) fn link(item: &Value, kind: &str) -> Option<TaskLink> {
    let url = metadata::text(&item["html_url"]).or_else(|| metadata::text(&item["web_url"]))?;
    Some(TaskLink {
        title: super::adapter::string(item, "title"),
        url,
        kind: kind.into(),
        number: item["number"].as_u64().or_else(|| item["iid"].as_u64()),
    })
}

#[cfg(any(feature = "github", feature = "gitlab"))]
pub(crate) fn review(item: &Value) -> TaskReview {
    TaskReview {
        author: metadata::actor(&item["user"])
            .or_else(|| metadata::actor(&item["author"]))
            .unwrap_or_default(),
        state: metadata::text(&item["state"]).unwrap_or_else(|| "COMMENTED".into()),
        body: super::adapter::string(item, "body"),
        url: super::adapter::string(item, "html_url"),
        submitted_at: metadata::text(&item["submitted_at"])
            .or_else(|| metadata::text(&item["created_at"])),
        path: metadata::text(&item["path"])
            .or_else(|| metadata::text(&item["position"]["new_path"]))
            .or_else(|| metadata::text(&item["position"]["old_path"])),
        line: item["line"]
            .as_u64()
            .or_else(|| item["position"]["new_line"].as_u64())
            .or_else(|| item["position"]["old_line"].as_u64()),
        resolved: item["resolved"].as_bool(),
    }
}

#[cfg(any(feature = "github", feature = "gitlab"))]
pub(super) fn load(
    provider: Provider,
    kind: TaskKind,
    endpoint: &str,
    item: &Value,
    mut read: impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<TaskDevelopment, TaskFailure> {
    let mut info = TaskDevelopment::default();
    provider.require()?;
    match provider {
        #[cfg(feature = "github")]
        Provider::Github => crate::core::platforms::github::tasks::development(
            &mut info, kind, endpoint, item, &mut read,
        )?,
        #[cfg(feature = "gitlab")]
        Provider::Gitlab => crate::core::platforms::gitlab::tasks::development(
            &mut info, kind, endpoint, item, &mut read,
        )?,
        #[cfg(not(feature = "github"))]
        Provider::Github => provider.require()?,
        #[cfg(not(feature = "gitlab"))]
        Provider::Gitlab => provider.require()?,
    }

    let mut urls = std::collections::HashSet::new();
    if kind == TaskKind::Review {
        changes(&mut info, provider, endpoint, &mut read)?;
    }
    info.related.retain(|link| urls.insert(link.url.clone()));
    Ok(info)
}

#[cfg(any(feature = "github", feature = "gitlab"))]
fn changes(
    info: &mut TaskDevelopment,
    provider: Provider,
    endpoint: &str,
    read: &mut impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<(), TaskFailure> {
    let resource = if provider == Provider::Github {
        "files"
    } else {
        "diffs"
    };
    let data = optional(
        info,
        "files",
        format!("{endpoint}/{resource}?per_page=100&page=1"),
        read,
    )?;
    for item in array(info, "files", data) {
        let path = metadata::text(&item["filename"])
            .or_else(|| metadata::text(&item["new_path"]))
            .or_else(|| metadata::text(&item["old_path"]));
        let Some(path) = path else {
            continue;
        };
        let patch = metadata::text(&item["patch"]).or_else(|| metadata::text(&item["diff"]));
        let patch = patch.map(|patch| {
            if patch.len() > 200_000 {
                info.truncated.push("files".into());
                patch.chars().take(50_000).collect()
            } else {
                patch
            }
        });
        info.files.push(super::TaskChangedFile {
            path,
            status: metadata::text(&item["status"]).unwrap_or_else(|| {
                if item["new_file"] == true {
                    "added"
                } else if item["deleted_file"] == true {
                    "deleted"
                } else if item["renamed_file"] == true {
                    "renamed"
                } else {
                    "modified"
                }
                .into()
            }),
            additions: item["additions"].as_u64(),
            deletions: item["deletions"].as_u64(),
            patch,
        });
    }
    let data = optional(
        info,
        "commits",
        format!("{endpoint}/commits?per_page=100&page=1"),
        read,
    )?;
    for item in array(info, "commits", data) {
        let Some(sha) = metadata::text(&item["sha"]).or_else(|| metadata::text(&item["id"])) else {
            continue;
        };
        info.commits.push(super::TaskCommit {
            sha,
            message: metadata::text(&item["commit"]["message"])
                .or_else(|| metadata::text(&item["title"]))
                .or_else(|| metadata::text(&item["message"]))
                .unwrap_or_default(),
            author: metadata::actor(&item["author"])
                .or_else(|| metadata::text(&item["author_name"]))
                .or_else(|| metadata::text(&item["commit"]["author"]["name"]))
                .unwrap_or_default(),
            created_at: metadata::text(&item["created_at"])
                .or_else(|| metadata::text(&item["commit"]["author"]["date"])),
            url: metadata::text(&item["html_url"])
                .or_else(|| metadata::text(&item["web_url"]))
                .unwrap_or_default(),
        });
    }
    Ok(())
}

#[cfg(not(any(feature = "github", feature = "gitlab")))]
pub(super) fn load(
    provider: Provider,
    _kind: TaskKind,
    _endpoint: &str,
    _item: &Value,
    _read: impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<TaskDevelopment, TaskFailure> {
    provider.require()?;
    Ok(TaskDevelopment::default())
}
