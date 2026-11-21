use super::{
    runners::{optional_string, runner_os, summary, RunnerSummary},
    Binding, CliReader, Provider, TaskClient, TaskFailure,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::{collections::HashSet, sync::atomic::AtomicBool};

#[derive(Serialize)]
pub struct CreatedProjectRunner {
    pub id: u64,
    pub token: String,
}

impl<R: CliReader> TaskClient<R> {
    pub(super) fn assignable_runners(
        &self,
        binding: &Binding,
        cancel: &AtomicBool,
    ) -> Result<Vec<RunnerSummary>, TaskFailure> {
        let repository = json!(binding.repository);
        let mut after = Value::Null;
        let mut ids = HashSet::new();
        let mut runners = Vec::new();
        for _ in 0..20 {
            let query = format!(
                "{{ currentUser {{ runners(type: PROJECT_TYPE, assignableToProjectPath: {repository}, first: 100, after: {after}) {{ nodes {{ id description shortSha status paused jobExecutionStatus tagList contactedAt createdAt createdBy {{ name }} ownerProject {{ fullPath }} managers(first: 2) {{ nodes {{ platformName }} }} }} pageInfo {{ hasNextPage endCursor }} }} }} }}"
            );
            let response = self.request(
                binding,
                "POST",
                "graphql".into(),
                &[("query", query)],
                cancel,
            )?;
            let connection = &response["data"]["currentUser"]["runners"];
            let nodes = connection["nodes"].as_array().ok_or_else(|| {
                TaskFailure::new("invalid_response", "Assignable runners are unavailable")
            })?;
            for node in nodes {
                let Some(id) = node["id"].as_str().and_then(|value| {
                    value
                        .strip_prefix("gid://gitlab/Ci::Runner/")?
                        .parse::<u64>()
                        .ok()
                }) else {
                    continue;
                };
                if !ids.insert(id) {
                    continue;
                }
                let mut runner = summary(
                    Provider::Gitlab,
                    &json!({
                        "id": id,
                        "description": node["description"],
                        "status": node["status"].as_str().map(str::to_ascii_lowercase),
                        "paused": node["paused"],
                        "job_execution_status": node["jobExecutionStatus"].as_str().map(str::to_ascii_lowercase),
                        "runner_type": "project_type",
                        "tag_list": node["tagList"],
                        "contacted_at": node["contactedAt"],
                        "created_at": node["createdAt"],
                    }),
                )?;
                runner.short_id = optional_string(node, "shortSha").filter(|value| {
                    value.len() == 8
                        && value
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte))
                });
                runner.created_by = optional_string(&node["createdBy"], "name");
                runner.owner_project = optional_string(&node["ownerProject"], "fullPath");
                if let Some([manager]) = node["managers"]["nodes"].as_array().map(Vec::as_slice) {
                    runner.os = optional_string(manager, "platformName").map(runner_os);
                }
                runners.push(runner);
            }
            let next = &connection["pageInfo"]["endCursor"];
            if connection["pageInfo"]["hasNextPage"].as_bool() != Some(true)
                || !next.is_string()
                || next == &after
            {
                return Ok(runners);
            }
            after = next.clone();
        }
        Ok(runners)
    }

    /// Resolve a registered GitLab project and check its authenticated owner's role.
    pub(super) fn runner_creation_project(
        &self,
        binding: &Binding,
        cancel: &AtomicBool,
    ) -> Result<u64, TaskFailure> {
        if binding.provider != Provider::Gitlab {
            return Err(TaskFailure::new(
                "invalid_input",
                "Creating project runners requires GitLab",
            ));
        }
        binding.validate()?;
        let path = urlencoding::encode(&binding.repository);
        let project = self.api(binding, format!("projects/{path}"), cancel)?;
        let id = project["id"]
            .as_u64()
            .filter(|id| *id > 0)
            .ok_or_else(|| TaskFailure::new("invalid_response", "Project ID is unavailable"))?;
        let owner = ["project_access", "group_access"].iter().any(|key| {
            project["permissions"][key]["access_level"]
                .as_u64()
                .is_some_and(|level| level >= 50)
        });
        if owner {
            return Ok(id);
        }
        let repository = json!(binding.repository);
        let query = format!(
            "{{ project(fullPath: {repository}) {{ userPermissions {{ adminAllResources }} }} }}"
        );
        let response = self.request(
            binding,
            "POST",
            "graphql".into(),
            &[("query", query)],
            cancel,
        )?;
        if response["data"]["project"]["userPermissions"]["adminAllResources"].as_bool()
            == Some(true)
        {
            Ok(id)
        } else {
            Err(TaskFailure::new(
                "permission",
                "The authenticated account cannot create a project runner",
            ))
        }
    }

    /// Create a project runner through glab. The one-time token is only returned to the caller.
    pub fn create_project_runner(
        &self,
        binding: &Binding,
        description: &str,
        cancel: &AtomicBool,
    ) -> Result<CreatedProjectRunner, TaskFailure> {
        let name = description.trim();
        if name.is_empty() || name.len() > 255 || name.chars().any(char::is_control) {
            return Err(TaskFailure::new(
                "invalid_input",
                "Enter a valid runner name",
            ));
        }
        let project_id = self.runner_creation_project(binding, cancel)?;
        let result = self.request(
            binding,
            "POST",
            "user/runners".into(),
            &[
                ("runner_type", "project_type".into()),
                ("project_id", project_id.to_string()),
                ("description", name.into()),
            ],
            cancel,
        )?;
        let (Some(id), Some(token)) = (
            result["id"].as_u64().filter(|id| *id > 0),
            optional_string(&result, "token"),
        ) else {
            return Err(TaskFailure::new("invalid_response", "The runner creation response could not be confirmed. Refresh the list before trying again."));
        };
        Ok(CreatedProjectRunner { id, token })
    }
}
