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
    let runtime = super::super::native::python_runtime().unwrap_or_else(|_| {
        if cfg!(windows) {
            "python".into()
        } else {
            "python3".into()
        }
    });
    let content = if shell == "powershell" {
        format!(
            "& '{}' \"$env:AGENT_HUB_SCRIPT_DIR/agent-task/agent.py\"",
            runtime.to_string_lossy().replace('\'', "''")
        )
    } else {
        format!(
            "'{}' \"$AGENT_HUB_SCRIPT_DIR/agent-task/agent.py\"",
            runtime.to_string_lossy().replace('\'', "'\\''")
        )
    };
    let mut draft = AutomationDraft {
        name: String::new(), provider: Provider::System, content,
        workdir: None, script_dir: None, schedule: Schedule::Daily { hour: 9, minute: 0, weekdays: true }, enabled: true,
        files: vec![
            AutomationScriptFile { path: "agent-task/agent.py".into(), content: include_str!("builtin/herdr-agent.py").into() },
            AutomationScriptFile { path: "agent-task/prompt.md".into(), content: String::new() },
            AutomationScriptFile { path: "agent-task/herdr.json".into(), content: "{\"session\":\"default\",\"agent\":\"codex\",\"arguments\":[],\"title\":\"AgentHub task\"}\n".into() },
        ],
    };
    super::super::native::shell_entry::wrap(&mut draft, shell);
    draft
}

pub(super) const DISK_CLEANUP_FILES: &[(&str, &str)] = &[
    (
        "disk-cleanup.py",
        include_str!("builtin/disk-cleanup/disk-cleanup.py"),
    ),
    (
        "cleanup_config.py",
        include_str!("builtin/disk-cleanup/cleanup_config.py"),
    ),
    (
        "cleanup_files.py",
        include_str!("builtin/disk-cleanup/cleanup_files.py"),
    ),
    (
        "cleanup_rules.py",
        include_str!("builtin/disk-cleanup/cleanup_rules.py"),
    ),
    (
        "cleanup_actions.py",
        include_str!("builtin/disk-cleanup/cleanup_actions.py"),
    ),
    (
        "cleanup_report.py",
        include_str!("builtin/disk-cleanup/cleanup_report.py"),
    ),
    (
        "cleanup-config.json",
        include_str!("builtin/disk-cleanup/cleanup-config.json"),
    ),
    ("README.md", include_str!("builtin/disk-cleanup/README.md")),
];

const BUNDLES: &[Bundle] = &[
    (
        include_str!("builtin/network-reset/template.json"),
        &[
            (
                "network-reset.py",
                include_str!("builtin/network-reset/network-reset.py"),
            ),
            ("setup.sh", include_str!("builtin/network-reset/setup.sh")),
            ("reset.sh", include_str!("builtin/network-reset/reset.sh")),
            ("README.md", include_str!("builtin/network-reset/README.md")),
        ],
    ),
    (
        include_str!("builtin/workspace-check/template.json"),
        &[(
            "workspace-check.py",
            include_str!("builtin/workspace-check/workspace-check.py"),
        )],
    ),
    (
        include_str!("builtin/disk-cleanup/template.json"),
        DISK_CLEANUP_FILES,
    ),
    (
        include_str!("builtin/git-status/template.json"),
        &[(
            "git-status.py",
            include_str!("builtin/git-status/git-status.py"),
        )],
    ),
    (
        include_str!("builtin/agent-code-review/template.json"),
        &[
            (
                "agent-code-review.py",
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
        include_str!("builtin/agent-maintenance/template.json"),
        &[
            ("agent.py", include_str!("builtin/herdr-agent.py")),
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
        include_str!("builtin/agent-mr-processing/template.json"),
        &[
            ("agent.py", include_str!("builtin/herdr-agent.py")),
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
        include_str!("builtin/agent-issue-processing/template.json"),
        &[
            ("agent.py", include_str!("builtin/herdr-agent.py")),
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
    (include_str!("builtin/repository-audit/template.json"), &[]),
    (include_str!("builtin/daily-summary/template.json"), &[]),
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
    let runtime = super::super::native::python_runtime().unwrap_or_else(|_| {
        std::path::PathBuf::from(if cfg!(windows) { "python" } else { "python3" })
    });
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
            let path = format!(
                "{}/{}",
                manifest.id,
                manifest.entrypoint.as_deref().unwrap_or_default()
            );
            let command = if shell == "powershell" {
                format!(
                    "& '{}' \"$env:AGENT_HUB_SCRIPT_DIR/{}\"",
                    runtime.to_string_lossy().replace('\'', "''"),
                    path
                )
            } else {
                format!(
                    "'{}' \"$AGENT_HUB_SCRIPT_DIR/{}\"",
                    runtime.to_string_lossy().replace('\'', "'\\''"),
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
                        path: format!("{}/{}", manifest.id, name),
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
            Some(AutomationTemplate {
                id: manifest.id,
                title: title.clone(),
                description: manifest.description.get(locale),
                draft,
            })
        })
        .collect()
}
