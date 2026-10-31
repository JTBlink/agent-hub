import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Project, TaskBinding, TaskProvider } from "../../lib/tauri";
import * as api from "../../lib/tauri";
import { ThemedSelect } from "../ThemedSelect";
import { getErrorMessage } from "../../lib/error";

interface Props {
  projects: Project[];
  bindings: TaskBinding[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}
export function TaskConnections({
  projects,
  bindings,
  onChanged,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [provider, setProvider] = useState<TaskProvider>("github");
  const [host, setHost] = useState("github.com");
  const [repository, setRepository] = useState("");
  const [program, setProgram] = useState("");
  const [argumentsText, setArgumentsText] = useState("[]");
  const [editing, setEditing] = useState<string | null>(null);
  const [remotes, setRemotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setRemotes([]);
    if (projectId)
      void api
        .getTaskProjectRemotes(projectId)
        .then((values) => {
          if (!cancelled) setRemotes(values);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const args: unknown = JSON.parse(argumentsText);
      if (
        !Array.isArray(args) ||
        !args.every(
          (value: unknown): value is string => typeof value === "string",
        )
      )
        throw new Error(t("tasks.launcherArgsInvalid"));
      await api.saveTaskBinding({
        id: editing || crypto.randomUUID(),
        project_id: projectId,
        provider,
        host: host.trim(),
        repository: repository.trim(),
        launcher: program.trim() ? { program: program.trim(), args } : null,
      });
      await onChanged();
      setEditing(null);
      setRepository("");
    } catch (reason) {
      setError(getErrorMessage(reason, t("common.error")));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await api.removeTaskBinding(id);
      await onChanged();
    } catch (reason) {
      setError(getErrorMessage(reason, t("common.error")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label={t("tasks.connections")}
      className="app-panel space-y-3 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t("tasks.connections")}</h2>
        <button
          type="button"
          className="app-button-ghost"
          disabled={busy}
          onClick={onClose}
        >
          {t("common.close")}
        </button>
      </div>
      <p className="text-xs text-muted">{t("tasks.connectionHint")}</p>
      {bindings.map((binding) => (
        <div
          key={binding.id}
          className="flex flex-wrap items-center gap-2 text-xs"
        >
          <span className="min-w-0 flex-1 break-all">
            {projects.find((project) => project.id === binding.project_id)
              ?.name || binding.project_id}{" "}
            · {binding.host}/{binding.repository}
          </span>
          <button
            type="button"
            className="app-button-ghost"
            disabled={busy}
            onClick={() => {
              setEditing(binding.id);
              setProjectId(binding.project_id);
              setProvider(binding.provider);
              setHost(binding.host);
              setRepository(binding.repository);
              setProgram(binding.launcher?.program || "");
              setArgumentsText(JSON.stringify(binding.launcher?.args || []));
            }}
          >
            {t("common.edit")}
          </button>
          <button
            type="button"
            className="app-button-ghost text-danger"
            disabled={busy}
            onClick={() => void remove(binding.id)}
          >
            {t("common.remove")}
          </button>
        </div>
      ))}
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} className="contents">
          <label className="text-xs">
            {t("tasks.project")}
            <ThemedSelect
              aria-label={t("tasks.project")}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              {!projects.length && (
                <option value="">{t("terminal.chooseProject")}</option>
              )}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label className="text-xs">
            {t("tasks.provider")}
            <ThemedSelect
              value={provider}
              aria-label={t("tasks.provider")}
              onChange={(event) => {
                const value =
                  event.target.value === "gitlab" ? "gitlab" : "github";
                setProvider(value);
                setHost(value === "github" ? "github.com" : "gitlab.com");
              }}
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </ThemedSelect>
          </label>
          <label className="text-xs">
            {t("tasks.host")}
            <input
              ref={first}
              className="app-input mt-1 w-full"
              value={host}
              required
              onChange={(event) => setHost(event.target.value)}
            />
          </label>
          <label className="text-xs">
            {t("tasks.repository")}
            <input
              className="app-input mt-1 w-full"
              value={repository}
              placeholder="group/project"
              required
              onChange={(event) => setRepository(event.target.value)}
            />
          </label>
          {remotes.length > 0 && (
            <div className="flex flex-wrap gap-1 sm:col-span-2">
              {remotes.map((remote) => (
                <button
                  key={remote}
                  type="button"
                  className="app-button-secondary text-xs"
                  onClick={() => {
                    const slash = remote.indexOf("/");
                    setHost(remote.slice(0, slash));
                    setRepository(remote.slice(slash + 1));
                  }}
                >
                  {remote}
                </button>
              ))}
            </div>
          )}
          <label className="text-xs">
            {t("tasks.launcher")}
            <input
              className="app-input mt-1 w-full"
              value={program}
              placeholder={provider === "github" ? "gh" : "glab"}
              onChange={(event) => setProgram(event.target.value)}
            />
          </label>
          <label className="text-xs">
            {t("tasks.launcherArgs")}
            <input
              className="app-input mt-1 w-full font-mono"
              value={argumentsText}
              onChange={(event) => setArgumentsText(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-danger sm:col-span-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="app-button-primary justify-self-start"
            disabled={busy || !projectId}
          >
            {t("common.save")}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
