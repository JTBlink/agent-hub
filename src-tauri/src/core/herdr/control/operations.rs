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
        self.action_locked(target, action, text, false, None)
    }
    fn action_locked(
        &self,
        target: &Target,
        action: Action,
        text: Option<&str>,
        teams: bool,
        tab_label: Option<&str>,
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
                // Working Agents accept follow-up prompts through Herdr; lifecycle state
                // alone does not mean their input is unavailable.
                if !["idle", "done", "working"].contains(&pane.agent_status.as_str()) {
                    bail!("Agent is not ready for a task; inspect its terminal")
                }
                let text = text
                    .filter(|t| !t.trim().is_empty() && t.len() <= 32 * 1024)
                    .context("Enter a task of up to 32 KiB")?;
                self.foreground(target, pane)?;
                // Herdr takes the prompt as one positional argument, without a `--`
                // separator. A leading newline keeps dash-prefixed feedback positional.
                let positional = if text.starts_with('-') {
                    format!("\n{text}")
                } else {
                    text.to_owned()
                };
                self.call(
                    Some(&target.session),
                    &["agent", "prompt", &target.pane_id, &positional],
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
            Action::Close => {
                self.call(
                    Some(&target.session),
                    &["pane", "close", &target.pane_id],
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
                let cwd = if matches!(action, Action::NewTab) {
                    let workspace = snapshot
                        .workspaces
                        .iter()
                        .find(|workspace| workspace.workspace_id == target.workspace_id)
                        .context("Herdr workspace no longer exists")?;
                    directory_for_pane(workspace, &snapshot.panes, pane)?
                } else {
                    checked_directory(
                        pane.cwd
                            .as_deref()
                            .context("Pane directory is unavailable")?,
                    )?
                };
                let cwd = cwd.to_str().context("Pane directory must be Unicode")?;
                let value = if matches!(action, Action::NewTab) {
                    let label = numbered_tab_label(
                        &snapshot,
                        &target.workspace_id,
                        tab_label.unwrap_or("shell"),
                    )?;
                    let mut args = vec![
                        "tab",
                        "create",
                        "--workspace",
                        &target.workspace_id,
                        "--cwd",
                        cwd,
                        "--focus",
                        "--label",
                        &label,
                    ];
                    if teams {
                        args.extend(["--env", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"]);
                    }
                    self.call(Some(&target.session), &args, 10)?
                } else {
                    let mut args = vec![
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
                    ];
                    if teams {
                        args.extend(["--env", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"]);
                    }
                    self.call(Some(&target.session), &args, 10)?
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
        self.start_agent_with_created(target, input, |_| Ok(()))
    }
    /// Publish the created pane before waiting for the Agent's interactive readiness.
    pub fn start_agent_with_created(
        &self,
        target: &Target,
        input: NewAgent,
        created: impl FnOnce(&Target) -> Result<()>,
    ) -> Result<StartedAgent> {
        let guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
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
        if !["right", "down", "tab"].contains(&input.direction.as_str()) {
            bail!("Choose a new tab or split direction")
        }
        if input.tab_label.as_deref().is_some_and(|label| {
            label.trim().is_empty()
                || label.chars().count() > 80
                || label.chars().any(char::is_control)
        }) {
            bail!("Tab name must contain 1–80 characters without control characters")
        }
        if input.kind.is_empty()
            || !input
                .kind
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        {
            bail!("Invalid Agent kind")
        }
        if input.teams && input.kind != "claude" {
            bail!("Agent Teams requires Claude")
        }
        let launch = crate::core::agent_launch_config::resolve(&input.kind)?;
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
        let split = match input.direction.as_str() {
            "tab" => Action::NewTab,
            "down" => Action::SplitDown,
            _ => Action::SplitRight,
        };
        let pane = self
            .action_locked(target, split, None, input.teams, input.tab_label.as_deref())?
            .target
            .context("New Shell pane is unavailable")?;
        drop(guard);
        if let Err(error) = created(&pane) {
            return Ok(StartedAgent {
                target: pane,
                warning: Some(format!("{error}; the pane was created but Agent startup was not submitted. Inspect its terminal before retrying")),
            });
        }
        if let Err(error) = super::super::agents::start_configured(
            &self.executable,
            &target.session,
            &launch,
            &input.name,
            &pane.pane_id,
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
            if let Err(error) = self.action(&current, Action::Prompt, Some(&input.prompt)) {
                return Ok(StartedAgent { target:current, warning:Some(format!("{error}; Agent was created, but initial task delivery is uncertain. Inspect output before sending again")) });
            }
        }
        Ok(StartedAgent {
            target: current,
            warning: None,
        })
    }
}

fn numbered_tab_label(snapshot: &Snapshot, workspace: &str, label: &str) -> Result<String> {
    fn normalize(label: &str) -> String {
        label
            .split(|c: char| !c.is_alphanumeric())
            .filter(|part| !part.is_empty())
            .map(str::to_lowercase)
            .collect::<Vec<_>>()
            .join("-")
    }
    let base = normalize(label);
    if base.is_empty() {
        bail!("Tab name must contain letters or digits")
    }
    let prefix = format!("{base}-");
    let previous = snapshot
        .tabs
        .iter()
        .filter(|tab| tab.workspace_id == workspace)
        .filter_map(|tab| {
            let label = normalize(&tab.label);
            if label == base {
                Some(1)
            } else {
                label.strip_prefix(&prefix)?.parse::<u64>().ok()
            }
        })
        .max()
        .unwrap_or(0);
    let number = previous
        .checked_add(1)
        .context("Tab number limit reached")?;
    Ok(format!("{base}-{number}"))
}

#[cfg(test)]
mod tests;
