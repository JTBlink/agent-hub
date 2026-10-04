<p align="center">
  <img src="assets/icon.png" width="80" />
</p>

<h1 align="center">Skills Manager</h1>

<p align="center">
  One app to manage AI agent skills across all your coding tools.
</p>

<p align="center">
  <img src="assets/demo/library.png" width="800" alt="Skills Manager Library" />
</p>

<p align="center"><strong>Install Skills — Marketplace</strong></p>
<p align="center"><img src="assets/demo/install-skills.png" width="800" alt="Install Skills Marketplace" /></p>

<p align="center"><strong>Global Workspace</strong></p>
<p align="center"><img src="assets/demo/global-workspace.png" width="800" alt="Global Workspace" /></p>

<p align="center"><strong>Agent Workspace</strong></p>
<p align="center"><img src="assets/demo/agent-workspace.png" width="800" alt="Agent Workspace" /></p>

<p align="center"><strong>Project Workspace</strong></p>
<p align="center"><img src="assets/demo/project-workspace.png" width="800" alt="Project Workspace" /></p>

<p align="center"><strong>Backup & Multi-Device Sync</strong></p>
<p align="center"><img src="assets/demo/backup.png" width="800" alt="Backup and multi-device sync" /></p>

<p align="center"><strong>Settings</strong></p>
<p align="center"><img src="assets/demo/settings.png" width="800" alt="Settings" /></p>

## Features

<p align="center">
  <img src="assets/diagram-concept-map.png" width="640" alt="Concept map: Library, Preset, Global Workspace, Project Workspace, Agent" />
</p>

