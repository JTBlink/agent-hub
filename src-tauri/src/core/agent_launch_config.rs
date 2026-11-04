//! Portable Agent launch preferences, independent of UI, scheduling and Git transport.
use super::{auto_backup, repo_lock::RepoLock, user_config};
use anyhow::{bail, ensure, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::Path,
};
mod defaults;
pub use defaults::{key_for_kind, kind_for_key};
#[cfg(test)]
mod tests;

const FILE: &str = "agent-launch.json";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Document {
    pub schema_version: u32,
    pub default_agent: String,
    pub instructions: BTreeMap<String, String>,
}
impl Default for Document {
    fn default() -> Self {
        Self {
            schema_version: 1,
            default_agent: "codex".into(),
            instructions: BTreeMap::new(),
        }
    }
}
#[derive(Serialize)]
pub struct Snapshot {
    pub document: Document,
    pub revision: String,
    pub defaults: BTreeMap<String, String>,
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
fn validate(document: &Document) -> Result<()> {
    ensure!(
        document.schema_version == 1,
        "Unsupported Agent launch configuration version"
    );
    ensure!(
        valid_key(&document.default_agent),
        "Invalid default Agent key"
    );
    ensure!(
        document.instructions.len() <= 512,
        "Too many Agent launch preferences"
    );
    for (key, instruction) in &document.instructions {
        ensure!(valid_key(key), "Invalid Agent key");
        parse(instruction)?;
    }
    Ok(())
}
fn read(root: &Path) -> Result<(Document, String)> {
    let path = root.join(FILE);
    let mut bytes = Vec::new();
    let mut exists = true;
    match fs::File::open(path) {
        Ok(file) => {
            file.take(1024 * 1024 + 1).read_to_end(&mut bytes)?;
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            exists = false;
        }
        Err(e) => return Err(e.into()),
    }
    ensure!(
        bytes.len() <= 1024 * 1024,
        "Agent launch configuration is too large"
    );
    let document = if !exists {
        Document::default()
    } else {
        serde_json::from_slice(&bytes).context("Invalid Agent launch configuration")?
    };
    validate(&document)?;
    Ok((document, hex::encode(Sha256::digest(&bytes))))
}
/// Validate restored configuration before the backup transaction publishes any files.
/// Caller validates the containing tree's symlink and size boundaries first.
pub(crate) fn validate_at(root: &Path) -> Result<()> {
    read(root).map(|_| ())
}
fn load_unlocked() -> Result<Snapshot> {
    super::backup_workspace::recover_for_user_config()?;
    let root = user_config::root();
    user_config::checked(&root.join(FILE)).map_err(anyhow::Error::msg)?;
    let (document, revision) = read(&root)?;
    Ok(Snapshot {
        document,
        revision,
        defaults: defaults::instructions(),
    })
}
pub fn load() -> Result<Snapshot> {
    let _lock = RepoLock::acquire_foreground("read Agent launch settings")?;
    load_unlocked()
}
/// Compare-and-replace; drafts from another window or a prior restore cannot overwrite edits.
pub fn save(document: Document, expected_revision: &str) -> Result<Snapshot> {
    validate(&document)?;
    let _lock = RepoLock::acquire_foreground("save Agent launch settings")?;
    let current = load_unlocked()?;
    ensure!(
        current.revision == expected_revision,
        "Agent launch settings changed; reload before saving. Your draft is preserved."
    );
    let root = user_config::ensure_root().map_err(anyhow::Error::msg)?;
    let path = root.join(FILE);
    let bytes = serde_json::to_vec_pretty(&document)?;
    ensure!(
        bytes.len() <= 1024 * 1024,
        "Agent launch configuration is too large"
    );
    user_config::check_file(&path, bytes.len()).map_err(anyhow::Error::msg)?;
    let mut staged = tempfile::NamedTempFile::new_in(&root)?;
    staged.write_all(&bytes)?;
    staged.as_file().sync_all()?;
    user_config::checked(&path).map_err(anyhow::Error::msg)?;
    if read(&root)?.1 != expected_revision {
        bail!("Agent launch settings changed while saving; draft preserved")
    }
    staged.persist(&path).map_err(|e| e.error)?;
    auto_backup::notify_central_change();
    load_unlocked()
}
pub fn resolve(agent: &str) -> Result<Launch> {
    let snapshot = load()?;
    let key = key_for_kind(if agent == "default" {
        &snapshot.document.default_agent
    } else {
        agent
    });
    ensure!(valid_key(key), "Invalid Agent key");
    let instruction = snapshot
        .document
        .instructions
        .get(key)
        .or_else(|| snapshot.defaults.get(key))
        .map(String::as_str)
        .unwrap_or(key);
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
