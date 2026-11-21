use super::{adapter::string, Binding, CliReader, Provider, TaskClient, TaskFailure};
use serde::Serialize;
use serde_json::Value;
use std::{collections::HashMap, sync::atomic::AtomicBool};

const PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 20;

#[derive(Debug, Serialize)]
pub struct RunnerSummary {
    pub id: u64,
    pub short_id: Option<String>,
    pub name: String,
    pub state: String,
    pub paused: Option<bool>,
    pub busy: Option<bool>,
    pub job_status: Option<String>,
    pub os: Option<String>,
    pub scope: Option<&'static str>,
    pub labels: Option<Vec<String>>,
    pub contacted_at: Option<String>,
    pub created_by: Option<String>,
    pub created_at: Option<String>,
    pub version: Option<String>,
    pub manager_address: Option<String>,
    pub owner_project: Option<String>,
    pub project_count: Option<u64>,
    pub job_count: Option<u64>,
    pub locked: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct RunnerInventory {
    pub items: Vec<RunnerSummary>,
    pub identity: String,
    pub limited: bool,
}

fn optional_string(item: &Value, field: &str) -> Option<String> {
    item[field]
        .as_str()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[derive(Default)]
struct GitLabRunnerFields {
    short_id: Option<String>,
    os: Option<String>,
    labels: Option<Vec<String>>,
    contacted_at: Option<String>,
    created_by: Option<String>,
    created_at: Option<String>,
    version: Option<String>,
    manager_address: Option<String>,
    owner_project: Option<String>,
    project_count: Option<u64>,
    locked: Option<bool>,
}

fn runner_os(value: String) -> String {
    match value.to_ascii_lowercase().as_str() {
        "linux" => "Linux".into(),
        "darwin" | "macos" | "osx" => "macOS".into(),
        "windows" => "Windows".into(),
        _ => value,
    }
}

fn summary(provider: Provider, item: &Value) -> Result<RunnerSummary, TaskFailure> {
    let id = item["id"]
        .as_u64()
        .filter(|number| *number > 0)
        .ok_or_else(|| TaskFailure::new("invalid_response", "Runner has no identifier"))?;
    let gitlab = provider == Provider::Gitlab;
    let labels = item[if gitlab { "tag_list" } else { "labels" }]
        .as_array()
        .map(|values| {
            values
                .iter()
                .filter_map(|value| {
                    if gitlab {
                        value.as_str().map(str::to_owned)
                    } else {
                        optional_string(value, "name")
                    }
                })
                .collect()
        });
    let reported_status = item["status"]
        .as_str()
        .filter(|status| !status.trim().is_empty());
    let state = match reported_status {
        Some("active" | "paused") | None if gitlab => item["online"]
            .as_bool()
            .map(|online| if online { "online" } else { "offline" })
            .or(reported_status),
        _ => reported_status,
    }
    .unwrap_or("unknown")
    .to_owned();
    Ok(RunnerSummary {
        id,
        short_id: None,
        name: optional_string(item, if gitlab { "description" } else { "name" })
            .or_else(|| optional_string(item, "name"))
            .unwrap_or_else(|| format!("#{id}")),
        state,
        paused: if gitlab {
            item["paused"]
                .as_bool()
                .or_else(|| item["active"].as_bool().map(|active| !active))
        } else {
            None
        },
        busy: if gitlab {
            match item["job_execution_status"].as_str() {
                Some("active" | "running") => Some(true),
                Some("idle") => Some(false),
                _ => None,
            }
        } else {
            item["busy"].as_bool()
        },
        job_status: optional_string(item, "job_execution_status"),
        os: optional_string(item, if gitlab { "platform" } else { "os" }).map(runner_os),
        scope: if gitlab {
            match string(item, "runner_type").as_str() {
                "project_type" => Some("project"),
                "group_type" => Some("group"),
                "instance_type" => Some("instance"),
                _ => None,
            }
        } else {
            None
        },
        labels,
        contacted_at: optional_string(item, "contacted_at"),
        created_by: None,
        created_at: optional_string(item, "created_at"),
        version: optional_string(item, "version"),
        manager_address: None,
        owner_project: None,
        project_count: None,
        job_count: None,
        locked: item["locked"].as_bool(),
    })
}

impl<R: CliReader> TaskClient<R> {
    /// Read runners visible to the bound repository through the same CLI account as tasks.
    pub fn runners(
        &self,
        binding: &Binding,
        cancel: &AtomicBool,
    ) -> Result<RunnerInventory, TaskFailure> {
        binding.validate()?;
        let mut items = Vec::new();
        let mut limited = true;
        for page in 1..=MAX_PAGES {
            let (values, more) = self.runner_page(binding, page, cancel)?;
            for item in &values {
                items.push(summary(binding.provider, item)?);
            }
            if !more {
                limited = false;
                break;
            }
        }
        if binding.provider == Provider::Gitlab && !items.is_empty() {
            let mut fields = self.gitlab_runner_fields(binding, cancel);
            for runner in &mut items {
                if let Some(fields) = fields.remove(&runner.id) {
                    runner.short_id = fields.short_id;
                    runner.os = runner.os.take().or(fields.os);
                    runner.labels = runner.labels.take().or(fields.labels);
                    runner.contacted_at = runner.contacted_at.take().or(fields.contacted_at);
                    runner.created_by = fields.created_by;
                    runner.created_at = runner.created_at.take().or(fields.created_at);
                    runner.version = fields.version.or(runner.version.take());
                    runner.manager_address = fields.manager_address;
                    runner.owner_project = fields.owner_project;
                    runner.project_count = fields.project_count;
                    runner.locked = fields.locked.or(runner.locked);
                }
            }
        }
        Ok(RunnerInventory {
            items,
            identity: String::new(),
            limited,
        })
    }

    // GitLab exposes its UI's short identifier in GraphQL. The REST inventory
    // remains usable when a self-managed server does not expose that field.
    fn gitlab_runner_fields(
        &self,
        binding: &Binding,
        cancel: &AtomicBool,
    ) -> HashMap<u64, GitLabRunnerFields> {
        let mut fields = HashMap::new();
        let mut after = Value::Null;
        let repository = Value::String(binding.repository.clone());
        for _ in 0..MAX_PAGES {
            let query = format!(
                "{{ project(fullPath: {repository}) {{ runners(first: {PAGE_SIZE}, after: {after}) {{ nodes {{ id shortSha tagList contactedAt createdAt createdBy {{ name }} locked ownerProject {{ fullPath }} projectCount managers(first: 2) {{ nodes {{ platformName version ipAddress }} }} }} pageInfo {{ hasNextPage endCursor }} }} }} }}"
            );
            let Ok(response) = self.request(
                binding,
                "POST",
                "graphql".into(),
                &[("query", query)],
                cancel,
            ) else {
                break;
            };
            let connection = &response["data"]["project"]["runners"];
            let Some(nodes) = connection["nodes"].as_array() else {
                break;
            };
            for node in nodes {
                let id = node["id"].as_str().and_then(|id| {
                    id.strip_prefix("gid://gitlab/Ci::Runner/")?
                        .parse::<u64>()
                        .ok()
                });
                let short_id = node["shortSha"].as_str().filter(|short_id| {
                    short_id.len() == 8
                        && short_id
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte))
                });
                let manager = match node["managers"]["nodes"].as_array().map(Vec::as_slice) {
                    Some([manager]) => manager,
                    _ => &Value::Null,
                };
                if let Some(id) = id {
                    fields.insert(
                        id,
                        GitLabRunnerFields {
                            short_id: short_id.map(str::to_owned),
                            os: optional_string(manager, "platformName").map(runner_os),
                            labels: node["tagList"].as_array().map(|labels| {
                                labels
                                    .iter()
                                    .filter_map(|label| label.as_str().map(str::to_owned))
                                    .collect()
                            }),
                            contacted_at: optional_string(node, "contactedAt"),
                            created_by: optional_string(&node["createdBy"], "name"),
                            created_at: optional_string(node, "createdAt"),
                            version: optional_string(manager, "version"),
                            manager_address: optional_string(manager, "ipAddress"),
                            owner_project: optional_string(&node["ownerProject"], "fullPath"),
                            project_count: node["projectCount"].as_u64(),
                            locked: node["locked"].as_bool(),
                        },
                    );
                }
            }
            let next = &connection["pageInfo"]["endCursor"];
            if connection["pageInfo"]["hasNextPage"].as_bool() != Some(true)
                || !next.is_string()
                || next == &after
            {
                break;
            }
            after = next.clone();
        }
        fields
    }

