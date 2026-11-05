//! Template folders and their scripts are embedded into both app and CLI builds.
use super::{localized, AutomationTemplate};
#[cfg(feature = "herdr")]
use crate::core::automation::Schedule;
use crate::core::automation::{AutomationDraft, AutomationScriptFile, Provider};
use serde::Deserialize;

#[derive(Deserialize)]
struct Text {
    en: String,
    zh: String,
    #[serde(rename = "zh-TW")]
    tw: String,
}
impl Text {
    fn get(&self, locale: &str) -> String {
        localized(locale, &self.en, &self.zh, &self.tw)
    }
}
#[derive(Deserialize)]
struct Manifest {
    id: String,
    title: Text,
    #[serde(default)]
    aliases: Vec<String>,
    description: Text,
    entrypoint: Option<String>,
    prompt: Option<Text>,
    default_enabled: bool,
    platform: Option<String>,
}

#[derive(Deserialize)]
struct TaskManifest {
    version: String,
    draft: AutomationDraft,
    files: Vec<String>,
    dependencies: Vec<super::super::package::Dependency>,
}
type Bundle = (
    &'static str,
    &'static str,
    &'static [(&'static str, &'static str)],
);

#[cfg(feature = "herdr")]
pub(super) fn agent_starter(shell: &str) -> AutomationDraft {
    let runtime = if shell == "powershell" {
        "python"
    } else {
        "python3"
    };
    let content = if shell == "powershell" {
        format!(
            "if (!$env:AGENT_HUB_PYTHON) {{ $env:AGENT_HUB_PYTHON = '{}' }}; & $env:AGENT_HUB_PYTHON \"$env:AGENT_HUB_SCRIPT_DIR/scripts/agent.py\"",
            runtime
        )
    } else {
        format!(
            "\"${{AGENT_HUB_PYTHON:-{}}}\" \"$AGENT_HUB_SCRIPT_DIR/scripts/agent.py\"",
            runtime
        )
    };
    let mut draft = AutomationDraft {
        package_options: None,
        name: String::new(),
        provider: Provider::System,
        content,
        workdir: None,
        script_dir: None,
        schedule: Schedule::Daily {
            hour: 9,
            minute: 0,
            weekdays: true,
        },
        enabled: true,
        files: vec![
            AutomationScriptFile {
                path: "scripts/agent.py".into(),
                content: include_str!("../../../../../automations/_shared/agent-entry.py").into(),
            },
            AutomationScriptFile {
                path: "scripts/herdr_agent.py".into(),
                content: include_str!("../../../../../automations/_shared/herdr-agent.py").into(),
            },
            AutomationScriptFile {
                path: "prompts/prompt.md".into(),
                content: String::new(),
            },
            AutomationScriptFile {
                path: "config/herdr.json".into(),
                content:
                    "{\"session\":\"default\",\"agent\":\"default\",\"title\":\"AgentHub task\"}\n"
                        .into(),
            },
        ],
    };
    super::super::native::shell_entry::wrap(&mut draft, shell);
    super::super::package::normalize(&mut draft);
    draft
}

#[cfg(test)]
pub(super) const DISK_CLEANUP_FILES: &[(&str, &str)] = &[
    (
        "scripts/disk-cleanup.py",
        include_str!("../../../../../automations/system/disk-cleanup/scripts/disk-cleanup.py"),
    ),
    (
        "scripts/cleanup_config.py",
        include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_config.py"),
    ),
    (
        "scripts/cleanup_files.py",
        include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_files.py"),
    ),
    (
        "scripts/cleanup_rules.py",
        include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_rules.py"),
    ),
    (
        "scripts/cleanup_actions.py",
        include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_actions.py"),
    ),
    (
        "scripts/cleanup_report.py",
        include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_report.py"),
    ),
    (
        "config/cleanup-config.json",
        include_str!("../../../../../automations/system/disk-cleanup/config/cleanup-config.json"),
    ),
    (
        "TASK.md",
        include_str!("../../../../../automations/system/disk-cleanup/TASK.md"),
    ),
];

