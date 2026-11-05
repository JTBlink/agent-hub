import {
  DEFAULT_HERDR_SESSION,
  getHerdrInventory,
  getHerdrSnapshot,
  ensureHerdrWorkspace,
  startHerdrAgent,
  runHerdrAction,
  embeddedWorkspaceAgent,
  type HerdrTarget,
  type HerdrSnapshot,
} from "@app/herdr";
import { installedTerminalAgents } from "../../lib/terminalAgents";
import {
  getAgentLaunchSettings,
  getAgentLaunchPlan,
  submitTerminalAgentPrompt,
  type ToolInfo,
} from "../../lib/tauri";
import {
  createTerminalTab,
  TERMINAL_PANE_LIMIT,
  type TerminalTab,
} from "../../lib/terminalLayout";
import { previewAgentCommand } from "../../lib/previewAgentCommand";
import type { AgentDeliveryPlan } from "../../lib/agentDelivery";
import type { PreviewAgentRequest } from "../../lib/previewAgentDelivery";
import type { PaneControl } from "./TerminalPane";

interface Options {
  tabs: () => TerminalTab[];
  update: (change: (tabs: TerminalTab[]) => TerminalTab[]) => void;
  controls: () => Map<string, PaneControl>;
  tools: () => readonly ToolInfo[];
}
const sameTarget = (a: HerdrTarget, b: HerdrTarget) =>
  a.session === b.session &&
  a.workspace_id === b.workspace_id &&
  a.pane_id === b.pane_id &&
  a.terminal_id === b.terminal_id;
function refreshed(
  snapshot: HerdrSnapshot,
  target: HerdrTarget,
  path: string,
): HerdrTarget {
  const pane = snapshot.agents.find(
    (pane) =>
      pane.workspace_id === target.workspace_id &&
      pane.pane_id === target.pane_id &&
      pane.terminal_id === target.terminal_id,
  );
  const workspace = snapshot.workspaces.find(
    (space) => space.workspace_id === target.workspace_id,
  );
  if (
    !pane?.agent ||
    (pane.cwd ?? workspace?.directory) !== path ||
    JSON.stringify(pane.agent_session) !== JSON.stringify(target.agent_session)
  )
    throw Error("PREVIEW_AGENT_PANE_CHANGED");
  return {
    ...target,
    revision: pane.revision,
    agent_session: pane.agent_session,
  };
}