    fn runner_page(
        &self,
        binding: &Binding,
        page: usize,
        cancel: &AtomicBool,
    ) -> Result<(Vec<Value>, bool), TaskFailure> {
        let endpoint = match binding.provider {
            Provider::Github => format!("repos/{}/actions/runners", binding.repository),
            Provider::Gitlab => format!(
                "projects/{}/runners",
                urlencoding::encode(&binding.repository)
            ),
        };
        let mut response = self.api(
            binding,
            format!("{endpoint}?per_page={PAGE_SIZE}&page={page}"),
            cancel,
        )?;
        let more = match binding.provider {
            Provider::Github => response["total_count"]
                .as_u64()
                .is_some_and(|total| total > (page * PAGE_SIZE) as u64),
            Provider::Gitlab => response
                .as_array()
                .is_some_and(|values| values.len() == PAGE_SIZE),
        };

        let values = match binding.provider {
            Provider::Github => response["runners"].as_array_mut(),
            Provider::Gitlab => response.as_array_mut(),
        }
        .ok_or_else(|| TaskFailure::new("invalid_response", "Invalid runner list response"))?;
        let more = more && !values.is_empty();
        Ok((std::mem::take(values), more))
    }

    /// Read GitLab's optional fields for a runner visible through the repository binding.
    pub fn runner_details(
        &self,
        binding: &Binding,
        id: u64,
        cancel: &AtomicBool,
    ) -> Result<RunnerSummary, TaskFailure> {
        if binding.provider != Provider::Gitlab || id == 0 {
            return Err(TaskFailure::new("invalid_input", "Invalid GitLab runner"));
        }
        binding.validate()?;
        for page in 1..=MAX_PAGES {
            let (values, more) = self.runner_page(binding, page, cancel)?;
            if values.iter().any(|value| value["id"].as_u64() == Some(id)) {
                let item = self.api(binding, format!("runners/{id}"), cancel)?;
                let mut details = summary(binding.provider, &item)?;
                if details.id != id {
                    return Err(TaskFailure::new(
                        "invalid_response",
                        "Runner identity mismatch",
                    ));
                }
                let query = format!(
                    r#"{{ runner(id: "gid://gitlab/Ci::Runner/{id}") {{ jobs(first: 1) {{ count }} }} }}"#
                );
                details.job_count = self
                    .request(
                        binding,
                        "POST",
                        "graphql".into(),
                        &[("query", query)],
                        cancel,
                    )
                    .ok()
                    .and_then(|response| response["data"]["runner"]["jobs"]["count"].as_u64());
                return Ok(details);
            }
            if !more {
                break;
            }
        }
        Err(TaskFailure::new(
            "permission",
            "Runner is not visible to the repository",
        ))
    }
}