const BUNDLES: &[Bundle] = &[
#[cfg(feature = "herdr")]
(include_str!("../../../../../automations/engineering/agent-code-review/config/catalog.json"), include_str!("../../../../../automations/engineering/agent-code-review/config/task.json"), &[
("scripts/herdr_agent.py", include_str!("../../../../../automations/_shared/herdr-agent.py")),
("scripts/agent-code-review.py", include_str!("../../../../../automations/engineering/agent-code-review/scripts/agent-code-review.py")),
("prompts/prompt.md", include_str!("../../../../../automations/engineering/agent-code-review/prompts/prompt.md")),
("config/herdr.json", include_str!("../../../../../automations/engineering/agent-code-review/config/herdr.json")),
("TASK.md", include_str!("../../../../../automations/engineering/agent-code-review/TASK.md")),
("scripts/run.sh", include_str!("../../../../../automations/engineering/agent-code-review/scripts/run.sh"))
]),
#[cfg(feature = "herdr")]
(include_str!("../../../../../automations/engineering/agent-issue-processing/config/catalog.json"), include_str!("../../../../../automations/engineering/agent-issue-processing/config/task.json"), &[
("scripts/herdr_agent.py", include_str!("../../../../../automations/_shared/herdr-agent.py")),
("scripts/agent.py", include_str!("../../../../../automations/engineering/agent-issue-processing/scripts/agent.py")),
("prompts/prompt.md", include_str!("../../../../../automations/engineering/agent-issue-processing/prompts/prompt.md")),
("config/herdr.json", include_str!("../../../../../automations/engineering/agent-issue-processing/config/herdr.json")),
("TASK.md", include_str!("../../../../../automations/engineering/agent-issue-processing/TASK.md")),
("scripts/run.sh", include_str!("../../../../../automations/engineering/agent-issue-processing/scripts/run.sh"))
]),
#[cfg(feature = "herdr")]
(include_str!("../../../../../automations/engineering/agent-maintenance/config/catalog.json"), include_str!("../../../../../automations/engineering/agent-maintenance/config/task.json"), &[
("scripts/herdr_agent.py", include_str!("../../../../../automations/_shared/herdr-agent.py")),
("scripts/agent.py", include_str!("../../../../../automations/engineering/agent-maintenance/scripts/agent.py")),
("prompts/prompt.md", include_str!("../../../../../automations/engineering/agent-maintenance/prompts/prompt.md")),
("config/herdr.json", include_str!("../../../../../automations/engineering/agent-maintenance/config/herdr.json")),
("TASK.md", include_str!("../../../../../automations/engineering/agent-maintenance/TASK.md")),
("scripts/run.sh", include_str!("../../../../../automations/engineering/agent-maintenance/scripts/run.sh"))
]),
#[cfg(feature = "herdr")]
(include_str!("../../../../../automations/engineering/agent-mr-processing/config/catalog.json"), include_str!("../../../../../automations/engineering/agent-mr-processing/config/task.json"), &[
("scripts/herdr_agent.py", include_str!("../../../../../automations/_shared/herdr-agent.py")),
("scripts/agent.py", include_str!("../../../../../automations/engineering/agent-mr-processing/scripts/agent.py")),
("scripts/review.py", include_str!("../../../../../automations/engineering/agent-mr-processing/scripts/review.py")),
("scripts/review_host.py", include_str!("../../../../../automations/engineering/agent-mr-processing/scripts/review_host.py")),
("scripts/repair_state.py", include_str!("../../../../../automations/engineering/agent-mr-processing/scripts/repair_state.py")),
("scripts/review_labels.py", include_str!("../../../../../automations/engineering/agent-mr-processing/scripts/review_labels.py")),
("references/review-labels.md", include_str!("../../../../../automations/engineering/agent-mr-processing/references/review-labels.md")),
("scripts/task_state.py", include_str!("../../../../../automations/_shared/task-state.py")),
("config/review-config.json", include_str!("../../../../../automations/engineering/agent-mr-processing/config/review-config.json")),
("prompts/prompt.md", include_str!("../../../../../automations/engineering/agent-mr-processing/prompts/prompt.md")),
("config/herdr.json", include_str!("../../../../../automations/engineering/agent-mr-processing/config/herdr.json")),
("TASK.md", include_str!("../../../../../automations/engineering/agent-mr-processing/TASK.md")),
("references/platforms.md", include_str!("../../../../../automations/engineering/agent-mr-processing/references/platforms.md")),
("references/runtime.md", include_str!("../../../../../automations/engineering/agent-mr-processing/references/runtime.md")),
("scripts/run.sh", include_str!("../../../../../automations/engineering/agent-mr-processing/scripts/run.sh"))
]),
#[cfg(feature = "herdr")]
(include_str!("../../../../../automations/hermes/daily-summary/config/catalog.json"), include_str!("../../../../../automations/hermes/daily-summary/config/task.json"), &[
("scripts/herdr_agent.py", include_str!("../../../../../automations/_shared/herdr-agent.py")),
("scripts/agent.py", include_str!("../../../../../automations/hermes/daily-summary/scripts/agent.py")),
("scripts/run.sh", include_str!("../../../../../automations/hermes/daily-summary/scripts/run.sh")),
("config/herdr.json", include_str!("../../../../../automations/hermes/daily-summary/config/herdr.json")),
("prompts/prompt.md", include_str!("../../../../../automations/hermes/daily-summary/prompts/prompt.md")),
("TASK.md", include_str!("../../../../../automations/hermes/daily-summary/TASK.md"))
]),
(include_str!("../../../../../automations/system/disk-cleanup/config/catalog.json"), include_str!("../../../../../automations/system/disk-cleanup/config/task.json"), &[
("scripts/disk-cleanup.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/disk-cleanup.py")),
("scripts/cleanup_config.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_config.py")),
("scripts/cleanup_files.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_files.py")),
("scripts/cleanup_rules.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_rules.py")),
("scripts/cleanup_actions.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_actions.py")),
("scripts/cleanup_report.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_report.py")),
("config/cleanup-config.json", include_str!("../../../../../automations/system/disk-cleanup/config/cleanup-config.json")),
("TASK.md", include_str!("../../../../../automations/system/disk-cleanup/TASK.md")),
("scripts/run.sh", include_str!("../../../../../automations/system/disk-cleanup/scripts/run.sh"))
]),
(include_str!("../../../../../automations/system/git-status/config/catalog.json"), include_str!("../../../../../automations/system/git-status/config/task.json"), &[
("scripts/git-status.py", include_str!("../../../../../automations/system/git-status/scripts/git-status.py")),
("scripts/run.sh", include_str!("../../../../../automations/system/git-status/scripts/run.sh")),
("TASK.md", include_str!("../../../../../automations/system/git-status/TASK.md"))
]),
(include_str!("../../../../../automations/system/network-reset/config/catalog.json"), include_str!("../../../../../automations/system/network-reset/config/task.json"), &[
("scripts/network-reset.py", include_str!("../../../../../automations/system/network-reset/scripts/network-reset.py")),
("scripts/setup.sh", include_str!("../../../../../automations/system/network-reset/scripts/setup.sh")),
("scripts/reset.sh", include_str!("../../../../../automations/system/network-reset/scripts/reset.sh")),
("TASK.md", include_str!("../../../../../automations/system/network-reset/TASK.md")),
("scripts/run.sh", include_str!("../../../../../automations/system/network-reset/scripts/run.sh"))
]),
#[cfg(feature = "herdr")]
(include_str!("../../../../../automations/hermes/repository-audit/config/catalog.json"), include_str!("../../../../../automations/hermes/repository-audit/config/task.json"), &[
("scripts/herdr_agent.py", include_str!("../../../../../automations/_shared/herdr-agent.py")),
("scripts/agent.py", include_str!("../../../../../automations/hermes/repository-audit/scripts/agent.py")),
("scripts/run.sh", include_str!("../../../../../automations/hermes/repository-audit/scripts/run.sh")),
("config/herdr.json", include_str!("../../../../../automations/hermes/repository-audit/config/herdr.json")),
("prompts/prompt.md", include_str!("../../../../../automations/hermes/repository-audit/prompts/prompt.md")),
("TASK.md", include_str!("../../../../../automations/hermes/repository-audit/TASK.md"))
]),
(include_str!("../../../../../automations/system/workspace-check/config/catalog.json"), include_str!("../../../../../automations/system/workspace-check/config/task.json"), &[
("scripts/workspace-check.py", include_str!("../../../../../automations/system/workspace-check/scripts/workspace-check.py")),
("scripts/run.sh", include_str!("../../../../../automations/system/workspace-check/scripts/run.sh")),
("TASK.md", include_str!("../../../../../automations/system/workspace-check/TASK.md"))
])
];

