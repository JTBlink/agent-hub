import { useEffect, useId, useRef, useState } from "react";
import { Code2, FolderOpen, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../lib/error";
import { openDirectoryInVscode } from "../lib/openInVscode";
import { ThemedSelect } from "./ThemedSelect";
import type { Project } from "../lib/tauri";

export function AutomationWorkdirField({
  value,
  disabled,
  onChange,
  kind = "workdir",
  projects = [],
  projectsLoading = false,
  readOnly = false,
  helpText,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
  kind?: "workdir" | "scriptDir" | "projectWorkspace";
  projects?: Project[];
  projectsLoading?: boolean;
  readOnly?: boolean;
  helpText?: string;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [action, setAction] = useState<"choose" | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const path = value?.trim() ?? "";
  const chooseLabel =
    kind === "scriptDir"
      ? "automation.chooseScriptDir"
      : kind === "projectWorkspace"
        ? "automation.chooseProjectWorkspace"
        : "automation.chooseWorkdir";
  const launch = async (action: "choose" | "edit") => {
    if (disabled || pending.current || (readOnly && action === "choose"))
      return;
    pending.current = true;
    setAction(action);
    setError(null);
    try {
      const resolved =
        path === "~" || path.startsWith("~/")
          ? await join(await homeDir(), path.slice(2))
          : path;
      if (action === "choose") {
        const selected = await open({
          directory: true,
          multiple: false,
          title: t(chooseLabel),
          ...(resolved ? { defaultPath: resolved } : {}),
        });
        if (mounted.current && typeof selected === "string") onChange(selected);
      } else if (resolved) {
        await openDirectoryInVscode(resolved);
      }
    } catch (cause) {
      if (mounted.current) setError(getErrorMessage(cause, t("common.error")));
    } finally {
      pending.current = false;
      if (mounted.current) setAction(null);
    }
  };
  const buttonClass =
    "app-button-ghost h-9 w-9 shrink-0 rounded-md p-2 text-muted hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor={inputId} className="text-[12px] font-medium text-muted">
          {t(`automation.${kind}`)}
        </label>
        <button
          type="button"
          disabled={disabled || action !== null || !path}
          title={t(
            path
              ? "install.scan.openInVscode"
              : "automation.openWorkdirAfterSave",
          )}
          aria-label={t(
            kind === "scriptDir"
              ? "automation.openScriptDir"
              : "install.scan.openInVscode",
          )}
          className="app-button-ghost flex h-6 w-6 shrink-0 items-center justify-center rounded p-1 text-muted hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => void launch("edit")}
        >
          {action === "edit" ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Code2 aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>
      <div
        className={
          kind === "projectWorkspace" ? "flex items-center gap-1" : "relative"
        }
      >
        {kind === "projectWorkspace" ? (
          <ThemedSelect
            id={inputId}
            value={path}
            disabled={disabled || action !== null || projectsLoading}
            aria-label={t("automation.projectWorkspace")}
            onChange={(event) => {
              setError(null);
              onChange(event.target.value);
            }}
            className="app-input w-full min-w-0"
          >
            <option value="">
              {t(
                projectsLoading ? "common.loading" : "automation.chooseProject",
              )}
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.path}>
                {project.name}
              </option>
            ))}
            {path && !projects.some((project) => project.path === path) && (
              <option value={path}>{path}</option>
            )}
          </ThemedSelect>
        ) : (
          <input
            id={inputId}
            value={value ?? ""}
            readOnly={readOnly}
            disabled={disabled || action !== null}
            onChange={(event) => {
              setError(null);
              onChange(event.target.value);
            }}
            placeholder={t(
              kind === "scriptDir"
                ? "automation.scriptDirPlaceholder"
                : "automation.workdirPlaceholder",
            )}
            aria-label={t(`automation.${kind}`)}
            title={path || undefined}
            className={`app-input w-full min-w-0 ${readOnly ? "" : "pr-11"}`}
          />
        )}
        {!readOnly && (
          <div
            className={
              kind === "projectWorkspace"
                ? "shrink-0"
                : "absolute bottom-0 right-1 flex gap-0.5"
            }
          >
            <button
              type="button"
              disabled={disabled || action !== null}
              title={t(chooseLabel)}
              aria-label={t(chooseLabel)}
              className={buttonClass}
              onClick={() => void launch("choose")}
            >
              {action === "choose" ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>
      {kind === "projectWorkspace" && path && (
        <p
          className="break-all text-[11px] leading-5 text-secondary"
          title={path}
        >
          {path}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      )}
      <p className="break-words text-[11px] leading-5 text-muted">
        {helpText ??
          t(
            kind === "scriptDir"
              ? "automation.defaultScriptDir"
              : kind === "projectWorkspace"
                ? "automation.projectWorkspaceHelp"
                : "automation.defaultWorkdir",
          )}
      </p>
    </div>
  );
}
