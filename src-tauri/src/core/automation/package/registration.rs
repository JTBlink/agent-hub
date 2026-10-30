//! The lifecycle's scheduler seam: platform and Hermes adapters share one contract.
use super::super::{hermes_manage, native, Provider};
use super::*;

pub(super) trait Registration {
    fn apply(
        &mut self,
        state: &Path,
        record: &mut ManagedAutomation,
        enabled: bool,
    ) -> Result<(), String>;
    fn remove(&mut self, state: &Path, record: &ManagedAutomation) -> Result<(), String>;
}

struct Native;
struct Hermes;

pub(super) fn adapter(provider: Provider) -> Box<dyn Registration> {
    match provider {
        Provider::System => Box::new(Native),
        Provider::Hermes => Box::new(Hermes),
    }
}

impl Registration for Native {
    fn apply(
        &mut self,
        state: &Path,
        record: &mut ManagedAutomation,
        enabled: bool,
    ) -> Result<(), String> {
        let mut configured = record.clone();
        configured.draft.enabled = enabled;
        native::apply(state, &configured)
    }
    fn remove(&mut self, state: &Path, record: &ManagedAutomation) -> Result<(), String> {
        native::remove(state, record)
    }
}

impl Registration for Hermes {
    fn apply(
        &mut self,
        state: &Path,
        record: &mut ManagedAutomation,
        enabled: bool,
    ) -> Result<(), String> {
        let mut configured = record.draft.clone();
        configured.enabled = enabled;
        let extra = super::hermes_bridge::prepare(state, record)?;
        let root = hermes_manage::root_for(&task(record))?;
        if !root.is_absolute() {
            return Err("Hermes profile must be an absolute directory".into());
        }
        if !record.identifier.is_empty()
            && super::super::hermes::at(&root)?
                .iter()
                .all(|task| task.identifier.as_deref() != Some(record.identifier.as_str()))
        {
            record.identifier.clear();
        }
        if record.identifier.is_empty() {
            let marker = directory(record)
                .ok_or("Missing task package")?
                .join(".local/hermes-create-pending");
            if marker.exists() {
                return Err("Previous Hermes creation has an unknown result; inspect Hermes and uninstall this package before retrying".into());
            }
            store::write(&marker, b"creation requested")?;
            let (identifier, location) = hermes_manage::create_at(&root, &configured, &extra)?;
            record.identifier = identifier;
            record.location = location;
        } else {
            hermes_manage::action_at(&root, "pause", &record.identifier)?;
            if super::super::hermes::at(&root)?.iter().any(|job| {
                job.identifier.as_deref() == Some(record.identifier.as_str())
                    && job.status == "running"
            }) {
                return Err("Wait for the current Hermes run before changing installation".into());
            }
            let registered = super::super::hermes::at(&root)?
                .into_iter()
                .find(|job| job.identifier.as_deref() == Some(record.identifier.as_str()))
                .ok_or("Hermes registration changed; refresh before retrying")?;
            hermes_manage::edit_options(&registered, &configured, &extra)?;
            hermes_manage::action_at(
                &root,
                if enabled { "resume" } else { "pause" },
                &record.identifier,
            )?;
        }
        Ok(())
    }
    fn remove(&mut self, _: &Path, record: &ManagedAutomation) -> Result<(), String> {
        if record.identifier.is_empty() {
            return Ok(());
        }
        // Missing jobs are an idempotent success only after a successful read
        // of the exact profile, never after a failed CLI request.
        let task = task(record);
        let root = hermes_manage::root_for(&task)?;
        if super::super::hermes::at(&root)?
            .iter()
            .all(|task| task.identifier.as_deref() != Some(record.identifier.as_str()))
        {
            return Ok(());
        }
        hermes_manage::action_at(&root, "pause", &record.identifier)?;
        if super::super::hermes::at(&root)?.iter().any(|job| {
            job.identifier.as_deref() == Some(record.identifier.as_str()) && job.status == "running"
        }) {
            return Err(
                "Hermes is still running; its files and dependencies were preserved".into(),
            );
        }
        hermes_manage::action_at(&root, "remove", &record.identifier)
    }
}

pub(super) fn task(record: &ManagedAutomation) -> super::super::AutomationTask {
    let mut task = super::super::AutomationTask::new(
        record.id.clone(),
        record.draft.name.clone(),
        "hermes",
        record.location.clone(),
    );
    task.identifier = Some(record.identifier.clone());
    task
}