/// Resolve localized built-in display names to their stable English catalog ID.
pub(in crate::core::automation) fn directory_slug(name: &str) -> Option<String> {
    BUNDLES.iter().find_map(|(catalog, _, _)| {
        let catalog: Manifest = serde_json::from_str(catalog).ok()?;
        let matches = [
            catalog.id.as_str(),
            &catalog.title.en,
            &catalog.title.zh,
            &catalog.title.tw,
        ]
        .into_iter()
        .chain(catalog.aliases.iter().map(String::as_str))
        .any(|candidate| candidate == name.trim());
        matches.then_some(catalog.id)
    })
}

pub(super) fn templates(locale: &str, hermes: bool, shell: &str) -> Vec<AutomationTemplate> {
    let mut all = all_templates(locale, hermes, shell);
    [
        "agent-maintenance",
        "agent-mr-processing",
        "agent-issue-processing",
        "disk-cleanup",
        "network-reset",
    ]
    .iter()
    .filter_map(|id| {
        all.iter()
            .position(|template| template.id == *id)
            .map(|index| all.remove(index))
    })
    .collect()
}

pub(super) fn all_templates(locale: &str, hermes: bool, shell: &str) -> Vec<AutomationTemplate> {
    let runtime = if shell == "powershell" {
        "python"
    } else {
        "python3"
    };
    BUNDLES
        .iter()
        .filter_map(|(manifest, package, scripts)| {
            let manifest: Manifest =
                serde_json::from_str(manifest).expect("bundled automation manifest is valid");
            let package: TaskManifest = serde_json::from_str(package).expect("bundled task package is valid");
            if manifest.platform.as_deref() == Some("macos")
                && (!cfg!(target_os = "macos") || shell != "sh")
            {
                return None;
            }
            if package.draft.provider == Provider::Hermes && !hermes {
                return None;
            }
            let title = manifest.title.get(locale);
            let path = manifest.entrypoint.as_deref().unwrap_or_default();
            let command = if shell == "powershell" {
                format!(
                    "if (!$env:AGENT_HUB_PYTHON) {{ $env:AGENT_HUB_PYTHON = '{}' }}; & $env:AGENT_HUB_PYTHON \"$env:AGENT_HUB_SCRIPT_DIR/{}\"",
                    runtime,
                    path
                )
            } else {
                format!(
                    "\"${{AGENT_HUB_PYTHON:-{}}}\" \"$AGENT_HUB_SCRIPT_DIR/{}\"",
                    runtime,
                    path
                )
            };
            let mut files: Vec<AutomationScriptFile> = package
                .files
                .into_iter()
                .filter(|name| package.draft.provider != Provider::System || name != "scripts/run.sh")
                .map(|name| {
                    let content = scripts
                        .iter()
                        .find(|(path, _)| *path == name)
                        .expect("every template script is embedded")
                        .1;
                    AutomationScriptFile {
                        path: name,
                        content: content.into(),
                    }
                })
                .collect();
            if package.draft.provider == Provider::System {
                if let Some(prompt) = &manifest.prompt {
                    if let Some(file) = files.iter_mut().find(|f| f.path == "prompts/prompt.md") {
                        file.content = prompt.get(locale);
                    }
                }
            }
            let command = if package.draft.provider == Provider::Hermes {
                manifest
                    .prompt
                    .expect("Hermes templates require a prompt")
                    .get(locale)
            } else {
                command
            };
            let mut draft = AutomationDraft {
    package_options: Some(super::super::package::PackageOptions { version: Some(package.version), dependencies: package.dependencies, hermes: None }),
                name: title.clone(),
                provider: package.draft.provider,
                content: command,
                files,
                script_dir: None,
                workdir: None,
                schedule: package.draft.schedule,
                enabled: manifest.default_enabled,
            };
            if draft.provider == Provider::System {
                super::super::native::shell_entry::wrap(&mut draft, shell);
            }
            if draft.provider == Provider::System { super::super::package::normalize(&mut draft); }
            Some(AutomationTemplate {
                id: manifest.id,
                title: title.clone(),
                description: manifest.description.get(locale),
                draft,
            })
        })
        .collect()
}