- **Unified skill library** — Install skills from Git repos, local folders, `.zip` / `.skill` archives, or the [skills.sh](https://skills.sh) marketplace. Everything goes into one central repo, which defaults to `~/.skills-manager` and can be customized in **Settings**.
- **Marketplace** — Browse popular skills from the marketplace and find them with keyword search.
- **Your agents can manage skills** — Claude Code, Codex, Cursor and the rest can install a skill, deploy it to another agent, or report what is where, by driving Skills Manager instead of writing into an agent's folder behind its back — so sources, presets, update tracking and per-agent state stay intact. The Dashboard sets this up in one click; see [Let your agents manage skills](#let-your-agents-manage-skills).
- **Presets** — Group skills into named presets. In any workspace, click a preset pill to instantly activate or deactivate all its skills for the current agent scope. Applying a preset is a one-time copy, not a live sync. The sidebar lists all presets for quick access.
- **Global Workspace** — Each agent gets its own page listing every skill in its global folder — including ones installed outside Skills Manager — so the view always reflects what the agent actually sees. Add or remove skills per agent, or use the All Agents overview to manage every installed agent at once.
- **Project Workspaces** — View and manage project-local skill folders for supported agents, compare them with your central library, and sync changes in either direction. Supports nested skill directories and per-agent assignment when exporting.
- **Linked Workspaces** — Point to any directory as a skills root — useful for skills that live outside the default agent paths. Managed as a standalone workspace without participating in global preset sync.
- **Multi-tool sync** — Sync skills to any supported tool via symlink or copy with a single click. Every skill card shows an agent icon badge per enabled agent — click a badge to install or remove that skill for that agent right from the card, with the badge reflecting live sync state.
- **Add from Library sheet** — In any workspace, click **+ Add Skills** to open a unified picker: search your central library, toggle target agents with always-visible chips (with select-all/clear), and batch-add multiple skills in one click.
- **Batch operations** — Multi-select skills for bulk enable/disable, export, or delete. Project Workspaces also support bulk enable/disable for project-local skills.
- **Skill tagging and filters** — Tag skills, use tags to group similar skills, and filter by source or tag — including an **Untagged** pill to quickly find skills missing labels.
- **Update tracking** — Check for upstream updates on Git-based skills; re-import local ones.
- **Skill preview and source inspection** — Read `SKILL.md` / `README.md`, inspect source metadata, and compare local content with the upstream version inside the app.
- **Custom tools** — Add your own agents/tools with custom skills directories, or override the default path for any built-in tool.
- **Backup & multi-device sync** — Connect a private GitHub repository with a personal access token (or any Git remote), and the app backs your library up automatically and keeps all connected devices in sync. Merges are skill-aware — a rename on one machine combines cleanly with an edit on another — and true conflicts never block: your local version stays put until you choose keep mine / use remote / keep both. Snapshot versions are restorable at any time.
- **Activity log & Export Logs** — Install / remove / update / sync operations are recorded locally. Use **Settings → Export Logs** to bundle recent logs and activity history into a single zip for easier issue reports.
- **Flexible app settings** — Configure repo path, sync mode, theme, text size, language, tray behavior, proxy, Git remote, update checks, and the order agents appear throughout the app — all in one place.
- **Application updates** — Update the manager with AgentHub; Settings links to the host releases.

## Install

This module ships with AgentHub. Use the [AgentHub releases](https://github.com/JTBlink/agent-hub/releases) or build from the repository root with `npm run app:build`. Open **Skills** in AgentHub to start the manager. The manager and CLI update with the host application.

For independent development and data boundaries, see [the module integration guide](../README.md).

## Quick Start

1. Install skills from local folders, Git repositories, archives, or the marketplace.
2. Open **Global Workspace** from the sidebar and pick an agent (e.g. Claude Code).
3. Click a **Preset** pill to activate its skills for that agent, or use **+ Add Skills** to pick from your library and toggle target agents inline. Active presets show a ✓; partial installs show a count badge.
4. To manage project-local skills, open a **Project Workspace** and use the same preset pills or the **+ Add Skills** picker with its multi-agent target selector.
5. Configure agent paths, custom tools, theme, language, proxy, and Git preferences in **Settings**.
6. If you want history or multi-machine sync, open **Backup** in the sidebar and connect with a personal access token — backup and cross-device sync run automatically from then on.

## Let your agents manage skills

Claude Code, Codex, Cursor and the rest can install a skill, deploy it to another agent, or report what is where — by driving Skills Manager rather than writing into an agent's folder behind its back. That is what keeps source metadata, preset membership, update tracking and cross-agent deployment state intact.

The Dashboard offers a one-time setup: pick the agents that should be able to do it, and the app installs the [`manage-skills`](skills/manage-skills/SKILL.md) skill and deploys it to exactly those. Afterwards it is an ordinary library skill — adding or removing an agent is the agent badge row on its own card. No PATH setup is involved: the app publishes a copy of its CLI where agents look for it.

From this module directory, install the bundled skill with the CLI:

```bash
npm run cli -- skills install ./skills/manage-skills
```

## Backup & Multi-Device Sync

The **Backup** page (sidebar) keeps your skill library versioned in a Git repository. One device gets versioned backup with restorable snapshots; several devices connected to the same repository stay in sync with each other automatically. The remote stays a plain Git repository — you can `git clone` it anywhere, no lock-in.

### Connect

- **Personal access token**: connect a private backup repository; credentials are stored in the OS keychain. Device sign-in is available only in builds configured with an AgentHub-owned OAuth app.
- **Advanced**: paste any Git URL (HTTPS + PAT, SSH, self-hosted) under **Settings → Git Sync Configuration**.
- On a new machine with an empty library, the first launch asks: **start fresh, or restore from a backup?**

### How syncing works

- **Automatic**: local changes are committed and pushed in the background a couple of minutes after you stop editing; updates pushed by your other devices are merged in and pushed back automatically. **Back Up Now** is always available for an immediate run, and every backup in the history shows which device made it.
- **Skill-aware merging**: changes are merged per skill, not per text line — renaming a skill on one machine combines cleanly with editing its content on another.
- **Conflicts never block or overwrite**: if the same skill was edited on two devices at once, everything else syncs normally while that skill keeps your local version and appears under **Needs attention** (also badged on its card in the Library). Pick **keep mine / use remote / keep both** — a safety snapshot is taken before any choice is applied, so every decision is undoable.
- **Snapshots & restore**: manual backups create snapshot versions; open the Backup page history to restore any of them. A restore first saves the current state as its own snapshot.

### What's included

Skills, tags, presets, and per-agent skill toggles are backed up. Secrets (API keys, tokens, proxy settings) and machine-specific wiring never leave the machine. Skills over 100 MB stay local and are excluded from backup automatically (labeled on the Backup page). The SQLite database is not in Git — it stores metadata that is rebuilt from the skill files.

### Disconnecting

The Backup page offers three levels: **disconnect this machine** (other devices and remote data untouched), **revoke the GitHub authorization**, or **delete the remote backup** entirely (routed through GitHub's own type-the-name confirmation).

## Supported Tools

54 agents are supported out of the box, including:

Claude Code · Codex · Cursor · GitHub Copilot · Gemini CLI · GitLab Duo · OpenCode · OpenClaw · Hermes Agent · OpenHands · Cline · Goose · Windsurf · Continue · Grok · Antigravity · Qwen Code · ZCode · Crush · Kilo Code · Roo Code · Amp · Kiro CLI · Droid · TRAE IDE · Warp · Qoder · CodeBuddy

**Settings** lists them all, leading with the ones detected on your machine. You can also add custom tools there and manage their skills the same way.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Desktop | Tauri 2 |
| Backend | Rust |
| Storage | SQLite (`rusqlite`) |
| i18n | react-i18next |

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22.12+ (required by Vite 7)
- Rust 1.77.2 or newer
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

### Development

```bash
npm install
npm run tauri:dev
```

### CLI

The repository includes an agent-friendly CLI built on the same Rust shared core used by the desktop app. Both the CLI and the desktop app go through the same SQLite database, central library, and sync engine.

```bash
# Look around
npm run cli -- skills list
npm run cli -- skills show db

# Install into the library (does NOT deploy to any agent by itself)
npm run cli -- skills install ./my-skill
npm run cli -- skills install https://github.com/foo/bar/tree/main/skills/baz
npm run cli -- skills install vercel-labs/agent-skills@react-best-practices

# Put it into the agents that should have it, then check
npm run cli -- skills deploy react-best-practices --agent claude_code --agent codex
npm run cli -- skills status react-best-practices

# Pull upstream changes, and adopt what an agent already has
npm run cli -- skills check --all
npm run cli -- skills update --all
npm run cli -- skills adopt ~/.claude/skills --dry-run
```

`--help` on any group or subcommand prints the full surface — the groups below
each carry more than these examples show. `--dry-run` is available on selected
commands, including `skills deploy/undeploy/sync/remove/adopt` and
`presets deploy/undeploy/delete`; check each subcommand's help before using it.
`skills remove` requires `--yes` for actual deletion.

Available command groups:
- `repo` — inspect or change the configured base directory
- `agents` (`tools` alias) — list agents, globally enable or disable them, and add custom agents (`add-custom`)
- `skills` — manage the central library and real per-agent deployments (`deploy / undeploy / status`)
- `presets` — create, update, delete, organize, deploy, undeploy, and inspect presets
- `git` — operate on the git-backed `skills/` repository (`clone`, `pull`, `push`, `commit`, `versions`, `restore`)

Extra flags:
- `--skills-root <path>` — operate on a cloned/exported skills repo directly instead of the local app default. The manager's state (DB, presets, cache, logs) lives in `~/.skills-manager/external/<name>-<hash>/`, namespaced by the canonical path of the skills root, so the external checkout itself stays clean.
- `--json` — machine-readable output for scripts/agents. Failures print `{"ok": false, "code": …, "message": …}` on stderr with a non-zero exit. A deployment refused because the target is not ours carries the paths as data (`code: "TARGET_CONFLICT"`, `details.conflicts[].path`) so a caller can name the directory in the way instead of quoting a sentence.

```bash
npm run -s cli -- --skills-root /path/to/my-skills --json skills list
```

#### Agents inside WSL

The Windows app cannot create links inside WSL, so it can only copy skills there. If your agents live in WSL, run the Linux CLI inside WSL instead — it keeps its own library there and deploys with real symlinks:

```bash
npm run cli:install
export PATH="$HOME/.local/bin:$PATH"
skills-manager-cli agents add-custom hermes-work --path ~/.hermes/profiles/work/skills
skills-manager-cli skills install ./my-skill
skills-manager-cli skills deploy my-skill --agent hermes-work
```

#### Where the binary lives

At startup the app publishes a copy of its own CLI to `~/.skills-manager/bin/skills-manager-cli`, always matching the running app, so agents can find it without anything on your PATH. A `.version` stamp beside it is written only after the copy is verified and removed before each republish, so a copy that failed — a binary held open on Windows, say — is never presented as usable.

Putting the CLI on your *own* PATH, for typing commands yourself, is separate:

```bash
npm run cli:install
# equivalent to:
# cargo install --path src-tauri --bin skills-manager-cli --locked --force
```

This drops the binary at `~/.cargo/bin/skills-manager-cli`. Re-run after pulling updates to refresh it.

AgentHub bundles the CLI with the manager. For a separate command-line installation, use the source installation command above.

#### Concurrent use with the desktop app

The CLI and desktop app share the same SQLite database and repository lock. The app's filesystem watcher normally refreshes after CLI metadata or deployment changes. If the app was suspended while a command ran, trigger one manual refresh.

### Build

```bash
npm run tauri:build
npm run cli:build
```

## Troubleshooting

**macOS refuses to open the app.** Check the signing information for the AgentHub release you installed; this module does not inherit upstream signing or notarization guarantees.

Anything else — [follow the repository feedback process](https://github.com/JTBlink/agent-hub/blob/main/docs/agents/issue-tracker.md), and attach the bundle from **Settings → Export Logs**.

## License

MIT
