use super::{parse, valid_key, Document};
use anyhow::{ensure, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LaunchScheme {
    pub id: String,
    pub name: String,
    pub instruction: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentSchemes {
    pub default_id: String,
    pub items: Vec<LaunchScheme>,
}

/// Upgrade legacy single instructions in memory. Saving publishes one v2 authority.
pub(super) fn normalize(mut document: Document) -> Result<Document> {
    ensure!(
        [1, 2].contains(&document.schema_version),
        "Unsupported Agent launch configuration version"
    );
    for (key, instruction) in std::mem::take(&mut document.instructions) {
        ensure!(
            !document.schemes.contains_key(&key),
            "Agent launch settings contain conflicting legacy and scheme definitions"
        );
        document.schemes.insert(
            key,
            AgentSchemes {
                default_id: "default".into(),
                items: vec![LaunchScheme {
                    id: "default".into(),
                    name: "默认".into(),
                    instruction,
                }],
            },
        );
    }
    document.schema_version = 2;
    validate(&document)?;
    Ok(document)
}

pub(super) fn validate(document: &Document) -> Result<()> {
    ensure!(
        document.schema_version == 2,
        "Unsupported Agent launch configuration version"
    );
    ensure!(
        valid_key(&document.default_agent),
        "Invalid default Agent key"
    );
    ensure!(
        document.schemes.len() <= 512,
        "Too many Agent launch preferences"
    );
    for (key, schemes) in &document.schemes {
        ensure!(valid_key(key), "Invalid Agent key");
        ensure!(
            !schemes.items.is_empty() && schemes.items.len() <= 32,
            "Each Agent must have 1–32 launch schemes"
        );
        let mut ids = HashSet::new();
        let mut names = HashSet::new();
        for scheme in &schemes.items {
            ensure!(
                valid_key(&scheme.id) && ids.insert(&scheme.id),
                "Invalid or duplicate launch scheme ID"
            );
            ensure!(
                !scheme.name.trim().is_empty()
                    && scheme.name == scheme.name.trim()
                    && scheme.name.chars().count() <= 200
                    && !scheme.name.chars().any(char::is_control)
                    && names.insert(&scheme.name),
                "Launch scheme names must be unique, nonempty and at most 200 characters"
            );
            parse(&scheme.instruction)?;
        }
        ensure!(
            ids.contains(&schemes.default_id),
            "Default Agent launch scheme is unavailable"
        );
    }
    Ok(())
}
