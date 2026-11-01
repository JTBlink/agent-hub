use super::{Binding, CliReader, Provider, TaskFailure};
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
        let default = match binding.provider {
            Provider::Github => "gh",
            Provider::Gitlab => "glab",
        };
        let configured = binding.launcher.as_ref();
        let name = configured
            .map(|launcher| launcher.program.as_str())
            .unwrap_or(default);
        let path = if std::path::Path::new(name).is_absolute() {
            let path = PathBuf::from(name);
            crate::core::tool_detection::executable(&path).then_some(path)
        } else {
            crate::core::tool_detection::find_command(name)
        }
        .ok_or_else(|| {
            TaskFailure::new(
                "missing_cli",
                format!("CLI launcher is unavailable: {name}"),
            )
        })?;
        let mut command_args = configured
            .map(|launcher| launcher.args.clone())
            .unwrap_or_default();
        command_args.extend_from_slice(args);
        let arguments: Vec<_> = command_args.iter().map(String::as_str).collect();
        let text = crate::core::cli_process::run(
            &path.to_string_lossy(),
            &arguments,
            &[
                ("GH_PROMPT_DISABLED", "1"),
                ("GITLAB_HOST", &binding.host),
                ("GLAB_CHECK_UPDATE", "false"),
            ],
            20,
            Some(&self.cwd),
            Some(cancel),
        )
        .map_err(TaskFailure::cli)?;
        serde_json::from_str(&text)
            .map_err(|_| TaskFailure::new("invalid_response", "Platform CLI returned invalid JSON"))
    }
}
