use super::AutomationDraft;
use serde::Serialize;
#[cfg(test)]
mod agent_code_review;
mod builtin;
pub(super) use builtin::directory_slug;
#[cfg(test)]
mod cleanup;
#[cfg(all(test, target_os = "macos"))]
mod network_reset;

#[derive(Serialize)]
pub struct AutomationTemplate {
    pub id: String,
    pub title: String,
    pub description: String,
    pub draft: AutomationDraft,
}
#[derive(Serialize)]
pub struct AutomationCatalog {
    pub shell: String,
    pub templates: Vec<AutomationTemplate>,
    pub agent_starter: AutomationDraft,
}

/// GUI and agents receive exactly the same platform-correct starter tasks.
pub fn templates(locale: Option<&str>) -> AutomationCatalog {
    catalog(
        locale.unwrap_or("en"),
        super::super::tool_detection::is_installed("hermes"),
        super::command_shell(),
    )
}

/// Keep explicit legacy CLI IDs available without crowding the recommended catalog.
pub fn template(id: &str, locale: Option<&str>) -> Option<AutomationTemplate> {
    builtin::all_templates(
        locale.unwrap_or("en"),
        super::super::tool_detection::is_installed("hermes"),
        super::command_shell(),
    )
    .into_iter()
    .find(|template| template.id == id)
}

fn localized(locale: &str, en: &str, zh: &str, tw: &str) -> String {
    if locale.starts_with("zh-TW") || locale.starts_with("zh-Hant") {
        tw.into()
    } else if locale.starts_with("zh") {
        zh.into()
    } else {
        en.into()
    }
}

fn catalog(locale: &str, hermes: bool, shell: &str) -> AutomationCatalog {
    let templates = builtin::templates(locale, hermes, shell);
    AutomationCatalog {
        shell: shell.into(),
        templates,
        agent_starter: builtin::agent_starter(shell),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn new_template_launchers_resolve_python_from_the_task_environment() {
        for shell in ["sh", "powershell"] {
            let templates = catalog("en", false, shell).templates;
            for template in templates {
                let entry =
                    crate::core::automation::native::shell_entry::entry(&template.draft).unwrap();
                assert!(entry.content.contains("AGENT_HUB_PYTHON"));
                assert!(!entry.content.contains("/bin/python"));
            }
        }
    }
    use crate::core::automation::Provider;
    #[test]
    fn catalog_keeps_core_scenarios_with_short_prompts_and_legacy_cli_ids() {
        let catalog = catalog("zh", true, "sh");
        assert_eq!(
            catalog
                .templates
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            if cfg!(target_os = "macos") {
                vec![
                    "agent-maintenance",
                    "agent-mr-processing",
                    "agent-issue-processing",
                    "disk-cleanup",
                    "network-reset",
                ]
            } else {
                vec![
                    "agent-maintenance",
                    "agent-mr-processing",
                    "agent-issue-processing",
                    "disk-cleanup",
                ]
            }
        );
        for item in &catalog.templates {
            if let Some(prompt) = item
                .draft
                .files
                .iter()
                .find(|file| file.path == "prompt.md" || file.path.ends_with("/prompt.md"))
            {
                assert!(prompt.content.trim().chars().count() <= 160, "{}", item.id);
            }
        }
        for id in [
            "workspace-check",
            "git-status",
            "agent-code-review",
            "repository-audit",
            "daily-summary",
        ] {
            assert!(
                builtin::all_templates("zh", true, "sh")
                    .iter()
                    .any(|item| item.id == id),
                "{id}"
            );
        }
        assert!(super::template("workspace-check", Some("zh")).is_some());
    }
    #[test]
    fn generic_agent_starter_requires_user_content_and_has_no_specialized_task_prompt() {
        for shell in ["sh", "powershell"] {
            let mut draft = catalog("zh", false, shell).agent_starter;
            assert!(draft.validate().is_err());
            draft.name = "Custom task".into();
            draft
                .files
                .iter_mut()
                .find(|file| file.path == "prompt.md" || file.path.ends_with("/prompt.md"))
                .unwrap()
                .content = "Check this project".into();
            draft.validate().unwrap();
            assert_eq!(draft.provider, Provider::System);
            assert!(draft
                .files
                .iter()
                .any(|file| file.path == "herdr.json" || file.path.ends_with("/herdr.json")));
        }
    }
    #[test]
    fn core_templates_use_the_native_shell_without_requiring_hermes() {
        let windows = catalog("zh", false, "powershell");
        assert_eq!(windows.templates.len(), 4);
        assert!(windows.templates[0]
            .draft
            .files
            .last()
            .unwrap()
            .content
            .contains("scripts/agent.py"));
        assert_eq!(windows.templates[0].draft.content, "& './scripts/run.ps1'");
        assert_eq!(windows.templates[0].title, "项目巡检");
        assert!(windows
            .templates
            .iter()
            .all(|t| t.draft.provider == Provider::System));
        let unix = catalog("en", true, "sh");
        assert_eq!(
            unix.templates.len(),
            if cfg!(target_os = "macos") { 5 } else { 4 }
        );
        assert_eq!(unix.templates[0].draft.content, "sh './scripts/run.sh'");
        let cleanup = windows
            .templates
            .iter()
            .find(|t| t.id == "disk-cleanup")
            .unwrap();
        assert_eq!(cleanup.title, "清理磁盘缓存");
        assert!(cleanup
            .draft
            .files
            .iter()
            .any(|file| file.content.contains("FILE_ATTRIBUTE_REPARSE_POINT")));
        assert_eq!(
            catalog("zh-TW", false, "sh")
                .templates
                .into_iter()
                .find(|t| t.id == "disk-cleanup")
                .unwrap()
                .title,
            "清理磁碟快取"
        );
        for mut template in unix.templates {
            template.draft.validate().unwrap();
        }
    }
}
