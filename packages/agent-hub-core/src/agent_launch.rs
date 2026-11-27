//! Portable Agent launch scheme validation and command resolution.
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

mod defaults;
mod schemes;

pub use defaults::{instructions as default_instructions, key_for_kind, kind_for_key};
pub use schemes::{normalize, AgentSchemes, LaunchScheme};

#[cfg(test)]
mod tests;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Document {
    pub schema_version: u32,
    pub default_agent: String,
    /// Legacy input only; normalize consumes it before persistence or resolution.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub instructions: BTreeMap<String, String>,
    #[serde(default)]
    pub schemes: BTreeMap<String, AgentSchemes>,
}
impl Default for Document {
    fn default() -> Self {
        Self {
            schema_version: 2,
            default_agent: "codex".into(),
            instructions: BTreeMap::new(),
            schemes: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct Launch {
    pub key: String,
    pub kind: Option<String>,
    pub program: String,
    pub arguments: Vec<String>,
}

fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 128
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
/// A command is argv, not a shell program. Quote paths/arguments containing spaces.
/// Parsing never expands environment variables, command substitutions or pipelines.
pub fn parse(instruction: &str) -> Result<(String, Vec<String>)> {
    ensure!(
        !instruction.is_empty()
            && instruction.len() <= 8192
            && !instruction.chars().any(char::is_control),
        "Enter a single launch instruction up to 8 KiB"
    );
    let mut words = shell_words::split(instruction)
        .context("Launch instruction has unclosed quotes")?
        .into_iter();
    let program = words
        .next()
        .filter(|s| !s.is_empty() && !s.starts_with('-'))
        .context("Enter an Agent executable")?;
    Ok((program, words.collect()))
}
/// Resolve and validate an Agent identifier using the configured default when requested.
pub fn agent_key<'a>(document: &'a Document, agent: &'a str) -> Result<&'a str> {
    let key = key_for_kind(if agent == "default" {
        &document.default_agent
    } else {
        agent
    });
    ensure!(valid_key(key), "Invalid Agent key");
    Ok(key)
}

/// Resolve a normalized launch configuration to an executable and its arguments.
/// Use [normalize] before resolving a configuration read from external input.
pub fn resolve_document(
    document: &Document,
    agent: &str,
    scheme_id: Option<&str>,
) -> Result<Launch> {
    ensure!(
        document.schema_version == 2 && document.instructions.is_empty(),
        "Normalize the Agent launch configuration before resolving a scheme"
    );
    let key = agent_key(document, agent)?;
    let requested = scheme_id.filter(|id| !id.is_empty());
    let defaults = defaults::instructions();
    let instruction = if let Some(schemes) = document.schemes.get(key) {
        let selected = requested.unwrap_or(&schemes.default_id);
        &schemes
            .items
            .iter()
            .find(|scheme| scheme.id == selected)
            .context("Selected Agent launch scheme is no longer available; choose another scheme")?
            .instruction
    } else {
        ensure!(
            requested.map_or(true, |id| id == "default"),
            "Selected Agent launch scheme is no longer available; choose another scheme"
        );
        defaults.get(key).map(String::as_str).unwrap_or(key)
    };
    let (mut program, arguments) = parse(instruction)?;
    if let Some(suffix) = program.strip_prefix("~/") {
        program = dirs::home_dir()
            .context("Cannot resolve home directory")?
            .join(suffix)
            .to_string_lossy()
            .into();
    }
    Ok(Launch {
        key: key.into(),
        kind: kind_for_key(key).map(str::to_string),
        program,
        arguments,
    })
}

/// Detect changes between a managed runner's resolve and start calls.
pub fn plan_fingerprint(launch: &Launch) -> Result<String> {
    Ok(hex::encode(Sha256::digest(serde_json::to_vec(launch)?)))
}

pub fn verify_plan(launch: &Launch, expected: Option<&str>) -> Result<()> {
    if let Some(expected) = expected {
        ensure!(
            plan_fingerprint(launch)? == expected,
            "Agent launch scheme changed before startup; retry with the current settings"
        );
    }
    Ok(())
}
