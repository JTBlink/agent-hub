//! Persistent and temporary browser profile management.
use super::{
    super::error::AppError,
    browser::Browsers,
    runtime::{self, BrowserProfile},
};
use std::fs;
impl Browsers {
    pub fn profiles(&self) -> Result<Vec<BrowserProfile>, AppError> {
        let path = self.root.join("profiles.json");
        if !path.exists() {
            return Ok(vec![BrowserProfile::default(), BrowserProfile::guest()]);
        }
        let bytes = fs::read(path)?;
        if bytes.len() > 128 * 1024 {
            return Err(AppError::invalid_input(
                "Profile configuration exceeds limit",
            ));
        }
        let mut profiles: Vec<BrowserProfile> =
            serde_json::from_slice(&bytes).map_err(AppError::io)?;
        if profiles
            .iter()
            .filter(|profile| !matches!(profile.id.as_str(), "default" | "guest"))
            .count()
            > 20
        {
            return Err(AppError::invalid_input("Profile limit reached"));
        }
        let mut seen = std::collections::HashSet::new();
        for profile in &mut profiles {
            runtime::validate_profile(profile)?;
            if !seen.insert(profile.id.to_ascii_lowercase()) {
                return Err(AppError::invalid_input("Duplicate browser profile"));
            }
            if profile.id == "guest" {
                profile.ephemeral = true;
            }
        }
        if !seen.contains("default") {
            profiles.insert(0, BrowserProfile::default());
        }
        if !seen.contains("guest") {
            profiles.push(BrowserProfile::guest());
        }
        Ok(profiles)
    }
    pub fn save_profile(&self, mut profile: BrowserProfile) -> Result<(), AppError> {
        if profile.id == "guest" {
            profile.ephemeral = true;
        }
        runtime::validate_profile(&profile)?;
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        if state
            .transfers
            .iter()
            .any(|(key, job)| key.starts_with(&format!("{}:", profile.id)) && job.active())
        {
            return Err(AppError::invalid_input(
                "Wait for the profile transfer to finish",
            ));
        }
        if state.closing
            || state.reopening_profiles.contains_key(&profile.id)
            || state.runtimes.contains_key(&profile.id)
            || state.pending.values().any(|id| id == &profile.id)
        {
            return Err(AppError::invalid_input(
                "Close the profile's pages and wait for downloads before changing its settings",
            ));
        }
        let mut profiles = self.profiles()?;
        if profiles.iter().any(|existing| {
            existing.id != profile.id && existing.id.eq_ignore_ascii_case(&profile.id)
        }) {
            return Err(AppError::invalid_input(
                "Profile identifiers must be unique regardless of case",
            ));
        }
        if profile.deleting
            || profiles
                .iter()
                .any(|existing| existing.id == profile.id && existing.deleting)
        {
            return Err(AppError::invalid_input(
                "Retry the pending profile deletion before changing its settings",
            ));
        }
        profiles.retain(|existing| existing.id != profile.id);
        if !matches!(profile.id.as_str(), "default" | "guest")
            && profiles
                .iter()
                .filter(|profile| !matches!(profile.id.as_str(), "default" | "guest"))
                .count()
                >= 20
        {
            return Err(AppError::invalid_input("Profile limit reached"));
        }
        profiles.push(profile);
        self.write_profiles(&profiles)
    }

    fn write_profiles(&self, profiles: &[BrowserProfile]) -> Result<(), AppError> {
        fs::create_dir_all(&self.root)?;
        let mut file = tempfile::NamedTempFile::new_in(&self.root)?;
        use std::io::Write;
        let bytes = serde_json::to_vec_pretty(profiles).map_err(AppError::io)?;
        if bytes.len() > 128 * 1024 {
            return Err(AppError::invalid_input(
                "Profile configuration exceeds limit",
            ));
        }
        file.write_all(&bytes)?;
        file.persist(self.root.join("profiles.json"))
            .map_err(|error| AppError::io(error.error))?;
        Ok(())
    }
    pub fn delete_profile(&self, id: &str) -> Result<(), AppError> {
        self.delete_profile_with(id, |path| fs::remove_dir_all(path))
    }
    fn delete_profile_with(
        &self,
        id: &str,
        cleanup: impl FnOnce(&std::path::Path) -> std::io::Result<()>,
    ) -> Result<(), AppError> {
        if matches!(id, "default" | "guest") {
            return Err(AppError::invalid_input(
                "Built-in browser profiles cannot be deleted",
            ));
        }
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        if state
            .transfers
            .iter()
            .any(|(key, job)| key.starts_with(&format!("{id}:")) && job.active())
        {
            return Err(AppError::invalid_input(
                "Wait for the profile transfer to finish",
            ));
        }
        if state.closing
            || state.reopening_profiles.contains_key(id)
            || state.runtimes.contains_key(id)
            || state.pages.values().any(|page| page.profile == id)
            || state.pending.values().any(|profile| profile == id)
        {
            return Err(AppError::invalid_input(
                "Close the profile's pages and wait for downloads before deleting it",
            ));
        }
        let mut profiles = self.profiles()?;
        let Some(index) = profiles.iter().position(|profile| profile.id == id) else {
            return Ok(());
        };
        runtime::validate_profile(&profiles[index])?;
        let parent = self.root.join("profiles");
        let directory = parent.join(id);
        let recovery = parent.join(format!(".deleting-{id}"));
        for path in [&directory, &recovery] {
            match fs::symlink_metadata(path) {
                Ok(metadata) => {
                    if metadata.file_type().is_symlink()
                        || !metadata.is_dir()
                        || parent.canonicalize()? != self.root.canonicalize()?.join("profiles")
                    {
                        return Err(AppError::invalid_input(
                            "Profile data is outside the owned directory",
                        ));
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(AppError::io(error)),
            }
        }
        if recovery.exists() && (!profiles[index].deleting || directory.exists()) {
            return Err(AppError::invalid_input(
                "Profile recovery directory is already occupied",
            ));
        }
        // Record the intent before moving or removing data. A failed cleanup remains visible and retryable.
        if !profiles[index].deleting {
            profiles[index].deleting = true;
            self.write_profiles(&profiles)?;
        }
        if directory.exists() {
            fs::rename(&directory,&recovery).map_err(|error|AppError::io(format!("Profile deletion pending; close applications using its files and retry: {error}")))?;
        }
        if recovery.exists() {
            cleanup(&recovery).map_err(|error|AppError::io(format!("Profile deletion pending; close applications using its files and retry: {error}")))?;
        }
        profiles.remove(index);
        self.write_profiles(&profiles)
    }
}

#[cfg(test)]
#[path = "profiles/tests.rs"]
mod tests;
