import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as api from "../../lib/tauri";
import type {
  RepositoryTask,
  RepositoryTaskDetail,
  Project,
  ToolInfo,
} from "../../lib/tauri";
import { getHerdrInventory } from "../../lib/herdrControlApi";
import { automationAgentOptions } from "../../lib/automationAgents";
import { taskContext } from "../../lib/taskContext";
import { composeTaskPrompt } from "../../lib/taskPrompt";
import { useTaskStartPreferences } from "../../hooks/useTaskStartPreferences";
import { useTaskStartSkills } from "../../hooks/useTaskStartSkills";
import { launchTaskAgent, type TaskLaunchResult } from "../../lib/taskLaunch";
import {
  useProjectWorktrees,
  refreshProjectWorktrees,
} from "../../hooks/useProjectWorktrees";
import {
  createProjectWorktree,
  worktreeLabel,
  worktreeUrl,
  type ProjectWorktree,
} from "../../lib/worktreeApi";
import { getErrorMessage } from "../../lib/error";
import { GitBrowserDialog } from "../GitBrowserDialog";
import { ThemedSelect } from "../ThemedSelect";
import { TaskSkillPicker } from "./TaskSkillPicker";
import { TaskPromptPanel } from "./TaskPromptPanel";

export function TaskStartDialog({
  task,
  projects,
  onClose,
}: {
  task: RepositoryTask;
  projects: Project[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorFallback = t("common.error");
  const projectId = task.project_id;
  const settings = useTaskStartPreferences(projectId);
  const { preferences } = settings;
  const {
    session,
    sourcePath,
    createNew,
    agentKind: selectedKind,
  } = preferences;
  const skills = useTaskStartSkills(projectId);
  const project = projects.find((project) => project.id === projectId);
  const trees = useProjectWorktrees(projectId);
  const source = sourcePath
    ? trees.worktrees.find((tree) => tree.path === sourcePath)
    : (trees.worktrees.find((tree) => tree.is_main) ?? trees.worktrees[0]);
  const [branch, setBranch] = useState(`issue-${task.number}`);
  const [customPath, setCustomPath] = useState<string>();
  const destination =
    customPath ??
    `${(project?.path ?? "").replace(/[\\/]+$/, "")}-${branch.trim().replace(/[\\/]/g, "-")}`;
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [inventory, setInventory] = useState<Awaited<
    ReturnType<typeof getHerdrInventory>
  > | null>(null);
  const options = automationAgentOptions(tools);
  const kind =
    selectedKind ||
    options.find((option) => option.kind === "codex")?.kind ||
    options[0]?.kind ||
    "";
  const kindAvailable = options.some((option) => option.kind === kind);
  const sessionAvailable =
    !session ||
    !!inventory?.sessions.some((item) => item.name === session && item.running);
  const selectedSkills = preferences.skills.map(
    (skill) => skills.options.find((option) => option.id === skill.id) ?? skill,
  );
  const missingSkills =
    !skills.loading &&
    selectedSkills.some(
      (skill) => !skills.options.some((option) => option.id === skill.id),
    );
  const [name, setName] = useState(
    () => `task-${task.number}-${crypto.randomUUID().slice(0, 6)}`,
  );
  const [detail, setDetail] = useState<RepositoryTaskDetail | null>(null);
  const template =
    preferences.promptTemplate ?? t("tasks.launch.promptInstruction");
  const prompt = composeTaskPrompt(
    template,
    selectedSkills,
    detail
      ? taskContext(detail.summary, detail.body, detail.development).text
      : "",
    {
      skills: t("tasks.launch.promptSkills"),
      skillInstructions: t("tasks.launch.promptSkillInstructions"),
      task: t("tasks.launch.promptTask"),
    },
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [created, setCreated] = useState<ProjectWorktree | null>(null);
  const [result, setResult] = useState<TaskLaunchResult | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let disposed = false;
    const requestId = crypto.randomUUID();
    void Promise.all([
      api.getRepositoryTaskDetail(task, 1, requestId),
      api.getToolStatus(),
      getHerdrInventory(),
    ])
      .then(([detail, tools, inventory]) => {
        if (disposed) return;
        setDetail(detail);
        setTools(tools);
        setInventory(inventory);
        setError("");
      })
      .catch((error) => {
        if (!disposed) setError(getErrorMessage(error, errorFallback));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      void api.cancelTaskQuery(requestId).catch(() => {});
    };
  }, [task, retry, errorFallback]);
  const close = () => {
    if (!settings.flush()) toast.error(t("tasks.launch.saveFailed"));
    onClose();
  };
  const openResult = (value: TaskLaunchResult) => {
    navigate(worktreeUrl(value.attachment.project_id, value.attachment.path), {
      state: {
        preserveSidebar: true,
        herdrAttachment: value.attachment,
        projectId: value.attachment.project_id,
        context: detail
          ? taskContext(detail.summary, detail.body, detail.development)
          : undefined,
      },
    });
    close();
  };
  const newTree = createNew && !!source?.head;
  const promptTooLong = new TextEncoder().encode(prompt).length > 32768;
  const submit = async () => {
    if (pending.current) return;
    if (result) {
      openResult(result);
      return;
    }
    if (
      !project ||
      !source?.available ||
      !kindAvailable ||
      !sessionAvailable ||
      missingSkills ||
      (selectedSkills.length > 0 && skills.loading) ||
      !detail ||
      !prompt.trim() ||
      promptTooLong
    )
      return;
    settings.flush();
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      let path = created?.path ?? source.path;
      if (newTree && !created) {
        const tree = await createProjectWorktree(
          projectId,
          source.path,
          branch.trim(),
          destination.trim(),
        );
        setCreated(tree);
        path = tree.path;
        window.dispatchEvent(new Event("project-git-changed"));
        await refreshProjectWorktrees(projectId);
      }
      const value = await launchTaskAgent({
        projectId,
        path,
        session,
        kind,
        name,
        prompt,
      });
      setResult(value);
      if (!value.warning) openResult(value);
    } catch (error) {
      setError(getErrorMessage(error, t("common.error")));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const locked = busy || !!result;
  const pathLocked = locked || !!created;
  return (
    <GitBrowserDialog
      title={t("tasks.launch.title")}
      busy={busy}
      onClose={close}
      className="max-h-[calc(90vh/var(--app-scale))] max-w-5xl"
    >
      <form
        className="space-y-4 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.5fr)]">
          <div className="min-w-0 space-y-4">
            <div className="space-y-1">
              <span>{t("tasks.project")}</span>
              <p className="break-words font-medium">
                {project?.name ?? projectId}
              </p>
            </div>
            <label className="block space-y-1">
              <span>{t("tasks.launch.execution")}</span>
              <ThemedSelect
                aria-label={t("herdr.session")}
                value={session}
                disabled={locked}
                className="w-full"
                onChange={(event) =>
                  settings.update({ session: event.target.value })
                }
              >
                <option value="">{t("tasks.launch.managedSession")}</option>
                {!sessionAvailable && (
                  <option value={session} disabled>
                    {session} · {t("tasks.launch.unavailable")}
                  </option>
                )}
                {inventory?.sessions
                  .filter((session) => session.running)
                  .map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.name}
                    </option>
                  ))}
              </ThemedSelect>
            </label>
            <div className="flex items-center gap-2 rounded border border-border-subtle bg-bg-secondary p-2">
              <span className="min-w-0 flex-1 break-words text-xs">
                {task.provider === "github" ? "GitHub" : "GitLab"} · #
                {task.number} {task.title}
              </span>
              <button
                type="button"
                className="app-button-ghost h-7 w-7 shrink-0 p-0"
                aria-label={t("tasks.openRemote")}
                disabled={!/^https?:\/\//i.test(task.url)}
                onClick={() =>
                  void openUrl(task.url).catch((error) =>
                    setError(getErrorMessage(error, t("common.error"))),
                  )
                }
              >
                <ExternalLink size={13} />
              </button>
            </div>
            <label className="block space-y-1">
              <span>{t("tasks.launch.source")}</span>
              <ThemedSelect
                aria-label={t("tasks.launch.source")}
                value={sourcePath || source?.path || ""}
                disabled={pathLocked || trees.loading}
                className="w-full"
                onChange={(event) =>
                  settings.update({ sourcePath: event.target.value })
                }
              >
                {sourcePath && !source && (
                  <option value={sourcePath} disabled>
                    {sourcePath} · {t("tasks.launch.unavailable")}
                  </option>
                )}
                {trees.worktrees.map((tree) => (
                  <option
                    key={tree.path}
                    value={tree.path}
                    disabled={!tree.available}
                  >
                    {worktreeLabel(tree)}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={newTree}
                disabled={pathLocked || !source?.head}
                onChange={(event) =>
                  settings.update({ createNew: event.target.checked })
                }
              />
              {t("tasks.launch.newWorktree")}
              {newTree && (
                <span className="ml-auto font-mono text-muted">{branch}</span>
              )}
            </label>
            <label className="block space-y-1">
              <span>{t("herdr.agentType")}</span>
              <ThemedSelect
                aria-label={t("herdr.agentType")}
                value={kind}
                disabled={locked || !options.length}
                className="w-full"
                onChange={(event) =>
                  settings.update({ agentKind: event.target.value })
                }
              >
                {selectedKind && !kindAvailable && (
                  <option value={selectedKind} disabled>
                    {selectedKind} · {t("tasks.launch.unavailable")}
                  </option>
                )}
                {!options.length && (
                  <option value="">{t("herdr.noInstalledAgents")}</option>
                )}
                {options.map((option) => (
                  <option key={option.key} value={option.kind}>
                    {option.display_name}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <TaskSkillPicker
              options={skills.options}
              selected={selectedSkills}
              loading={skills.loading}
              error={skills.error}
              disabled={locked}
              onChange={(skills) => settings.update({ skills })}
              onRetry={skills.refresh}
            />
            <details>
              <summary className="cursor-pointer text-xs text-muted">
                {t("tasks.launch.advanced")}
              </summary>
              <div className="mt-3 space-y-3">
                {newTree && (
                  <>
                    <label className="block space-y-1 text-xs">
                      {t("worktree.newBranch")}
                      <input
                        aria-label={t("worktree.newBranch")}
                        className="app-input w-full"
                        disabled={pathLocked}
                        value={branch}
                        onChange={(event) => setBranch(event.target.value)}
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      {t("worktree.destination")}
                      <input
                        aria-label={t("worktree.destination")}
                        className="app-input w-full"
                        disabled={pathLocked}
                        value={created?.path ?? destination}
                        onChange={(event) => setCustomPath(event.target.value)}
                      />
                    </label>
                  </>
                )}
                <label className="block space-y-1 text-xs">
                  {t("herdr.agentName")}
                  <input
                    aria-label={t("herdr.agentName")}
                    className="app-input w-full"
                    maxLength={32}
                    disabled={locked}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              </div>
            </details>
          </div>
          <TaskPromptPanel
            prompt={prompt}
            template={template}
            disabled={locked}
            onTemplateChange={(promptTemplate) =>
              settings.update({ promptTemplate })
            }
          />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <p
            role={settings.saveFailed ? "alert" : undefined}
            className={settings.saveFailed ? "text-danger" : undefined}
          >
            {t(
              settings.saveFailed
                ? "tasks.launch.saveFailed"
                : "tasks.launch.remembered",
            )}
          </p>
          <button
            type="button"
            className="app-button-ghost shrink-0 px-2"
            disabled={pathLocked}
            onClick={settings.reset}
          >
            {t("tasks.launch.reset")}
          </button>
        </div>
        {(missingSkills ||
          !sessionAvailable ||
          (!trees.loading && !source?.available) ||
          (!loading && !kindAvailable)) && (
          <p role="alert" className="text-xs text-danger">
            {t("tasks.launch.updateUnavailable")}
          </p>
        )}
        {promptTooLong && (
          <p role="alert" className="text-xs text-danger">
            {t("tasks.launch.promptTooLong")}
          </p>
        )}
        {created && !result && (
          <p className="break-words text-xs text-muted">
            {t("tasks.launch.worktreeCreated")}: {created.path}
          </p>
        )}
        {(error || trees.error) && (
          <p role="alert" className="break-words text-xs text-danger">
            {error || trees.error}
          </p>
        )}
        {result?.warning && (
          <p
            role="alert"
            className="whitespace-pre-wrap break-words text-xs text-danger"
          >
            {result.warning}\n{t("tasks.launch.inspectFirst")}
          </p>
        )}
        {inventory?.installed === false && (
          <button
            type="button"
            className="app-button-secondary text-xs"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api
                .installHerdr()
                .then(() => {
                  setLoading(true);
                  setRetry((value) => value + 1);
                })
                .catch((error) =>
                  setError(getErrorMessage(error, t("common.error"))),
                )
                .finally(() => setBusy(false));
            }}
          >
            {t("herdr.install")}
          </button>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="app-button-secondary"
            disabled={busy}
            onClick={close}
          >
            {t("common.cancel")}
          </button>
          {error && !detail && (
            <button
              type="button"
              className="app-button-secondary"
              onClick={() => {
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            >
              {t("common.retry")}
            </button>
          )}
          <button
            type="submit"
            className="app-button-primary"
            disabled={
              busy ||
              (!result &&
                (loading ||
                  trees.loading ||
                  !detail ||
                  !inventory?.installed ||
                  !kindAvailable ||
                  !sessionAvailable ||
                  missingSkills ||
                  (selectedSkills.length > 0 && skills.loading) ||
                  !source?.available ||
                  !prompt.trim() ||
                  promptTooLong ||
                  !/^[a-z][a-z0-9_-]{0,31}$/.test(name) ||
                  (newTree && (!branch.trim() || !destination.trim()))))
            }
          >
            {busy || loading
              ? t("common.loading")
              : result
                ? t("tasks.launch.openWorkspace")
                : t("tasks.launch.confirm")}
          </button>
        </div>
      </form>
    </GitBrowserDialog>
  );
}
