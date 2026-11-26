//! Shared scheme edits used by CLI; persistence retains the normal revision guard.
use super::*;
use agent_hub_core::agent_launch::agent_key;

pub enum SchemeEdit {
    Add {
        id: String,
        name: String,
        instruction: String,
        default: bool,
    },
    Update {
        id: String,
        name: Option<String>,
        instruction: Option<String>,
    },
    Delete {
        id: String,
        replacement: Option<String>,
    },
    SetDefault {
        id: String,
    },
}

pub fn effective_schemes(snapshot: &Snapshot, agent: &str) -> Result<(String, AgentSchemes)> {
    let key = agent_key(&snapshot.document, agent)?;
    let schemes = snapshot
        .document
        .schemes
        .get(key)
        .cloned()
        .unwrap_or_else(|| AgentSchemes {
            default_id: "default".into(),
            items: vec![LaunchScheme {
                id: "default".into(),
                name: "全自动".into(),
                instruction: snapshot
                    .defaults
                    .get(key)
                    .cloned()
                    .unwrap_or_else(|| key.into()),
            }],
        });
    Ok((key.into(), schemes))
}

pub fn edit_schemes(agent: &str, change: SchemeEdit) -> Result<Snapshot> {
    let snapshot = load()?;
    let (key, mut schemes) = effective_schemes(&snapshot, agent)?;
    apply(&mut schemes, change)?;
    let mut document = snapshot.document;
    document.schemes.insert(key, schemes);
    save(document, &snapshot.revision)
}

fn apply(schemes: &mut AgentSchemes, change: SchemeEdit) -> Result<()> {
    match change {
        SchemeEdit::Add {
            id,
            name,
            instruction,
            default,
        } => {
            ensure!(
                !schemes.items.iter().any(|item| item.id == id),
                "Launch scheme ID already exists"
            );
            if default {
                schemes.default_id = id.clone();
            }
            schemes.items.push(LaunchScheme {
                id,
                name,
                instruction,
            });
        }
        SchemeEdit::Update {
            id,
            name,
            instruction,
        } => {
            ensure!(
                name.is_some() || instruction.is_some(),
                "Specify --name or --instruction"
            );
            let item = schemes
                .items
                .iter_mut()
                .find(|item| item.id == id)
                .context("Launch scheme does not exist")?;
            if let Some(name) = name {
                item.name = name;
            }
            if let Some(instruction) = instruction {
                item.instruction = instruction;
            }
        }
        SchemeEdit::Delete { id, replacement } => {
            ensure!(
                schemes.items.iter().any(|item| item.id == id),
                "Launch scheme does not exist"
            );
            ensure!(schemes.items.len() > 1, "Keep at least one launch scheme");
            if schemes.default_id == id {
                let replacement =
                    replacement.context("Deleting the default scheme requires --replacement")?;
                ensure!(
                    replacement != id && schemes.items.iter().any(|item| item.id == replacement),
                    "Replacement scheme does not exist"
                );
                schemes.default_id = replacement;
            } else {
                ensure!(
                    replacement.is_none(),
                    "--replacement applies only when deleting the default scheme"
                );
            }
            schemes.items.retain(|item| item.id != id);
        }
        SchemeEdit::SetDefault { id } => {
            ensure!(
                schemes.items.iter().any(|item| item.id == id),
                "Launch scheme does not exist"
            );
            schemes.default_id = id;
        }
    }
    Ok(())
}

pub fn set_default_agent(agent: &str) -> Result<Snapshot> {
    let snapshot = load()?;
    let mut document = snapshot.document;
    document.default_agent = key_for_kind(agent).into();
    save(document, &snapshot.revision)
}
