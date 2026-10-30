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
    schedule: Schedule,
    provider: Provider,
    entrypoint: Option<String>,
    prompt: Option<Text>,
    scripts: Vec<String>,
    enabled: Option<bool>,
    platform: Option<String>,
}

type Bundle = (&'static str, &'static [(&'static str, &'static str)]);

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
            AutomationScriptFile { path: "scripts/agent.py".into(), content: include_str!("builtin/herdr-agent.py").into() },
            AutomationScriptFile { path: "prompt.md".into(), content: String::new() },
            AutomationScriptFile { path: "herdr.json".into(), content: "{\"session\":\"default\",\"agent\":\"codex\",\"arguments\":[\"--dangerously-bypass-approvals-and-sandbox\"],\"title\":\"AgentHub task\"}\n".into() },
        ],
    };
    super::super::native::shell_entry::wrap(&mut draft, shell);
    super::super::package::normalize(&mut draft);
    draft
}

pub(super) const DISK_CLEANUP_FILES: &[(&str, &str)] = &[
    (
        "scripts/disk-cleanup.py",
        include_str!("builtin/disk-cleanup/scripts/disk-cleanup.py"),
    ),
    (
        "scripts/cleanup_config.py",
        include_str!("builtin/disk-cleanup/scripts/cleanup_config.py"),
    ),
    (
        "scripts/cleanup_files.py",
        include_str!("builtin/disk-cleanup/scripts/cleanup_files.py"),
    ),
    (
        "scripts/cleanup_rules.py",
        include_str!("builtin/disk-cleanup/scripts/cleanup_rules.py"),
    ),
    (
        "scripts/cleanup_actions.py",
        include_str!("builtin/disk-cleanup/scripts/cleanup_actions.py"),
    ),
    (
        "scripts/cleanup_report.py",
        include_str!("builtin/disk-cleanup/scripts/cleanup_report.py"),
    ),
    (
        "scripts/cleanup-config.json",
        include_str!("builtin/disk-cleanup/scripts/cleanup-config.json"),
    ),
    ("README.md", include_str!("builtin/disk-cleanup/README.md")),
];

const BUNDLES: &[Bundle] = &[
    (
        include_str!("builtin/network-reset/task.json"),
        &[
            (
                "scripts/network-reset.py",
                include_str!("builtin/network-reset/scripts/network-reset.py"),
            ),
            (
                "scripts/setup.sh",
                include_str!("builtin/network-reset/scripts/setup.sh"),
            ),
            (
                "scripts/reset.sh",
                include_str!("builtin/network-reset/scripts/reset.sh"),
            ),
            ("README.md", include_str!("builtin/network-reset/README.md")),
        ],
    ),
    (
        include_str!("builtin/workspace-check/task.json"),
        &[(
            "scripts/workspace-check.py",
            include_str!("builtin/workspace-check/scripts/workspace-check.py"),
        )],
    ),
    (
        include_str!("builtin/disk-cleanup/task.json"),
        DISK_CLEANUP_FILES,
    ),
    (
        include_str!("builtin/git-status/task.json"),
        &[(
            "scripts/git-status.py",
            include_str!("builtin/git-status/scripts/git-status.py"),
        )],
    ),
    (
        include_str!("builtin/agent-code-review/task.json"),
        &[
            (
                "scripts/agent-code-review.py",
                include_str!("builtin/herdr-agent.py"),
            ),
            (
                "prompt.md",
                include_str!("builtin/agent-code-review/prompt.md"),
            ),
            (
                "herdr.json",
                include_str!("builtin/agent-code-review/herdr.json"),
            ),
            (
                "README.md",
                include_str!("builtin/agent-code-review/README.md"),
            ),
        ],
    ),
    (
        include_str!("builtin/agent-maintenance/task.json"),
        &[
            ("scripts/agent.py", include_str!("builtin/herdr-agent.py")),
            (
                "prompt.md",
                include_str!("builtin/agent-maintenance/prompt.md"),
            ),
            (
                "herdr.json",
                include_str!("builtin/agent-maintenance/herdr.json"),
            ),
            (
                "README.md",
                include_str!("builtin/agent-maintenance/README.md"),
            ),
        ],
    ),
    (
        include_str!("builtin/agent-mr-processing/task.json"),
        &[
            ("scripts/agent.py", include_str!("builtin/herdr-agent.py")),
            (
                "prompt.md",
                include_str!("builtin/agent-mr-processing/prompt.md"),
            ),
            (
                "herdr.json",
                include_str!("builtin/agent-mr-processing/herdr.json"),
            ),
            (
                "README.md",
                include_str!("builtin/agent-mr-processing/README.md"),
            ),
        ],
    ),
    (
        include_str!("builtin/agent-issue-processing/task.json"),
        &[
            ("scripts/agent.py", include_str!("builtin/herdr-agent.py")),
            (
                "prompt.md",
                include_str!("builtin/agent-issue-processing/prompt.md"),
            ),
            (
                "herdr.json",
                include_str!("builtin/agent-issue-processing/herdr.json"),
            ),
            (
                "README.md",
                include_str!("builtin/agent-issue-processing/README.md"),
            ),
        ],
    ),
    (include_str!("builtin/repository-audit/task.json"), &[]),
    (include_str!("builtin/daily-summary/task.json"), &[]),
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
        .filter_map(|(manifest, scripts)| {
            let manifest: Manifest =
                serde_json::from_str(manifest).expect("bundled automation manifest is valid");
            if manifest.platform.as_deref() == Some("macos")
                && (!cfg!(target_os = "macos") || shell != "sh")
            {
                return None;
            }
            if manifest.provider == Provider::Hermes && !hermes {
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
            let files = manifest
                .scripts
                .into_iter()
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
            let command = if manifest.provider == Provider::Hermes {
                manifest
                    .prompt
                    .expect("Hermes templates require a prompt")
                    .get(locale)
            } else {
                command
            };
            let mut draft = AutomationDraft {
    package_options: None,
                name: title.clone(),
                provider: manifest.provider,
                content: command,
                files,
                script_dir: None,
                workdir: None,
                schedule: manifest.schedule,
                enabled: manifest.enabled.unwrap_or(true),
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
