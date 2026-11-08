import { useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../../../context/AppContext";
import { useActiveWorkspace } from "../../../hooks/useActiveWorkspace";
import { useHerdrSnapshot } from "../hooks/useHerdrSnapshot";
import { useHerdrFollowProject } from "../hooks/useHerdrFollowProject";
import { useHerdrProjectWorkspace } from "../hooks/useHerdrProjectWorkspace";
import { HerdrSettingsPanel } from "./HerdrSettingsPanel";
import { useHerdrWorkspaceOrder } from "../hooks/useHerdrWorkspaceOrder";
import { orderHerdrWorkspaces } from "../lib/herdrWorkspaces";
import { useProjectWorktrees } from "../../../hooks/useProjectWorktrees";
import { WorkspaceUnavailable } from "../../../components/worktree/WorkspaceUnavailable";
import * as api from "../api";
import { DEFAULT_HERDR_SESSION } from "../lib/herdrControlApi";
import {
  lastHerdrAttachment,
  readTerminalLayout,
} from "../../../lib/terminalLayout";
import { worktreeUrl } from "../../../lib/worktreeApi";
import { cn } from "../../../utils";
import { ThemedSelect } from "../../../components/ThemedSelect";
import { navigateHerdrList } from "./herdrListNavigation";
import { HerdrSessionPicker } from "./HerdrSessionPicker";
import { HerdrMaintenance } from "./HerdrMaintenance";
import { HerdrWorkspaceList } from "./HerdrWorkspaceList";
import { HerdrAgentList } from "./HerdrAgentList";
import { HerdrAgentDialog, type HerdrDialogRequest } from "./HerdrAgentDialog";
import type { SidebarPanelRequest } from "../../../lib/sidebarSections";

const button =
  "app-button-ghost rounded p-1 focus-visible:ring-2 focus-visible:ring-accent";
const normalized = (path?: string | null) =>
  path?.replace(/\\/g, "/").replace(/\/+$/, "");

export function SidebarHerdr({
  active,
  request: panelRequest,
}: {
  active: boolean;
  request?: SidebarPanelRequest;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { projects, refreshProjects } = useApp();
  const workspace = useActiveWorkspace(projects);
  const projectFiles = useProjectWorktrees(
    active ? workspace.project?.id : undefined,
  );
  const selectedPath = workspace.path ?? workspace.project?.path;
  const unavailable =
    !!workspace.project &&
    (!!projectFiles.error ||
      (projectFiles.worktrees.length > 0 &&
        !projectFiles.worktrees.some(
          (tree) =>
            normalized(tree.path) === normalized(selectedPath) &&
            tree.available,
        )));
  const source = useHerdrSnapshot(active);
  const { session, snapshot } = source;
  const workspaceOrder = useHerdrWorkspaceOrder(
    session,
    snapshot?.workspaces ?? [],
  );
  const orderedWorkspaces = orderHerdrWorkspaces(
    snapshot?.workspaces ?? [],
    workspaceOrder.order,
  );
  const [workspaceFilter, setWorkspaceFilter] = useState({
    session: "",
    id: "",
  });
  const [pendingOnly, setPendingOnly] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [share, setShare] = useState(47);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState({
    requestId: panelRequest?.id,
    open: panelRequest?.view === "settings",
  });
  if (settings.requestId !== panelRequest?.id) {
    setSettings({
      requestId: panelRequest?.id,
      open: panelRequest?.view === "settings",
    });
  }
  const settingsOpen = settings.open;
  const setSettingsOpen = (open: boolean) =>
    setSettings({ requestId: panelRequest?.id, open });
  const follow = useHerdrFollowProject();
  const [opened, setOpened] = useState<api.HerdrOpenedWorkspace | null>(() =>
    lastHerdrAttachment(readTerminalLayout()),
  );
  useHerdrProjectWorkspace({
    enabled:
      follow.enabled &&
      active &&
      !unavailable &&
      !projectFiles.loading &&
      projectFiles.worktrees.length > 0 &&
      !!source.inventory?.installed &&
      session === DEFAULT_HERDR_SESSION,
    session,
    projectId: workspace.project?.id,
    path: workspace.path,
    onReady: setOpened,
    onError: () => setNotice(t("herdr.workspaceUnavailable")),
    refresh: source.refresh,
  });
  const [dialog, setDialog] = useState<HerdrDialogRequest | null>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const inFlight = useRef(false);
  const lastPanes = useRef(new Map<string, string>());
  const latest = useRef({ session, route: location.key });
  useLayoutEffect(() => {
    latest.current = { session, route: location.key };
  }, [session, location.key]);
  const current =
    opened?.target.session === session &&
    (!workspace.project ||
      (opened.project_id === workspace.project.id &&
        normalized(opened.path) ===
          normalized(workspace.path ?? workspace.project.path)))
      ? opened
      : null;
  const pane = snapshot?.panes.find(
    (p) => p.pane_id === current?.target.pane_id,
  );
  const currentTarget = pane ? api.herdrTarget(session, pane) : undefined;
  const filterId =
    workspaceFilter.session === session &&
    snapshot?.workspaces.some((w) => w.workspace_id === workspaceFilter.id)
      ? workspaceFilter.id
      : "";
  const spaces = orderedWorkspaces.filter(
    (w) => !filterId || w.workspace_id === filterId,
  );
  const agents =
    snapshot?.agents.filter(
      (a) =>
        (!pendingOnly || a.agent_status === "blocked") &&
        (!filterId || a.workspace_id === filterId),
    ) ?? [];

  const move = async (value: api.HerdrOpenedWorkspace) => {
    const scope = latest.current;
    if (!mounted.current) return;
    await refreshProjects();
    if (
      !mounted.current ||
      scope.session !== latest.current.session ||
      scope.route !== latest.current.route
    )
      return;
    setOpened(value);
    lastPanes.current.set(
      `${session}:${value.target.workspace_id}`,
      value.target.pane_id,
    );
    navigate(worktreeUrl(value.project_id, value.path), {
      state: { preserveSidebar: true, herdrAttachment: value },
    });
  };
  const transact = async (job: () => Promise<void>) => {
    if (inFlight.current) return;
    const scope = latest.current;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      await job();
    } catch {
      if (
        scope.session === latest.current.session &&
        scope.route === latest.current.route
      )
        setNotice(t("herdr.workspaceUnavailable"));
    } finally {
      inFlight.current = false;
      setBusy(false);
      source.refresh();
    }
  };
  const open = (id: string, paneId?: string) =>
    transact(async () => {
      const scope = latest.current;
      const value = await api.openHerdrWorkspace(
        session,
        id,
        paneId &&
          snapshot?.panes.some(
            (p) => p.pane_id === paneId && p.workspace_id === id,
          )
          ? paneId
          : undefined,
      );
      if (
        scope.session === latest.current.session &&
        scope.route === latest.current.route
      )
        await move(value);
    });
  const focus = async (target: api.HerdrTarget) => {
    const scope = latest.current;
    const value = await api.openHerdrWorkspace(
      target.session,
      target.workspace_id,
      target.pane_id,
    );
    if (
      scope.session === latest.current.session &&
      scope.route === latest.current.route
    )
      await move(value);
  };
  const request = (mode: HerdrDialogRequest["mode"], agent: api.HerdrPane) => {
    const target = api.herdrTarget(session, agent);
    const label = `${snapshot?.workspaces.find((w) => w.workspace_id === agent.workspace_id)?.label ?? agent.workspace_id} / ${snapshot?.tabs.find((t) => t.tab_id === agent.tab_id)?.label ?? agent.tab_id} / ${agent.name ?? agent.agent ?? agent.pane_id}`;
    if (mode === "output")
      void transact(async () => {
        const scope = latest.current;
        const result = await api.runHerdrAction(target, "read");
        if (
          mounted.current &&
          scope.route === latest.current.route &&
          latest.current.session === session
        )
          setDialog({ mode, target, label, output: result.output ?? "" });
      });
    else setDialog({ mode, target, label });
  };
  return (
    <>
      {settingsOpen && (
        <HerdrSettingsPanel
          onBack={() => setSettingsOpen(false)}
          follow={follow}
        />
      )}
      <div
        hidden={settingsOpen}
        className={cn("flex h-full min-h-0 flex-col", settingsOpen && "hidden")}
        aria-label="Herdr"
      >
        <div className="flex min-h-9 shrink-0 items-center gap-1 px-2 py-1">
          <HerdrSessionPicker
            session={session}
            inventory={source.inventory}
            disabled={busy}
            onChange={source.setSession}
            onRefresh={source.refresh}
          />
          <button
            className={cn(button, "ml-auto shrink-0")}
            aria-label={t("herdr.openCurrent")}
            title={t("herdr.openCurrent")}
            disabled={
              !workspace.project ||
              !session ||
              busy ||
              unavailable ||
              projectFiles.loading
            }
            onClick={() =>
              void transact(async () => {
                const scope = latest.current;
                if (workspace.project) {
                  if (session === DEFAULT_HERDR_SESSION) {
                    await api.prepareHerdrSession();
                    if (
                      scope.session !== latest.current.session ||
                      scope.route !== latest.current.route
                    )
                      return;
                  }
                  const value = await api.ensureHerdrWorkspace(
                    session,
                    workspace.project.id,
                    workspace.path,
                  );
                  if (
                    scope.session === latest.current.session &&
                    scope.route === latest.current.route
                  )
                    await move(value);
                }
              })
            }
          >
            <TerminalSquare size={15} />
          </button>
          <button
            className={button}
            aria-label={t("common.refresh")}
            disabled={busy || source.loading}
            onClick={source.refresh}
          >
            <RefreshCw size={14} />
          </button>
          {source.inventory?.installed && (
            <HerdrMaintenance
              session={session}
              disabled={busy}
              onRefresh={source.refresh}
              onSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>
        {source.inventory?.installed === false && (
          <div className="p-3 text-xs text-muted">
            <p>{t("herdr.missing")}</p>
            <button
              className="app-button-secondary mt-2"
              disabled={busy}
              onClick={() =>
                void transact(async () => {
                  await api.installHerdr();
                })
              }
            >
              {t("herdr.install")}
            </button>
          </div>
        )}
        {(!source.inventory || (!snapshot && source.loading)) &&
          !source.error && (
            <p role="status" className="p-3 text-xs text-muted">
              {t("common.loading")}
            </p>
          )}
        {unavailable ? (
          <WorkspaceUnavailable
            compact
            path={selectedPath ?? ""}
            loading={projectFiles.loading}
            missing={!projectFiles.error}
            onRetry={() => {
              void projectFiles.refresh();
              source.refresh();
            }}
          />
        ) : (
          (notice || source.error) && (
            <div
              role="status"
              className="shrink-0 px-3 py-2 text-xs text-muted"
            >
              {notice || t("herdr.sessionUnavailable")}
              <button
                className="app-button-ghost ml-1"
                onClick={source.refresh}
              >
                {t("common.retry")}
              </button>
            </div>
          )
        )}
        {source.inventory?.installed &&
          !source.inventory.sessions.some((s) => s.running) && (
            <p className="p-3 text-xs text-muted">
              {t("herdr.noRunningSessions")}
            </p>
          )}
        {snapshot && (
          <>
            <div className="shrink-0 px-3 pb-2">
              <ThemedSelect
                className="w-full text-xs"
                value={filterId}
                onChange={(e) =>
                  setWorkspaceFilter({ session, id: e.target.value })
                }
                aria-label={t("herdr.filterWorkspace")}
              >
                <option value="">{t("herdr.allWorkspaces")}</option>
                {orderedWorkspaces.map((w) => (
                  <option key={w.workspace_id} value={w.workspace_id}>
                    {w.label}
                    {w.branch ? ` · ${w.branch}` : ""}
                  </option>
                ))}
              </ThemedSelect>
            </div>
            <div className="flex shrink-0 gap-1 px-3 pb-2">
              <button
                className="app-button-secondary flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-1 text-xs"
                disabled={!currentTarget || busy || unavailable}
                onClick={() => {
                  if (pane) request("new", pane);
                }}
              >
                <Plus size={13} />
                {t("herdr.newAgent")}
              </button>
              <button
                className={cn(
                  "app-button-secondary px-2 py-1 text-xs",
                  pendingOnly && "text-accent-light",
                )}
                aria-pressed={pendingOnly}
                onClick={() => {
                  setPendingOnly((v) => !v);
                  setAgentsOpen(true);
                }}
              >
                {t("herdr.pending")}{" "}
                {
                  snapshot.agents.filter((a) => a.agent_status === "blocked")
                    .length
                }
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <section
                className="flex min-h-0 flex-col"
                style={{
                  flexBasis: agentsOpen ? `${share}%` : undefined,
                  flexGrow: agentsOpen ? 0 : 1,
                }}
                aria-label={t("herdr.workspaces")}
              >
                <div className="flex h-8 shrink-0 items-center gap-2 px-3 text-xs">
                  <strong className="grow font-medium">
                    {t("herdr.workspaces")}
                  </strong>
                  <span className="text-muted">{spaces.length}</span>
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto px-1 pb-1"
                  onKeyDown={navigateHerdrList}
                >
                  <HerdrWorkspaceList
                    session={session}
                    onWorktreeDeleted={(projectId, path) => {
                      if (
                        workspace.project?.id === projectId &&
                        normalized(workspace.path) === normalized(path)
                      )
                        navigate(worktreeUrl(projectId), {
                          state: { preserveSidebar: true },
                        });
                      source.refresh();
                    }}
                    projects={active ? projects : []}
                    onOpenWorktree={(projectId, path, parentWorkspaceId) =>
                      void transact(async () => {
                        const scope = latest.current;
                        const value = await api.ensureHerdrWorkspace(
                          session,
                          projectId,
                          path,
                          parentWorkspaceId,
                        );
                        if (
                          scope.session === latest.current.session &&
                          scope.route === latest.current.route
                        ) {
                          await move(value);
                          source.refresh();
                        }
                      })
                    }
                    spaces={spaces}
                    agents={snapshot.agents}
                    selected={current?.target.workspace_id}
                    disabled={busy}
                    order={workspaceOrder.order}
                    reorderDisabled={
                      !workspaceOrder.ready || workspaceOrder.saving
                    }
                    onReorder={(activeId, overId) => {
                      void workspaceOrder
                        .move(activeId, overId)
                        .catch(() =>
                          toast.error(t("herdr.workspaceOrderSaveFailed")),
                        );
                    }}
                    onOpen={(id) =>
                      void open(id, lastPanes.current.get(`${session}:${id}`))
                    }
                  />
                  {!spaces.length && (
                    <p className="px-3 py-2 text-xs text-muted">
                      {t("herdr.noWorkspaces")}
                    </p>
                  )}
                </div>
              </section>
              {agentsOpen && (
                <div
                  role="separator"
                  aria-label={t("herdr.resizeLists")}
                  aria-orientation="horizontal"
                  aria-valuenow={share}
                  aria-valuemin={25}
                  aria-valuemax={65}
                  tabIndex={0}
                  className="mx-3 h-2 shrink-0 cursor-row-resize touch-none border-t border-border-subtle hover:border-accent focus-visible:border-accent"
                  onPointerDown={(e) =>
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }
                  onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      const rect =
                        e.currentTarget.parentElement?.getBoundingClientRect();
                      if (rect)
                        setShare(
                          Math.max(
                            25,
                            Math.min(
                              65,
                              ((e.clientY - rect.top) / rect.height) * 100,
                            ),
                          ),
                        );
                    }
                  }}
                  onKeyDown={(e) => {
                    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
                      e.preventDefault();
                      setShare((v) =>
                        Math.max(
                          25,
                          Math.min(65, v + (e.key === "ArrowUp" ? -5 : 5)),
                        ),
                      );
                    }
                  }}
                />
              )}
              <HerdrAgentList
                agents={agents}
                workspaces={snapshot.workspaces}
                selectedPaneId={current?.target.pane_id}
                agentsOpen={agentsOpen}
                grouped={grouped}
                busy={busy}
                onToggle={() => setAgentsOpen((value) => !value)}
                onToggleGrouping={() => setGrouped((value) => !value)}
                open={(id, paneId) => void open(id, paneId)}
                request={request}
              />
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-border-subtle px-3 py-1 text-xs text-muted">
              <span>
                {snapshot.agents.length} {t("herdr.agents")}
              </span>
              <span>
                {session} / {snapshot.version}
              </span>
            </div>
          </>
        )}
        {dialog && (
          <HerdrAgentDialog
            key={`${dialog.mode}:${dialog.target.session}:${dialog.target.pane_id}`}
            request={dialog}
            onClose={() => setDialog(null)}
            onComplete={source.refresh}
            onFocus={focus}
          />
        )}
      </div>
    </>
  );
}
