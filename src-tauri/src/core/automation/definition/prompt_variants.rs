use super::{AutomationDraft, Provider};
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: u32,
    active_id: String,
    variants: Vec<Variant>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Variant {
    id: String,
    name: String,
    #[serde(default)]
    behavior: Option<String>,
    // The active body belongs exclusively to the existing runtime prompt.
    // Missing and explicit null are distinguished by the raw-value check below.
    content: Option<String>,
}

pub(super) fn validate(draft: &AutomationDraft) -> Result<(), String> {
    let Some(file) = draft
        .files
        .iter()
        .find(|f| f.path == "config/prompt-variants.json")
    else {
        return Ok(());
    };
    let raw: serde_json::Value =
        serde_json::from_str(&file.content).map_err(|_| "Invalid prompt variants configuration")?;
    let manifest: Manifest =
        serde_json::from_value(raw.clone()).map_err(|_| "Invalid prompt variants configuration")?;
    if !(1..=2).contains(&manifest.version) || !(1..=12).contains(&manifest.variants.len()) {
        return Err("Prompt variants require version 1 or 2 and between 1 and 12 variants".into());
    }
    let prompt = super::runtime_prompt_file(draft);
    if prompt.is_none() && draft.provider != Provider::Hermes {
        return Err("Prompt variants require an existing runtime prompt".into());
    }
    let mut ids = HashSet::new();
    let mut selected = false;
    for (index, variant) in manifest.variants.iter().enumerate() {
        if variant.id.is_empty()
            || variant.id.len() > 64
            || !variant
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
            || !ids.insert(&variant.id)
            || variant.name.trim().is_empty()
            || variant.name.len() > 200
            || variant.name.chars().any(char::is_control)
        {
            return Err("Prompt variants require unique IDs and names of 1–200 bytes without control characters".into());
        }
        if let Some(behavior) = &variant.behavior {
            if (!behavior.is_empty() && behavior.len() > 120)
                || behavior.chars().any(char::is_control)
            {
                return Err(
                    "Prompt behavior must be 1–120 bytes without control characters".into(),
                );
            }
        }
        if variant.id == manifest.active_id {
            if raw["variants"][index].get("content").is_some() {
                return Err("The selected prompt body must stay in the runtime prompt only".into());
            }
            selected = true;
        } else if !matches!(variant.content.as_deref(), Some(text) if !text.trim().is_empty() && !text.contains('\0') && text.len() <= super::MAX_PROMPT_BYTES)
        {
            return Err(
                "Inactive prompt variants require nonempty contents up to 64 KiB without NUL"
                    .into(),
            );
        }
    }
    if !selected {
        return Err("Select exactly one existing prompt variant".into());
    }
    if draft.provider == Provider::Hermes
        && prompt.is_some_and(|file| file.content != draft.content)
    {
        return Err("Hermes runtime content must match the selected prompt".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests;
