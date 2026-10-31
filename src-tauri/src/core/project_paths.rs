use anyhow::{bail, Result};
use std::path::PathBuf;

/// Resolve only a registered project; never accept a caller-supplied cwd at IPC.
pub fn project_directory(
    store: &crate::core::skill_store::SkillStore,
    project_id: &str,
) -> Result<PathBuf> {
    let project = store
        .get_project_by_id(project_id)?
        .ok_or_else(|| anyhow::anyhow!("Project is no longer registered"))?;
    let directory = std::path::Path::new(&project.path).canonicalize()?;
    if !directory.is_dir() {
        bail!("Project directory is unavailable");
    }
    Ok(directory)
}
