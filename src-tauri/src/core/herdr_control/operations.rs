use super::*;

impl HerdrControl {
    pub(super) fn verify<'a>(
        &self,
        snapshot: &'a Snapshot,
        target: &Target,
        agent: bool,
    ) -> Result<&'a Pane> {
        let pane = if agent {
            snapshot.agents.iter()
        } else {
            snapshot.panes.iter()
        }
        .find(|p| {
            p.pane_id == target.pane_id
                && p.workspace_id == target.workspace_id
                && p.terminal_id == target.terminal_id
        })
        .context("Herdr target was closed or replaced; refresh before retrying")?;
        if agent
            && (pane.agent_session != target.agent_session
                || (target.agent_session.is_none() && pane.revision != target.revision))
        {
            bail!("Agent identity changed; refresh before retrying")
        }
        Ok(pane)
    }
    fn foreground(&self, target: &Target, agent: &Pane) -> Result<()> {
        let info = self.call(
            Some(&target.session),
            &["pane", "process-info", "--pane", &target.pane_id],
            5,
        )?;
        let info = info
            .get("process_info")
            .context("Cannot verify the foreground Agent")?;
        if info["shell_pid"].is_number() && info["shell_pid"] == info["foreground_process_group_id"]
        {
            bail!("The Agent is not in the foreground; open its terminal first")
        }
        let kind = agent
            .agent
            .as_deref()
            .context("Agent kind is unavailable")?
            .to_ascii_lowercase();
        let matches = info["foreground_processes"].as_array().is_some_and(|ps| {
            ps.iter().any(|p| {
                let basename = |name: &str| {
                    Path::new(name)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_ascii_lowercase()
                };
                let executable = |name: &str| {
                    name == kind
                        || name == format!("{kind}.exe")
                        || (kind == "cursor" && name == "cursor-agent")
                        || (kind == "agy" && name == "antigravity")
                };
                if executable(&basename(p["name"].as_str().unwrap_or(""))) {
                    return true;
                }
                let name = basename(p["name"].as_str().unwrap_or(""));
                // A script argument identifies an executable only for a known interpreter.
                if !["node", "node.exe", "bun", "python", "python3", "python.exe"]
                    .contains(&name.as_str())
                {
                    return false;
                }
                p["argv"]
                    .as_array()
                    .and_then(|argv| argv.get(1))
                    .and_then(Value::as_str)
                    .map(basename)
                    .is_some_and(|script| {
                        [
                            format!("{kind}.js"),
                            format!("{kind}.mjs"),
                            format!("{kind}.py"),
                        ]
                        .contains(&script)
                    })
            })
        });
        if !matches {
            bail!("Cannot verify that this Agent owns the foreground; inspect its terminal before sending input")
        }
        Ok(())
    }
    pub fn action(
        &self,
        target: &Target,
        action: Action,
        text: Option<&str>,
    ) -> Result<ActionResult> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        self.action_locked(target, action, text)
    }
    fn action_locked(
        &self,
        target: &Target,
        action: Action,
        text: Option<&str>,
    ) -> Result<ActionResult> {
        let snapshot = self.snapshot(&target.session)?;
        let pane = self.verify(
            &snapshot,
            target,
            matches!(action, Action::Prompt | Action::Interrupt),
        )?;
        let mut output = None;
        let mut next = None;
        match action {
            Action::Read => {
                output = Some(self.text(
                    Some(&target.session),
                    &[
                        "pane",
                        "read",
                        &target.pane_id,
                        "--source",
                        "visible",
                        "--lines",
                        "120",
                    ],
                    8,
                )?)
            }
            Action::Prompt => {
                if !["idle", "done"].contains(&pane.agent_status.as_str()) {
                    bail!("Agent is not ready for a task; inspect its terminal")
                }
                let text = text
                    .filter(|t| !t.trim().is_empty() && t.len() <= 32 * 1024)
                    .context("Enter a task of up to 32 KiB")?;
                self.foreground(target, pane)?;
                self.call(
                    Some(&target.session),
                    &["agent", "prompt", &target.pane_id, "--", text],
                    10,
                )?;
            }
            Action::Interrupt => {
                if pane.agent_status != "working" {
                    bail!("Agent is no longer working; refresh its state")
                }
                self.foreground(target, pane)?;
                self.call(
                    Some(&target.session),
                    &["agent", "send-keys", &target.pane_id, "ctrl+c"],
                    5,
                )?;
            }
            Action::Zoom => {
                self.call(
                    Some(&target.session),
                    &["pane", "zoom", &target.pane_id, "--toggle"],
                    5,
                )?;
            }
            Action::NewTab | Action::SplitRight | Action::SplitDown => {
                let cwd = checked_directory(
                    pane.cwd
                        .as_deref()
                        .context("Pane directory is unavailable")?,
                )?;
                let cwd = cwd.to_str().context("Pane directory must be Unicode")?;
                let value = if matches!(action, Action::NewTab) {
                    self.call(
                        Some(&target.session),
                        &[
                            "tab",
                            "create",
                            "--workspace",
                            &target.workspace_id,
                            "--cwd",
                            cwd,
                            "--no-focus",
                        ],
                        10,
                    )?
                } else {
                    self.call(
                        Some(&target.session),
                        &[
                            "pane",
                            "split",
                            &target.pane_id,
                            "--direction",
                            if matches!(action, Action::SplitDown) {
                                "down"
                            } else {
                                "right"
                            },
                            "--cwd",
                            cwd,
                            "--no-focus",
                        ],
                        10,
                    )?
                };
                let p = value
                    .get("root_pane")
                    .or_else(|| value.get("pane"))
                    .context("Herdr did not return the new pane")?;
                next = Some(Target::from_pane(
                    &target.session,
                    &serde_json::from_value(p.clone())?,
                ));
            }
        }
        Ok(ActionResult {
            output,
            target: next,
        })
    }
    pub fn start_agent(&self, target: &Target, input: NewAgent) -> Result<StartedAgent> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        if input.name.is_empty()
            || input.name.len() > 32
            || !input.name.starts_with(|c: char| c.is_ascii_lowercase())
            || !input
                .name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
        {
            bail!("Agent name must be unique and use 1–32 lowercase letters, digits, underscores or hyphens")
        }
        if !["right", "down"].contains(&input.direction.as_str()) {
            bail!("Choose a split direction")
        }
        if input.kind.is_empty()
            || !input
                .kind
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        {
            bail!("Invalid Agent kind")
        }
        if crate::core::tool_detection::find_command(&input.kind).is_none() {
            bail!("Selected Agent CLI is not installed")
        }
        if input.prompt.len() > 32 * 1024 {
            bail!("Initial task exceeds 32 KiB")
        }
        let snapshot = self.snapshot(&target.session)?;
        self.verify(&snapshot, target, false)?;
        if snapshot
            .agents
            .iter()
            .any(|a| a.name.as_deref() == Some(input.name.as_str()))
        {
            bail!("Agent name is already in use")
        }
        let split = if input.direction == "down" {
            Action::SplitDown
        } else {
            Action::SplitRight
        };
        let pane = self
            .action_locked(target, split, None)?
            .target
            .context("New Shell pane is unavailable")?;
        if let Err(error) = self.call(
            Some(&target.session),
            &[
                "agent",
                "start",
                &input.name,
                "--kind",
                &input.kind,
                "--pane",
                &pane.pane_id,
            ],
            40,
        ) {
            return Ok(StartedAgent { target: pane, warning: Some(format!("{error}; the created pane was preserved. Inspect its terminal before starting or sending again")) });
        }
        let ready = (|| -> Result<Target> {
            let snapshot = self.snapshot(&target.session)?;
            let current = snapshot
                .agents
                .iter()
                .find(|p| {
                    p.pane_id == pane.pane_id
                        && p.terminal_id == pane.terminal_id
                        && p.name.as_deref() == Some(input.name.as_str())
                        && p.agent.as_deref() == Some(input.kind.as_str())
                })
                .context("Created Agent identity cannot be verified")?;
            Ok(Target::from_pane(&target.session, current))
        })();
        let current = match ready {
            Ok(current) => current,
            Err(error) => {
                return Ok(StartedAgent {
                    target: pane,
                    warning: Some(format!(
                    "{error}; Agent startup was submitted. Inspect its terminal before retrying"
                )),
                })
            }
        };
        if !input.prompt.trim().is_empty() {
            if let Err(error) = self.action_locked(&current, Action::Prompt, Some(&input.prompt)) {
                return Ok(StartedAgent { target:current, warning:Some(format!("{error}; Agent was created, but initial task delivery is uncertain. Inspect output before sending again")) });
            }
        }
        Ok(StartedAgent {
            target: current,
            warning: None,
        })
    }
}
