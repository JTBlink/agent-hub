use super::{Binding, CliReader, TaskFailure};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};

pub struct SystemCli {
    pub cwd: PathBuf,
    pub proxy_url: Option<String>,
}
impl CliReader for SystemCli {
    fn identity_scope(&self, binding: &Binding) -> Option<String> {
        // Project launchers can choose accounts by cwd; standard CLIs share their global login.
        #[cfg(feature = "gitlab")]
        let detected = if binding.provider == super::Provider::Gitlab && binding.launcher.is_none()
        {
            crate::core::platforms::gitlab::cli::GlabCli::default()
                .local_launcher()
                .ok()?
        } else {
            None
        };
        #[cfg(not(feature = "gitlab"))]
        let detected: Option<super::CliLauncher> = None;
        let scope = serde_json::to_vec(&(
            binding.provider,
            binding.host.to_ascii_lowercase(),
            &binding.launcher,
            detected,
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
            proxy_url: self.proxy_url.as_deref(),
        }
        .run(args, cancel)?;
        // GitLab returns HTTP 204 with an empty body after deleting a runner.
        if args.get(2).is_some_and(|method| method == "DELETE") && text.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&text)
            .map_err(|_| TaskFailure::new("invalid_response", "Platform CLI returned invalid JSON"))
    }
}
