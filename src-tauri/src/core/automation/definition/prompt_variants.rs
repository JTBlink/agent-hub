use super::{AutomationDraft, Provider};
use serde::Deserialize;
use std::collections::{BTreeMap, HashSet};

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
    #[serde(default)]
    variables: Vec<Variable>,
    // The active body belongs exclusively to the existing runtime prompt.
    // Missing and explicit null are distinguished by the raw-value check below.
    content: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Variable {
    name: String,
    value: String,
}

fn variables_map(variables: &[Variable]) -> Result<BTreeMap<String, String>, String> {
    let mut result = BTreeMap::new();
    for variable in variables {
        let name = &variable.name;
        if name.is_empty()
            || name.len() > 128
            || !name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
            || name.as_bytes()[0].is_ascii_digit()
            || variable.value.contains('\0')
            || result
                .insert(name.clone(), variable.value.clone())
                .is_some()
        {
            return Err(
                "Custom variables require unique identifier names and string values without NUL"
                    .into(),
            );
        }
    }
    Ok(result)
}

pub(crate) fn active_variables(
    draft: &AutomationDraft,
) -> Result<BTreeMap<String, String>, String> {
    let Some(file) = draft
        .files
        .iter()
        .find(|f| f.path == "config/prompt-variants.json")
    else {
        return Ok(BTreeMap::new());
    };
    let manifest: Manifest =
        serde_json::from_str(&file.content).map_err(|_| "Invalid prompt variants configuration")?;
    let variant = manifest
        .variants
        .iter()
        .find(|v| v.id == manifest.active_id)
        .ok_or("Missing active prompt")?;
    variables_map(&variant.variables)
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
        variables_map(&variant.variables)?;
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

/// Read variables from the requested scenario, or from the active scenario.
pub fn prompt_variables(
    draft: &AutomationDraft,
    variant: Option<&str>,
) -> Result<(String, BTreeMap<String, String>), String> {
    let file = draft
        .files
        .iter()
        .find(|f| f.path == "config/prompt-variants.json")
        .ok_or("Task has no prompt variants; add a scenario before configuring variables")?;
    let manifest: Manifest =
        serde_json::from_str(&file.content).map_err(|_| "Invalid prompt variants configuration")?;
    let id = variant.unwrap_or(&manifest.active_id);
    let selected = manifest
        .variants
        .iter()
        .find(|v| v.id == id)
        .ok_or("Prompt variant not found")?;
    Ok((id.into(), variables_map(&selected.variables)?))
}

/// Update one scenario variable without changing its selection, behavior or body.
pub fn set_prompt_variable(
    draft: &mut AutomationDraft,
    variant: Option<&str>,
    name: &str,
    value: Option<&str>,
) -> Result<(), String> {
    let (id, mut variables) = prompt_variables(draft, variant)?;
    if let Some(value) = value {
        variables.insert(name.into(), value.into());
    } else if variables.remove(name).is_none() {
        return Err("Custom variable not found".into());
    }
    let mut updated = draft.clone();
    let file = updated
        .files
        .iter_mut()
        .find(|f| f.path == "config/prompt-variants.json")
        .unwrap();
    let mut manifest: serde_json::Value =
        serde_json::from_str(&file.content).map_err(|_| "Invalid prompt variants configuration")?;
    let selected = manifest["variants"]
        .as_array_mut()
        .ok_or("Invalid prompt variants")?
        .iter_mut()
        .find(|v| v["id"].as_str() == Some(&id))
        .ok_or("Prompt variant not found")?;
    if variables.is_empty() {
        selected
            .as_object_mut()
            .ok_or("Invalid prompt variant")?
            .remove("variables");
    } else {
        selected["variables"] = serde_json::json!(variables
            .into_iter()
            .map(|(name, value)| serde_json::json!({"name":name,"value":value}))
            .collect::<Vec<_>>());
        manifest["version"] = serde_json::json!(2);
    }
    file.content = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())? + "\n";
    updated.validate()?;
    *draft = updated;
    Ok(())
}
