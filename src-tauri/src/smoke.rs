//! Package checks use a disposable database and never initialize the user's library.
use crate::core::skill_store::SkillStore;

pub fn run_package_smoke() -> anyhow::Result<()> {
    let directory = tempfile::tempdir()?;
    let database = directory.path().join("smoke.sqlite3");
    let store = SkillStore::new(&database)?;
    store.set_setting("theme", "dark")?;
    drop(store);
    let reopened = SkillStore::new(&database)?;
    anyhow::ensure!(reopened.get_setting("theme")?.as_deref() == Some("dark"));
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn package_smoke_reopens_an_isolated_database() {
        super::run_package_smoke().unwrap();
    }
}
