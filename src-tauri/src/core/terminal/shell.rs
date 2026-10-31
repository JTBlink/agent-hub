use anyhow::{bail, Result};
use portable_pty::CommandBuilder;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Prompt markers are shell integration, never Agent activity inference.
pub struct ShellIntegration {
    _files: Option<tempfile::TempDir>,
    nonce: String,
    kind: String,
}
#[derive(Clone, Default, Serialize)]
pub struct LaunchState {
    pub ready: bool,
    pub revision: u64,
    pub herdr_active: bool,
}
pub(super) struct ShellState {
    pub state: LaunchState,
    tail: Vec<u8>,
    awaiting_prompt: bool,
    pub integration: Option<ShellIntegration>,
}
impl Default for ShellState {
    fn default() -> Self {
        Self {
            state: LaunchState::default(),
            tail: Vec::new(),
            integration: None,
            awaiting_prompt: true,
        }
    }
}
impl ShellState {
    pub fn input(&mut self, bytes: &[u8], foreground_program: bool) {
        self.state.revision += 1;
        self.state.ready = false;
        if !foreground_program {
            for byte in bytes {
                self.awaiting_prompt = matches!(byte, b'\r' | b'\n' | 3);
            }
        }
    }

    pub fn new(integration: Option<ShellIntegration>) -> Self {
        Self {
            integration,
            ..Default::default()
        }
    }
    pub fn observe(&mut self, data: &[u8]) {
        let Some(integration) = &self.integration else {
            return;
        };
        let ready = format!("\x1b]633;AH;{};R\x07", integration.nonce).into_bytes();
        let busy = format!("\x1b]633;AH;{};B\x07", integration.nonce).into_bytes();
        self.tail.extend_from_slice(data);
        let r = self
            .tail
            .windows(ready.len())
            .rposition(|value| value == ready);
        let b = self
            .tail
            .windows(busy.len())
            .rposition(|value| value == busy);
        if let Some(r) = r {
            if b.map_or(true, |b| r > b) {
                self.state.ready = self.awaiting_prompt;
                self.awaiting_prompt = false;
                self.state.herdr_active = false;
            }
        }
        if let Some(b) = b {
            if r.map_or(true, |r| b > r) {
                self.state.ready = false;
            }
        }
        let keep = ready.len().max(busy.len()) - 1;
        if self.tail.len() > keep {
            self.tail.drain(..self.tail.len() - keep);
        }
    }
    pub fn command(&self, executable: &Path) -> Result<String> {
        let integration = self.integration.as_ref().ok_or_else(|| {
            anyhow::anyhow!("Shell readiness cannot be verified; open a supported empty Shell")
        })?;
        let path = executable
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("Executable path is not valid Unicode"))?;
        if path.contains(['\r', '\n', '\0']) {
            bail!("Invalid executable path");
        }
        match integration.kind.as_str() {
            "cmd" => {
                if path.contains(['%', '!', '"']) {
                    bail!("Use a Shell supporting this executable path");
                }
                Ok(format!("\"{path}\"\r"))
            }
            _ => Ok(format!("{}\r", quote(path))),
        }
    }
}
fn quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "'\\''"))
}
fn source(path: &Path) -> String {
    format!(
        "if [ -r {0} ]; then . {0}; fi\n",
        quote(&path.to_string_lossy())
    )
}

/// Prepare prompt integration without modifying the user's startup files.
/// Unknown Shells remain usable; automatic program injection stays disabled.
pub fn prepare_shell(
    program: Option<&Path>,
    startup_directory: Option<&Path>,
) -> Result<(CommandBuilder, ShellIntegration)> {
    #[cfg(windows)]
    let default = std::env::var_os("COMSPEC").unwrap_or_else(|| "cmd.exe".into());
    #[cfg(not(windows))]
    let default = std::env::var_os("SHELL").unwrap_or_else(|| "/bin/sh".into());
    let program = program.map(PathBuf::from).unwrap_or_else(|| default.into());
    let kind = program
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let marker = format!("\\033]633;AH;{nonce};R\\007");
    let busy = format!("\\033]633;AH;{nonce};B\\007");
    let mut command = CommandBuilder::new(&program);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    // A nested launch must not inherit a different Herdr pane's caller identity.
    for name in [
        "HERDR_ENV",
        "HERDR_PANE_ID",
        "HERDR_TAB_ID",
        "HERDR_WORKSPACE_ID",
    ] {
        command.env_remove(name);
    }
    let mut files = None;
    match kind.as_str() {
        "zsh" => {
            let directory = tempfile::tempdir()?;
            let original = startup_directory
                .map(PathBuf::from)
                .or_else(|| std::env::var_os("ZDOTDIR").map(PathBuf::from))
                .or_else(dirs::home_dir)
                .ok_or_else(|| anyhow::anyhow!("Cannot resolve Shell startup directory"))?;
            /* original user configuration, independent of the temporary integration directory */
            let setup = directory.path();
            std::fs::write(
                setup.join(".zshenv"),
                format!(
                    "{}\nZDOTDIR={}\n",
                    source(&original.join(".zshenv")),
                    quote(&setup.to_string_lossy())
                ),
            )?;
            std::fs::write(setup.join(".zshrc"), format!("ZDOTDIR={}\n{}\nautoload -Uz add-zsh-hook\n_agent_hub_ready() {{ printf '{marker}'; }}\n_agent_hub_busy() {{ printf '{busy}'; }}\nadd-zsh-hook precmd _agent_hub_ready\nadd-zsh-hook preexec _agent_hub_busy\n", quote(&original.to_string_lossy()), source(&original.join(".zshrc"))))?;
            command.env("ZDOTDIR", setup);
            command.arg("-i");
            files = Some(directory);
        }
        "bash" => {
            let directory = tempfile::tempdir()?;
            let rc = directory.path().join("bashrc");
            let user_rc = startup_directory
                .map(PathBuf::from)
                .or_else(dirs::home_dir)
                .map(|home| source(&home.join(".bashrc")))
                .unwrap_or_default();
            // PROMPT_COMMAND runs only on prompt entry. PS1 is also printed on
            // readline redraw (e.g. Ctrl+L), when an unfinished draft may exist.
            std::fs::write(&rc, format!("{user_rc}\n_agent_hub_prompt() {{ printf '{marker}'; }}\nif [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == 'declare -a '* ]]; then\n  PROMPT_COMMAND+=(_agent_hub_prompt)\nelse\n  PROMPT_COMMAND=\"${{PROMPT_COMMAND}}\"$'\\n''_agent_hub_prompt'\nfi\n"))?;
            command.arg("--rcfile");
            command.arg(rc);
            command.arg("-i");
            files = Some(directory);
        }
        "cmd" => {
            command.env("PROMPT", format!("\x1b]633;AH;{nonce};R\x07$P$G"));
        }
        _ => {
            #[cfg(not(windows))]
            command.arg("-i");
        }
    }
    Ok((
        command,
        ShellIntegration {
            _files: files,
            nonce,
            kind,
        },
    ))
}
