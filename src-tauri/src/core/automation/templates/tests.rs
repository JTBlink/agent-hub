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
#[cfg(feature = "herdr")]
use crate::core::automation::Provider;
#[test]
#[cfg(feature = "herdr")]
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
#[cfg(feature = "herdr")]
fn generic_agent_starter_requires_user_content_and_has_no_specialized_task_prompt() {
    for shell in ["sh", "powershell"] {
        let mut draft = catalog("zh", false, shell).agent_starter.unwrap();
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
            .any(|file| file.path == "config/agent.json"
                || file.path.ends_with("/config/agent.json")));
    }
}
#[test]
#[cfg(feature = "herdr")]
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
