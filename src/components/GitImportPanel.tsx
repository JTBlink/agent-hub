import { ThemedSelect } from "./ThemedSelect";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ManagedSkill } from "../lib/tauri";
import type { GitRepository } from "../lib/gitRepositories";
import { useGitRepositories } from "../hooks/useGitRepositories";
import { getErrorMessage } from "../lib/error";
import { CardActionMenu } from "./CardActionMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { GitRepositorySkills } from "./GitRepositorySkills";

export function GitImportPanel({
  managedSkills,
  onChanged,
  onOpenInstalled,
}: {
  managedSkills: ManagedSkill[];
  onChanged: () => Promise<unknown>;
  onOpenInstalled: (id: string) => void;
}) {
  const { t } = useTranslation();
  const browser = useGitRepositories(onChanged);
  const active = browser.repositories.find(
    (repo) => repo.id === browser.activeId,
  );
  const [form, setForm] = useState<"add" | "rename" | null>(null);
  const [kind, setKind] = useState<GitRepository["kind"]>("remote");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [clearId, setClearId] = useState<string | null>(null);
  const refreshing = active ? browser.progress[active.id] : undefined;
  const disabled = !!browser.installing || !!refreshing || !!browser.clearing;

  if (!browser.ready) {
    return (
      <div className="app-panel p-5" aria-busy={!browser.loadError}>
        {browser.loadError ? (
          <div role="alert" className="space-y-3 text-[13px] text-danger">
            <p>
              {t("install.gitBrowser.loadFailed")}: {browser.loadError}
            </p>
            <button
              onClick={() => void browser.load()}
              className="app-button-secondary"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : (
          <Loader2
            aria-label={t("common.loading")}
            className="h-5 w-5 animate-spin text-muted"
          />
        )}
      </div>
    );
  }

  const showForm = form !== null || browser.repositories.length === 0;
  const openAdd = () => {
    setForm("add");
    setKind("remote");
    setUrl("");
    setName("");
    setFormError(null);
  };
  const pickLocal = async () => {
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: t("install.gitBrowser.chooseLocal"),
      });
      if (typeof path === "string") {
        setUrl(path);
        setFormError(null);
      }
    } catch (error) {
      setFormError(getErrorMessage(error, t("common.error")));
    }
  };
  return (
    <div className="space-y-4">
      <div className="app-panel flex flex-wrap items-center gap-2 p-3">
        <GitBranch
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-accent-light"
        />
        <label className="min-w-0 flex-1 basis-44">
          <span className="sr-only">{t("install.gitBrowser.repository")}</span>
          <ThemedSelect
            value={active?.id ?? ""}
            disabled={!active || browser.adding}
            onChange={(event) => {
              browser.select(event.target.value);
              setForm(null);
            }}
            className="app-input w-full"
          >
            {!active && (
              <option value="">
                {t("install.gitBrowser.chooseRepository")}
              </option>
            )}
            {browser.repositories.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name} · {repo.skills.length}
                {repo.kind === "local"
                  ? ` · ${t("install.gitBrowser.local")}`
                  : ""}
              </option>
            ))}
          </ThemedSelect>
        </label>
        <button
          type="button"
          disabled={browser.adding}
          onClick={openAdd}
          className="app-button-primary"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          {t("install.gitBrowser.add")}
        </button>
        {active && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void browser.refresh(active.id)}
              className="app-button-secondary"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              {t("install.gitBrowser.refresh")}
            </button>
            <CardActionMenu
              label={t("install.gitBrowser.manageRepository")}
              actions={[
                {
                  key: "rename",
                  label: t("install.gitBrowser.rename"),
                  icon: <Pencil className="h-3.5 w-3.5" />,
                  disabled,
                  onSelect: () => {
                    setForm("rename");
                    setName(active.name);
                    setFormError(null);
                  },
                },
                ...(active.kind === "remote"
                  ? [
                      {
                        key: "clear",
                        label: t("install.gitBrowser.clearCache"),
                        icon: <Trash2 className="h-3.5 w-3.5" />,
                        disabled,
                        onSelect: () => setClearId(active.id),
                      },
                    ]
                  : []),
                {
                  key: "remove",
                  label: t("install.gitBrowser.remove"),
                  icon: <Trash2 className="h-3.5 w-3.5" />,
                  danger: true,
                  disabled,
                  onSelect: () => setRemoveId(active.id),
                },
              ]}
            />
          </>
        )}
      </div>

      {browser.saveError && (
        <div
          role="alert"
          className="app-panel flex flex-wrap items-center justify-between gap-2 p-3 text-[13px] text-danger"
        >
          <span>
            {t("install.gitBrowser.saveFailed")}: {browser.saveError}
          </span>
          <button className="app-button-secondary" onClick={browser.retrySave}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {showForm && (
        <form
          className="app-panel space-y-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (form === "rename" && active) {
              browser.rename(active.id, name);
              setForm(null);
              return;
            }
            void browser.add(url, name, kind).then((error) => {
              setFormError(error);
              if (!error) {
                setForm(null);
                setUrl("");
                setName("");
              }
            });
          }}
        >
          <div>
            <h2 className="text-[14px] font-semibold text-primary">
              {t(
                form === "rename"
                  ? "install.gitBrowser.rename"
                  : "install.gitBrowser.add",
              )}
            </h2>
            {form !== "rename" && (
              <p className="mt-1 text-[13px] text-muted">
                {t(
                  kind === "local"
                    ? "install.gitBrowser.localDescription"
                    : "install.gitDesc",
                )}
              </p>
            )}
          </div>
          <fieldset disabled={browser.adding} className="space-y-3">
            {form !== "rename" && (
              <label className="block text-[13px] text-tertiary">
                {t("install.gitBrowser.sourceType")}
                <ThemedSelect
                  value={kind}
                  onChange={(event) => {
                    setKind(
                      event.target.value === "local" ? "local" : "remote",
                    );
                    setUrl("");
                    setFormError(null);
                  }}
                  className="app-input ml-3"
                >
                  <option value="remote">
                    {t("install.gitBrowser.remote")}
                  </option>
                  <option value="local">{t("install.gitBrowser.local")}</option>
                </ThemedSelect>
              </label>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {form !== "rename" && (
                <div>
                  <label
                    className="text-[13px] text-tertiary"
                    htmlFor="git-repository-location"
                  >
                    {t(
                      kind === "local"
                        ? "install.gitBrowser.localPath"
                        : "install.repoUrl",
                    )}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id="git-repository-location"
                      type="text"
                      value={url}
                      required
                      readOnly={kind === "local"}
                      aria-invalid={!!formError}
                      aria-describedby={
                        formError ? "git-repository-error" : undefined
                      }
                      onChange={(event) => {
                        setUrl(event.target.value);
                        setFormError(null);
                      }}
                      placeholder={t(
                        kind === "local"
                          ? "install.gitBrowser.chooseLocal"
                          : "install.gitBrowser.urlPlaceholder",
                      )}
                      className="app-input min-w-0 flex-1"
                    />
                    {kind === "local" && (
                      <button
                        type="button"
                        onClick={() => void pickLocal()}
                        aria-label={t("install.gitBrowser.chooseLocal")}
                        className="app-button-secondary"
                      >
                        <FolderOpen aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              <label className="text-[13px] text-tertiary">
                {t("install.gitBrowser.repositoryName")}
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("install.gitBrowser.namePlaceholder")}
                  className="app-input mt-1 w-full"
                />
              </label>
            </div>
          </fieldset>
          {formError && (
            <p
              id="git-repository-error"
              role="alert"
              className="text-[13px] text-danger"
            >
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {active && (
              <button
                type="button"
                disabled={browser.adding}
                onClick={() => setForm(null)}
                className="app-button-secondary"
              >
                {t("common.cancel")}
              </button>
            )}
            <button
              type="submit"
              disabled={browser.adding || (form !== "rename" && !url.trim())}
              className="app-button-primary"
            >
              {browser.adding && (
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin"
                />
              )}
              {t(
                form === "rename"
                  ? "common.save"
                  : "install.gitBrowser.addAndLoad",
              )}
            </button>
          </div>
        </form>
      )}

      {active && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2 px-1">
            <div className="min-w-0 flex-1">
              <p title={active.url} className="truncate text-[12px] text-muted">
                {active.url}
              </p>
              {active.refreshedAt && (
                <p className="mt-1 text-[12px] text-muted">
                  {t("install.gitBrowser.refreshedAt", {
                    time: new Date(active.refreshedAt).toLocaleString(),
                  })}
                </p>
              )}
            </div>
            {((refreshing && active.kind === "remote") ||
              (browser.installing?.repositoryId === active.id &&
                browser.installing.cloning)) && (
              <button
                type="button"
                onClick={() => browser.cancel(active.id)}
                className="app-button-secondary"
              >
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin"
                />
                {t("install.cancel")}
              </button>
            )}
          </div>
          {refreshing && (
            <p
              role="status"
              className="break-words px-1 text-[13px] text-muted"
            >
              {active.kind === "local"
                ? t("install.gitBrowser.working")
                : refreshing}
            </p>
          )}
          {browser.errors[active.id] && (
            <div
              role="alert"
              className="app-panel flex flex-wrap items-center justify-between gap-2 p-3 text-[13px] text-danger"
            >
              <span className="min-w-0 flex-1 break-words">
                {browser.errors[active.id]}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void browser.refresh(active.id)}
                className="app-button-secondary"
              >
                {t("install.gitBrowser.refresh")}
              </button>
            </div>
          )}
          {active.refreshedAt !== null || active.skills.length > 0 ? (
            <GitRepositorySkills
              key={active.id}
              repository={active}
              managedSkills={managedSkills}
              disabled={disabled}
              busyPaths={
                browser.installing?.repositoryId === active.id
                  ? browser.installing.paths
                  : []
              }
              onInstall={(items) => browser.install(active.id, items)}
              onSync={(path, skillId, approval) =>
                browser.syncToRepository(active.id, path, skillId, approval)
              }
              onRefresh={() => void browser.refresh(active.id)}
              onOpenInstalled={onOpenInstalled}
            />
          ) : (
            !refreshing && (
              <div className="app-panel p-10 text-center text-[13px] text-muted">
                <p>{t("install.gitBrowser.notLoaded")}</p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void browser.refresh(active.id)}
                  className="app-button-secondary mt-3"
                >
                  {t("install.gitBrowser.refresh")}
                </button>
              </div>
            )
          )}
        </>
      )}

      <ConfirmDialog
        open={!!removeId}
        title={t("install.gitBrowser.remove")}
        message={t("install.gitBrowser.removeMessage", {
          name:
            browser.repositories.find((repo) => repo.id === removeId)?.name ??
            "",
        })}
        confirmLabel={t("install.gitBrowser.remove")}
        onClose={() => setRemoveId(null)}
        onConfirm={async () => {
          if (removeId) browser.remove(removeId);
        }}
      />
      <ConfirmDialog
        open={!!clearId}
        title={t("install.gitBrowser.clearCache")}
        message={t("install.gitBrowser.clearMessage")}
        confirmLabel={t("install.gitBrowser.clearCache")}
        onClose={() => setClearId(null)}
        onConfirm={async () => {
          if (clearId && !(await browser.clearCache(clearId))) return false;
        }}
      />
    </div>
  );
}
