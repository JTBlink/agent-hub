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
}

type Bundle = (&'static str, &'static [(&'static str, &'static str)]);

const BUNDLES: &[Bundle] = &[
    (
        include_str!("builtin/workspace-check/template.json"),
        &[(
            "workspace-check.py",
            include_str!("builtin/workspace-check/workspace-check.py"),
        )],
    ),
    (
        include_str!("builtin/disk-cleanup/template.json"),
        &[(
            "disk-cleanup.py",
            include_str!("builtin/disk-cleanup/disk-cleanup.py"),
        )],
    ),
    (
        include_str!("builtin/git-status/template.json"),
        &[(
            "git-status.py",
            include_str!("builtin/git-status/git-status.py"),
        )],
    ),
    (include_str!("builtin/repository-audit/template.json"), &[]),
    (include_str!("builtin/daily-summary/template.json"), &[]),
];

pub(super) fn templates(locale: &str, hermes: bool, shell: &str) -> Vec<AutomationTemplate> {
    let runtime = super::super::native::python_runtime().unwrap_or_else(|_| {
        std::path::PathBuf::from(if cfg!(windows) { "python" } else { "python3" })
    });
    BUNDLES
        .iter()
        .filter_map(|(manifest, scripts)| {
            let manifest: Manifest =
                serde_json::from_str(manifest).expect("bundled automation manifest is valid");
            if manifest.provider == Provider::Hermes && !hermes {
                return None;
            }
            let title = manifest.title.get(locale);
            let path = format!(
                "./{}/{}",
                manifest.id,
                manifest.entrypoint.as_deref().unwrap_or_default()
            );
            let command = if shell == "powershell" {
                format!(
                    "& '{}' '{}'",
                    runtime.to_string_lossy().replace('\'', "''"),
                    path
                )
            } else {
                format!(
                    "'{}' '{}'",
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
                workdir: None,
                schedule: manifest.schedule,
                enabled: true,
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
