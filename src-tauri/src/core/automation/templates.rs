use super::AutomationDraft;
use serde::Serialize;
#[cfg(all(test, feature = "herdr"))]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_starter: Option<AutomationDraft>,
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
        #[cfg(feature = "herdr")]
        agent_starter: Some(builtin::agent_starter(shell)),
        #[cfg(not(feature = "herdr"))]
        agent_starter: None,
    }
}

#[cfg(all(test, feature = "herdr"))]
mod review_preflight_tests;
#[cfg(test)]
mod tests;