/** One page owns one Pane for the lifetime of this workbench. No prompts are replayed. */
export class PreviewAgentRuntime {
  private pending = false;
  private options: Options;
  constructor(options: Options) {
    this.options = options;
  }
  async deliver(request: PreviewAgentRequest, projectId: string) {
    if (this.pending) throw Error("PREVIEW_AGENT_BUSY");
    this.pending = true;
    try {
      await this.submit(request, projectId);
    } finally {
      this.pending = false;
    }
  }
  private async existing(request: PreviewAgentRequest, projectId: string) {
    const { workspacePath: path, page } = request;
    const pageKey = page.path ? `file:${page.path}` : page.id;
    const scope = (tab: TerminalTab) =>
      tab.projectId === projectId && tab.worktreePath === path;
    if (
      this.options
        .tabs()
        .some(
          (tab) =>
            scope(tab) &&
            tab.previewPageId === pageKey &&
            (tab.previewUncertain || tab.previewPending),
        )
    )
      throw Error("PREVIEW_AGENT_UNCERTAIN");
    const bound = this.options
      .tabs()
      .find(
        (tab) =>
          scope(tab) &&
          tab.previewPageId === pageKey &&
          (!request.agentId || tab.agent === request.agentId),
      );
    if (bound) {
      if (bound.previewUncertain || bound.previewPending)
        throw Error("PREVIEW_AGENT_UNCERTAIN");
      return bound;
    }
    // Reuse a live embedded Agent only when it is unambiguously available and unbound.
    // Shells, development services and scripts are deliberately ineligible.
    const candidates = this.options
      .tabs()
      .filter(
        (tab) =>
          !request.agentId &&
          !page.path &&
          scope(tab) &&
          !tab.previewPageId &&
          !tab.scriptPath &&
          !tab.development &&
          tab.panes.length === 1 &&
          (tab.herdrTarget || tab.nativeTask),
      );
    const eligible: TerminalTab[] = [];
    const snapshots = new Map<string, HerdrSnapshot>();
    for (const candidate of candidates) {
      if (candidate.herdrTarget) {
        let snapshot = snapshots.get(candidate.herdrTarget.session);
        if (!snapshot) {
          snapshot = await getHerdrSnapshot(candidate.herdrTarget.session);
          snapshots.set(candidate.herdrTarget.session, snapshot);
        }
        const claimed = this.options
          .tabs()
          .flatMap((tab) =>
            tab.previewPageId &&
            tab.herdrTarget &&
            tab.herdrTarget.session === candidate.herdrTarget?.session
              ? [tab.herdrTarget.terminal_id]
              : [],
          );
        const target = embeddedWorkspaceAgent(
          snapshot,
          candidate.herdrTarget,
          path,
          claimed,
        );
        if (target) {
          const kind = snapshot.agents.find(
            (pane) => pane.terminal_id === target.terminal_id,
          )?.agent;
          const agent = installedTerminalAgents(this.options.tools()).find(
            (agent) => agent.id === kind || agent.toolKey === kind,
          )?.id;
          eligible.push({ ...candidate, herdrTarget: target, agent });
        }
      } else if (this.options.controls().has(candidate.panes[0]))
        eligible.push(candidate);
    }
    return eligible.length === 1 ? eligible[0] : undefined;
  }
  async preview(
    request: PreviewAgentRequest,
    projectId: string,
  ): Promise<AgentDeliveryPlan> {
    const existing = await this.existing(request, projectId);
    const installed = installedTerminalAgents(this.options.tools());
    const settings = await getAgentLaunchSettings();
    const selected = request.agentId ?? existing?.agent;
    const choice = selected
      ? installed.find((agent) => agent.id === selected)
      : (installed.find(
          (agent) =>
            agent.toolKey === settings.document.default_agent ||
            agent.id === settings.document.default_agent,
        ) ?? installed[0]);
    if (!choice) throw Error("PREVIEW_AGENT_NOT_INSTALLED");
    const launch = await getAgentLaunchPlan(
      choice.id === "claude_teams" ? "claude" : choice.id,
    );
    const inventory = await getHerdrInventory();
    const native = existing ? !existing.herdrTarget : !inventory.installed;
    const target = existing?.herdrTarget;
    if (target)
      refreshed(
        await getHerdrSnapshot(target.session),
        target,
        request.workspacePath,
      );
    return {
      backend: native ? "native" : "herdr",
      agent: choice.label,
      createsWorkspace: !native && !existing,
      command: previewAgentCommand({
        session: target?.session ?? DEFAULT_HERDR_SESSION,
        pane: target?.pane_id,
        path: request.workspacePath,
        title: request.page.path?.split(/[\\/]/).at(-1) ?? request.page.title,
        prompt: request.prompt,
        launch,
        native,
      }),
    };
  }
  private async submit(request: PreviewAgentRequest, projectId: string) {
    const { workspacePath: path, page, prompt, verify } = request;
    const pageKey = page.path ? `file:${page.path}` : page.id;
    const existing = await this.existing(request, projectId);
    if (existing) {
      await verify();
      this.options.update((tabs) =>
        tabs.map((tab) =>
          tab.id === existing.id
            ? {
                ...tab,
                previewPageId: pageKey,
                herdrTarget: existing.herdrTarget,
                agent: existing.agent,
              }
            : tab,
        ),
      );
      await this.send(existing, prompt, path, verify);
      return;
    }
    const settings = await getAgentLaunchSettings();
    const installed = installedTerminalAgents(this.options.tools());
    const choice = request.agentId
      ? installed.find((agent) => agent.id === request.agentId)
      : (installed.find(
          (agent) =>
            agent.toolKey === settings.document.default_agent ||
            agent.id === settings.document.default_agent,
        ) ?? installed[0]);
    if (!choice) throw Error("PREVIEW_AGENT_NOT_INSTALLED");
    const inventory = await getHerdrInventory();
    await verify();
    if (
      this.options.tabs().reduce((count, tab) => count + tab.panes.length, 0) >=
      TERMINAL_PANE_LIMIT
    )
      throw Error("PREVIEW_AGENT_LIMIT");
    const tab = {
      ...createTerminalTab(projectId, undefined, path),
      title: page.path
        ? page.path.split(/[\\/]/).at(-1)!
        : page.title.slice(0, 80),
      previewPageId: pageKey,
      agent: choice.id,
      previewPending: true,
    };
    this.options.update((tabs) => [...tabs, tab]);
    let submitted = false;
    try {
      if (inventory.installed) {
        const space = await ensureHerdrWorkspace(
          DEFAULT_HERDR_SESSION,
          projectId,
          path,
        );
        await verify();
        this.requireTab(tab.id);
        this.options.update((tabs) =>
          tabs.map((item) =>
            item.id === tab.id ? { ...item, herdrTarget: space.target } : item,
          ),
        );
        // From this point failure may mean the task was accepted. Preserve the tab and block retries.
        submitted = true;
        const started = await startHerdrAgent(space.target, {
          kind: choice.id === "claude_teams" ? "claude" : choice.id,
          ...(choice.id === "claude_teams" ? { teams: true } : {}),
          name: `page-${tab.id.replaceAll("-", "").slice(0, 16)}`,
          direction: "right",
          prompt,
        });
        this.options.update((tabs) =>
          tabs.map((item) =>
            item.id === tab.id
              ? {
                  ...item,
                  previewPending: false,
                  herdrTarget: started.target,
                  previewUncertain: !!started.warning,
                }
              : item,
          ),
        );
        if (started.warning)
          throw Error(`${started.warning}\nPREVIEW_AGENT_UNCERTAIN`);
      } else {
        await verify();
        this.requireTab(tab.id);
        submitted = true;
        await new Promise<void>((resolve, reject) => {
          let done = false;
          const timer = setTimeout(() => {
            if (!done) {
              done = true;
              reject(Error("PREVIEW_AGENT_UNCERTAIN"));
            }
          }, 30_000);
          const finish = (reason?: unknown) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (reason) reject(reason);
            else resolve();
          };
          this.options.update((tabs) =>
            tabs.map((item) =>
              item.id === tab.id
                ? {
                    ...item,
                    previewPending: false,
                    agent: choice.id,
                    nativeTask: {
                      prompt,
                      started: () => finish(),
                      failed: (reason) => finish(reason),
                    },
                  }
                : item,
            ),
          );
        });
      }
    } catch (error) {
      this.options.update((tabs) =>
        submitted
          ? tabs.map((item) =>
              item.id === tab.id
                ? {
                    ...item,
                    previewUncertain: true,
                    previewPending: !item.herdrTarget && !!item.previewPending,
                  }
                : item,
            )
          : tabs.filter((item) => item.id !== tab.id),
      );
      throw error;
    }
  }
  private requireTab(id: string) {
    if (!this.options.tabs().some((tab) => tab.id === id))
      throw Error("PREVIEW_AGENT_PANE_CHANGED");
  }
  private async send(
    tab: TerminalTab,
    prompt: string,
    path: string,
    verify: () => Promise<void>,
  ) {
    let submitted = false;
    try {
      if (tab.herdrTarget) {
        const snapshot = await getHerdrSnapshot(tab.herdrTarget.session);
        const target = refreshed(snapshot, tab.herdrTarget, path);
        this.requireTab(tab.id);
        if (
          this.options
            .tabs()
            .some(
              (other) =>
                other.id !== tab.id &&
                other.previewPageId &&
                other.herdrTarget &&
                sameTarget(other.herdrTarget, target),
            )
        )
          throw Error("PREVIEW_AGENT_PANE_CHANGED");
        await verify();
        submitted = true;
        await runHerdrAction(target, "prompt", prompt);
      } else {
        const control = this.options.controls().get(tab.panes[0]);
        if (!tab.nativeTask || !control || control.cwd !== path)
          throw Error("PREVIEW_AGENT_PANE_CHANGED");
        await verify();
        submitted = true;
        await submitTerminalAgentPrompt(control.sessionId, prompt);
      }
    } catch (error) {
      // Never silently retry a transport whose final result is unknown.
      if (submitted)
        this.options.update((tabs) =>
          tabs.map((item) =>
            item.id === tab.id ? { ...item, previewUncertain: true } : item,
          ),
        );
      throw error;
    }
  }
}
