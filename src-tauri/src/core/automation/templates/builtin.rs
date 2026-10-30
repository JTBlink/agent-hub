//! Template folders and their scripts are embedded into both app and CLI builds.
use super::{localized, AutomationTemplate};
use crate::core::automation::{AutomationDraft, AutomationScriptFile, Provider, Schedule};
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
        name: String::new(), provider: Provider::System, content,
        workdir: None, script_dir: None, schedule: Schedule::Daily { hour: 9, minute: 0, weekdays: true }, enabled: true,
        files: vec![
            AutomationScriptFile { path: "scripts/agent.py".into(), content: include_str!("../../../../../automations/_shared/herdr-agent.py").into() },
            AutomationScriptFile { path: "prompt.md".into(), content: String::new() },
            AutomationScriptFile { path: "herdr.json".into(), content: "{\"session\":\"default\",\"agent\":\"codex\",\"arguments\":[\"--dangerously-bypass-approvals-and-sandbox\"],\"title\":\"AgentHub task\"}\n".into() },
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
        "scripts/cleanup-config.json",
        include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup-config.json"),
    ),
    (
        "README.md",
        include_str!("../../../../../automations/system/disk-cleanup/README.md"),
    ),
];

const BUNDLES: &[Bundle] = &[
(include_str!("../../../../../automations/engineering/agent-code-review/catalog.json"), include_str!("../../../../../automations/engineering/agent-code-review/task.json"), &[
("scripts/agent-code-review.py", include_str!("../../../../../automations/engineering/agent-code-review/scripts/agent-code-review.py")),
("prompt.md", include_str!("../../../../../automations/engineering/agent-code-review/prompt.md")),
("herdr.json", include_str!("../../../../../automations/engineering/agent-code-review/herdr.json")),
("README.md", include_str!("../../../../../automations/engineering/agent-code-review/README.md")),
("scripts/run.sh", include_str!("../../../../../automations/engineering/agent-code-review/scripts/run.sh"))
]),
(include_str!("../../../../../automations/engineering/agent-issue-processing/catalog.json"), include_str!("../../../../../automations/engineering/agent-issue-processing/task.json"), &[
("scripts/agent.py", include_str!("../../../../../automations/engineering/agent-issue-processing/scripts/agent.py")),
("prompt.md", include_str!("../../../../../automations/engineering/agent-issue-processing/prompt.md")),
("herdr.json", include_str!("../../../../../automations/engineering/agent-issue-processing/herdr.json")),
("README.md", include_str!("../../../../../automations/engineering/agent-issue-processing/README.md")),
("scripts/run.sh", include_str!("../../../../../automations/engineering/agent-issue-processing/scripts/run.sh"))
]),
(include_str!("../../../../../automations/engineering/agent-maintenance/catalog.json"), include_str!("../../../../../automations/engineering/agent-maintenance/task.json"), &[
("scripts/agent.py", include_str!("../../../../../automations/engineering/agent-maintenance/scripts/agent.py")),
("prompt.md", include_str!("../../../../../automations/engineering/agent-maintenance/prompt.md")),
("herdr.json", include_str!("../../../../../automations/engineering/agent-maintenance/herdr.json")),
("README.md", include_str!("../../../../../automations/engineering/agent-maintenance/README.md")),
("scripts/run.sh", include_str!("../../../../../automations/engineering/agent-maintenance/scripts/run.sh"))
]),
(include_str!("../../../../../automations/engineering/agent-mr-processing/catalog.json"), include_str!("../../../../../automations/engineering/agent-mr-processing/task.json"), &[
("scripts/agent.py", include_str!("../../../../../automations/engineering/agent-mr-processing/scripts/agent.py")),
("prompt.md", include_str!("../../../../../automations/engineering/agent-mr-processing/prompt.md")),
("herdr.json", include_str!("../../../../../automations/engineering/agent-mr-processing/herdr.json")),
("README.md", include_str!("../../../../../automations/engineering/agent-mr-processing/README.md")),
("scripts/run.sh", include_str!("../../../../../automations/engineering/agent-mr-processing/scripts/run.sh"))
]),
(include_str!("../../../../../automations/hermes/daily-summary/catalog.json"), include_str!("../../../../../automations/hermes/daily-summary/task.json"), &[
("README.md", include_str!("../../../../../automations/hermes/daily-summary/README.md"))
]),
(include_str!("../../../../../automations/system/disk-cleanup/catalog.json"), include_str!("../../../../../automations/system/disk-cleanup/task.json"), &[
("scripts/disk-cleanup.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/disk-cleanup.py")),
("scripts/cleanup_config.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_config.py")),
("scripts/cleanup_files.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_files.py")),
("scripts/cleanup_rules.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_rules.py")),
("scripts/cleanup_actions.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_actions.py")),
("scripts/cleanup_report.py", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup_report.py")),
("scripts/cleanup-config.json", include_str!("../../../../../automations/system/disk-cleanup/scripts/cleanup-config.json")),
("README.md", include_str!("../../../../../automations/system/disk-cleanup/README.md")),
("scripts/run.sh", include_str!("../../../../../automations/system/disk-cleanup/scripts/run.sh"))
]),
(include_str!("../../../../../automations/system/git-status/catalog.json"), include_str!("../../../../../automations/system/git-status/task.json"), &[
("scripts/git-status.py", include_str!("../../../../../automations/system/git-status/scripts/git-status.py")),
("scripts/run.sh", include_str!("../../../../../automations/system/git-status/scripts/run.sh")),
("README.md", include_str!("../../../../../automations/system/git-status/README.md"))
]),
(include_str!("../../../../../automations/system/network-reset/catalog.json"), include_str!("../../../../../automations/system/network-reset/task.json"), &[
("scripts/network-reset.py", include_str!("../../../../../automations/system/network-reset/scripts/network-reset.py")),
("scripts/setup.sh", include_str!("../../../../../automations/system/network-reset/scripts/setup.sh")),
("scripts/reset.sh", include_str!("../../../../../automations/system/network-reset/scripts/reset.sh")),
("README.md", include_str!("../../../../../automations/system/network-reset/README.md")),
("scripts/run.sh", include_str!("../../../../../automations/system/network-reset/scripts/run.sh"))
]),
(include_str!("../../../../../automations/hermes/repository-audit/catalog.json"), include_str!("../../../../../automations/hermes/repository-audit/task.json"), &[
("README.md", include_str!("../../../../../automations/hermes/repository-audit/README.md"))
]),
(include_str!("../../../../../automations/system/workspace-check/catalog.json"), include_str!("../../../../../automations/system/workspace-check/task.json"), &[
("scripts/workspace-check.py", include_str!("../../../../../automations/system/workspace-check/scripts/workspace-check.py")),
("scripts/run.sh", include_str!("../../../../../automations/system/workspace-check/scripts/run.sh")),
("README.md", include_str!("../../../../../automations/system/workspace-check/README.md"))
])
];

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
            let files = package
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
