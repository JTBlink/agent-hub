//! Read-only runtime inventory. Never executes task bodies or changes external schedulers.
use super::{AutomationDraft, Provider, TaskOrigin};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeMode {
    SharedAgent,
    UnverifiedAgent,
    Script,
    NativeHermes,
    External,
}

#[derive(Debug, Serialize)]
pub struct Finding {
    pub path: String,
    pub code: &'static str,
}

#[derive(Debug, Serialize)]
pub struct TaskAudit {
    pub id: String,
    pub name: String,
    pub mode: RuntimeMode,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Default, Serialize)]
pub struct RuntimeAudit {
    pub tasks: Vec<TaskAudit>,
    pub discovery_issues: Vec<String>,
}

impl RuntimeAudit {
    pub fn is_clean(&self) -> bool {
        self.discovery_issues.is_empty() && self.tasks.iter().all(|task| task.findings.is_empty())
    }
}

fn inspect(id: String, draft: &AutomationDraft) -> TaskAudit {
    let agent = draft
        .files
        .iter()
        .any(|file| matches!(file.path.as_str(), "config/herdr.json" | "herdr.json"));
    let mut shared = false;
    let mut findings = Vec::new();
    for file in &draft.files {
        if !file.path.ends_with(".py") {
            continue;
        }
        let body = &file.content;
        shared |=
            body.trim() == include_str!("../../../../automations/_shared/agent-entry.py").trim();
        let code = if body.contains("def previous_agent(") && body.contains("def wait_for_result(")
        {
            Some("embedded_agent_runtime")
        } else if body.contains("class TaskState:") && body.contains("def extension(") {
            Some("embedded_state_store")
        } else {
            None
        };
        if let Some(code) = code {
            findings.push(Finding {
                path: file.path.clone(),
                code,
            });
        }
    }
    if agent && !shared {
        findings.push(Finding {
            path: "scripts/".into(),
            code: "agent_adapter_needs_review",
        });
    }
    if draft.provider == Provider::System {
        if let Some(entry) = draft
            .files
            .iter()
            .find(|file| file.path == "scripts/run.sh")
        {
            if !entry.content.contains("dirname") && entry.content.contains("$AGENT_HUB_SCRIPT_DIR")
            {
                findings.push(Finding {
                    path: entry.path.clone(),
                    code: "entry_requires_inherited_directory",
                });
            }
        }
    }
    let mode = if draft.provider == Provider::Hermes {
        RuntimeMode::NativeHermes
    } else if agent && shared {
        RuntimeMode::SharedAgent
    } else if agent {
        RuntimeMode::UnverifiedAgent
    } else {
        RuntimeMode::Script
    };
    TaskAudit {
        id,
        name: draft.name.clone(),
        mode,
        findings,
    }
}

/// Audit source definitions without importing, registering, running or creating private state.
pub fn repository(root: &Path) -> Result<RuntimeAudit, String> {
    let catalog = super::package::catalog::scan_portable(root)?;
    if catalog.packages.is_empty() && catalog.issues.is_empty() {
        return Err("No task packages found in the selected directory".into());
    }
    Ok(RuntimeAudit {
        tasks: catalog
            .packages
            .into_iter()
            .map(|entry| inspect(entry.path, &entry.package.draft))
            .collect(),
        discovery_issues: catalog
            .issues
            .into_iter()
            .map(|issue| format!("{}: {}", issue.path, issue.message))
            .collect(),
    })
}

/// Native Hermes and vendor services keep their own execution models and scheduler ownership.
pub fn installed() -> RuntimeAudit {
    let inventory = super::overview(None);
    let tasks = inventory
        .tasks
        .into_iter()
        .filter(|task| !task.is_builtin)
        .map(|task| {
            if task.origin == TaskOrigin::AgentHub || task.source == "hermes" {
                if let Some(draft) = task.definition {
                    return inspect(task.id, &draft);
                }
                return TaskAudit {
                    id: task.id,
                    name: task.name,
                    mode: RuntimeMode::External,
                    findings: vec![Finding {
                        path: "config/task.json".into(),
                        code: "task_definition_unavailable",
                    }],
                };
            }
            TaskAudit {
                id: task.id,
                name: task.name,
                mode: RuntimeMode::External,
                findings: Vec::new(),
            }
        })
        .collect();
    RuntimeAudit {
        tasks,
        discovery_issues: inventory
            .issues
            .into_iter()
            .map(|issue| format!("{}: {}", issue.source, issue.message))
            .collect(),
    }
}

#[cfg(test)]
mod tests;
