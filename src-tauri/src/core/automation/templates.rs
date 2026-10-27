use super::AutomationDraft;
use serde::Serialize;
mod builtin;
#[cfg(test)]
mod cleanup;

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
}

/// GUI and agents receive exactly the same platform-correct starter tasks.
pub fn templates(locale: Option<&str>) -> AutomationCatalog {
    catalog(
        locale.unwrap_or("en"),
        super::super::tool_detection::is_installed("hermes"),
        super::command_shell(),
    )
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::automation::Provider;
    #[test]
    fn templates_use_the_native_shell_and_hide_uninstalled_hermes() {
        let windows = catalog("zh", false, "powershell");
        assert_eq!(windows.templates.len(), 3);
        assert!(windows.templates[0]
            .draft
            .content
            .contains("workspace-check.py"));
        assert_eq!(windows.templates[0].title, "工作目录检查");
        assert!(windows
            .templates
            .iter()
            .all(|t| t.draft.provider == Provider::System));
        let unix = catalog("en", true, "sh");
        assert_eq!(unix.templates.len(), 5);
        let cleanup = windows
            .templates
            .iter()
            .find(|t| t.id == "disk-cleanup")
            .unwrap();
        assert_eq!(cleanup.title, "清理磁盘缓存");
        assert!(cleanup.draft.files[0]
            .content
            .contains("FILE_ATTRIBUTE_REPARSE_POINT"));
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
