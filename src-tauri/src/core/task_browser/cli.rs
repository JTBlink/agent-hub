use super::{Binding, CliReader, TaskFailure};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};

pub struct SystemCli {
    pub cwd: PathBuf,
}
impl CliReader for SystemCli {
    fn identity_scope(&self, binding: &Binding) -> Option<String> {
        // Project launchers can choose accounts by cwd; standard CLIs share their global login.
        let scope = serde_json::to_vec(&(
            binding.provider,
            binding.host.to_ascii_lowercase(),
            &binding.launcher,
            binding.launcher.as_ref().map(|_| &self.cwd),
        ))
        .ok()?;
        Some(format!("{:x}", Sha256::digest(scope)))
    }

    fn read(
        &self,
        binding: &Binding,
        args: &[String],
        cancel: &AtomicBool,
    ) -> std::result::Result<Value, TaskFailure> {
        if cancel.load(Ordering::Acquire) {
            return Err(TaskFailure::new("cancelled", "Query cancelled"));
        }
        let text = crate::core::platforms::cli::PlatformCli {
            provider: binding.provider,
            host: &binding.host,
            launcher: binding.launcher.as_ref(),
            cwd: &self.cwd,
        }
        .run(args, cancel)?;
        serde_json::from_str(&text)
            .map_err(|_| TaskFailure::new("invalid_response", "Platform CLI returned invalid JSON"))
    }
}
