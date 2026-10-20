import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import * as api from "../lib/tauri";
import {
  GIT_REPOSITORIES_SETTING,
  createGitRepository,
  parseGitRepositoryLibrary,
  validGitRepositoryUrl,
  type GitRepositoryLibrary,
  type GitRepository,
} from "../lib/gitRepositories";
import { getErrorKind, getErrorMessage } from "../lib/error";

export interface GitInstallSelection {
  repo_path: string;
  name: string;
  overwrite_skill_id?: string;
}

export function useGitRepositories(onChanged: () => Promise<unknown>) {
  const [library, setLibrary] = useState<GitRepositoryLibrary>({
    repositories: [],
    activeId: null,
  });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [progress, setProgress] = useState<Record<string, string | undefined>>(
    {},
  );
  const [installing, setInstalling] = useState<{
    repositoryId: string;
    paths: string[];
    cloning: boolean;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);
  const current = useRef(library);
  const mounted = useRef(false);
  const loadVersion = useRef(0);
  const saveVersion = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const requests = useRef(new Set<string>());
  const installBusy = useRef(false);
  const addBusy = useRef(false);
  const clearBusy = useRef(false);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const persist = useCallback((snapshot: GitRepositoryLibrary) => {
    const version = ++saveVersion.current;
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await api.setSettings(
          GIT_REPOSITORIES_SETTING,
          JSON.stringify(snapshot),
        );
        if (mounted.current && version === saveVersion.current)
          setSaveError(null);
      } catch (error) {
        if (mounted.current && version === saveVersion.current) {
          setSaveError(getErrorMessage(error, i18next.t("common.error")));
        }
      }
    });
  }, []);

  const commit = useCallback(
    (update: (previous: GitRepositoryLibrary) => GitRepositoryLibrary) => {
      const next = update(current.current);
      current.current = next;
      setLibrary(next);
      persist(next);
    },
    [persist],
  );

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoadError(null);
    try {
      const value = parseGitRepositoryLibrary(
        await api.getSettings(GIT_REPOSITORIES_SETTING),
      );
      if (!mounted.current || version !== loadVersion.current) return;
      current.current = value;
      setLibrary(value);
      setReady(true);
    } catch (error) {
      if (mounted.current && version === loadVersion.current) {
        setLoadError(getErrorMessage(error, i18next.t("common.error")));
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const pendingRequests = requests.current;
    void load();
    return () => {
      mounted.current = false;
      for (const id of pendingRequests) {
        const repo = current.current.repositories.find(
          (item) => item.id === id,
        );
        if (repo) void api.cancelInstall(repo.url).catch(() => {});
      }
    };
  }, [load]);

  const refresh = useCallback(
    async (id: string) => {
      const repo = current.current.repositories.find((item) => item.id === id);
      if (
        !repo ||
        requests.current.has(id) ||
        installBusy.current ||
        clearBusy.current
      )
        return;
      requests.current.add(id);
      setErrors((previous) => ({ ...previous, [id]: undefined }));
      setProgress((previous) => ({
        ...previous,
        [id]: i18next.t("install.toast.cloning"),
      }));
      let tempDir: string | null = null;
      let unlisten: (() => void) | undefined;
      try {
        if (repo.kind === "remote")
          unlisten = await listen<{
            skill_id: string;
            phase: string;
            detail?: string;
          }>("install-progress", (event) => {
            if (
              mounted.current &&
              event.payload.skill_id === repo.url &&
              event.payload.detail
            ) {
              setProgress((previous) => ({
                ...previous,
                [id]: event.payload.detail,
              }));
            }
          });
        if (!mounted.current) return;
        const preview =
          repo.kind === "local"
            ? await api.previewLocalGitRepository(repo.url)
            : await api.previewGitInstall(repo.url);
        if ("temp_dir" in preview) tempDir = preview.temp_dir;
        if (!mounted.current) return;
        commit((previous) => ({
          ...previous,
          repositories: previous.repositories.map((item) =>
            item.id === id
              ? { ...item, skills: preview.skills, refreshedAt: Date.now() }
              : item,
          ),
        }));
      } catch (error) {
        if (mounted.current && getErrorKind(error) !== "cancelled") {
          setErrors((previous) => ({
            ...previous,
            [id]: getErrorMessage(error, i18next.t("common.error")),
          }));
        }
      } finally {
        unlisten?.();
        if (tempDir) await api.cancelGitPreview(tempDir).catch(() => {});
        requests.current.delete(id);
        if (mounted.current)
          setProgress((previous) => ({ ...previous, [id]: undefined }));
      }
    },
    [commit],
  );

  const add = async (
    url: string,
    name: string,
    kind: GitRepository["kind"],
  ): Promise<string | null> => {
    if (addBusy.current) return i18next.t("install.gitBrowser.working");
    if (kind === "remote" && !validGitRepositoryUrl(url))
      return i18next.t("install.gitBrowser.invalidUrl");
    addBusy.current = true;
    setAdding(true);
    try {
      const local =
        kind === "local" ? await api.previewLocalGitRepository(url) : null;
      if (!mounted.current) return null;
      const repo = createGitRepository(local?.path ?? url, name, kind);
      if (local) {
        repo.skills = local.skills;
        repo.refreshedAt = Date.now();
      }
      const existing = current.current.repositories.find(
        (item) => item.id === repo.id,
      );
      commit((previous) => ({
        repositories: existing
          ? previous.repositories
          : [...previous.repositories, repo],
        activeId: repo.id,
      }));
      if (!local && (!existing || existing.refreshedAt === null))
        void refresh(repo.id);
      return null;
    } catch (error) {
      return getErrorMessage(error, i18next.t("common.error"));
    } finally {
      addBusy.current = false;
      if (mounted.current) setAdding(false);
    }
  };

  const rename = (id: string, name: string) =>
    commit((previous) => ({
      ...previous,
      repositories: previous.repositories.map((repo) =>
        repo.id === id ? { ...repo, name: name.trim() || repo.name } : repo,
      ),
    }));

  const remove = (id: string) => {
    const repo = current.current.repositories.find((item) => item.id === id);
    if (
      !repo ||
      requests.current.has(id) ||
      installBusy.current ||
      clearBusy.current
    )
      return;
    commit((previous) => {
      const repositories = previous.repositories.filter(
        (item) => item.id !== id,
      );
      return {
        repositories,
        activeId:
          previous.activeId === id
            ? (repositories[0]?.id ?? null)
            : previous.activeId,
      };
    });
  };

  const install = async (
    id: string,
    selections: GitInstallSelection[],
  ): Promise<boolean> => {
    const repo = current.current.repositories.find((item) => item.id === id);
    if (
      !repo ||
      !selections.length ||
      installBusy.current ||
      requests.current.has(id) ||
      clearBusy.current
    )
      return false;
    const targets = selections.flatMap((item) =>
      item.overwrite_skill_id ? [item.overwrite_skill_id] : [],
    );
    if (new Set(targets).size !== targets.length) {
      setErrors((previous) => ({
        ...previous,
        [id]: i18next.t("install.gitBrowser.duplicateOverwrite"),
      }));
      return false;
    }
    installBusy.current = true;
    requests.current.add(id);
    setInstalling({
      repositoryId: id,
      paths: selections.map((item) => item.repo_path),
      cloning: repo.kind === "remote",
    });
    setErrors((previous) => ({ ...previous, [id]: undefined }));
    let tempDir: string | null = null;
    try {
      // The catalog outlives a preview checkout. Materialize a fresh snapshot for every install/retry.
      const preview =
        repo.kind === "local"
          ? await api.previewLocalGitRepository(repo.url)
          : await api.previewGitInstall(repo.url);
      if ("temp_dir" in preview) tempDir = preview.temp_dir;
      if (!mounted.current) return false;
      commit((previous) => ({
        ...previous,
        repositories: previous.repositories.map((item) =>
          item.id === id
            ? { ...item, skills: preview.skills, refreshedAt: Date.now() }
            : item,
        ),
      }));
      const items = selections.map((selection) => {
        const fresh = preview.skills.find(
          (item) => item.repo_path === selection.repo_path,
        );
        if (!fresh)
          throw new Error(i18next.t("install.gitBrowser.catalogChanged"));
        return {
          rel_path: fresh.rel_path,
          name: selection.name,
          ...(selection.overwrite_skill_id
            ? { overwrite_skill_id: selection.overwrite_skill_id }
            : {}),
        };
      });
      setInstalling({
        repositoryId: id,
        paths: selections.map((item) => item.repo_path),
        cloning: false,
      });
      if (repo.kind === "local") {
        for (const selection of selections)
          await api.installLocalGitSkill(
            repo.url,
            selection.repo_path,
            selection.name,
            selection.overwrite_skill_id,
          );
      } else if (tempDir) {
        await api.confirmGitInstall(repo.url, tempDir, items);
      }
      tempDir = null; // confirm cleans the checkout, including on backend failure.
      if (mounted.current)
        toast.success(
          i18next.t("install.toast.success", {
            name: selections.map((item) => item.name).join(", "),
          }),
        );
      return true;
    } catch (error) {
      if (mounted.current && getErrorKind(error) !== "cancelled")
        setErrors((previous) => ({
          ...previous,
          [id]: getErrorMessage(error, i18next.t("common.error")),
        }));
      return false;
    } finally {
      if (tempDir) await api.cancelGitPreview(tempDir).catch(() => {});
      // A batch may have partially succeeded; reconcile installed status on both outcomes.
      await changed.current().catch(() => {
        if (mounted.current)
          toast.error(i18next.t("install.gitBrowser.statusRefreshFailed"));
      });
      installBusy.current = false;
      requests.current.delete(id);
      if (mounted.current) setInstalling(null);
    }
  };

  const clearCache = async (id: string): Promise<boolean> => {
    const repo = current.current.repositories.find((item) => item.id === id);
    if (
      !repo ||
      repo.kind !== "remote" ||
      requests.current.has(id) ||
      installBusy.current ||
      clearBusy.current
    )
      return false;
    clearBusy.current = true;
    setClearing(id);
    try {
      await api.clearGitRepositoryCache(repo.url);
      if (!mounted.current) return true;
      commit((previous) => ({
        ...previous,
        repositories: previous.repositories.map((item) =>
          item.id === id ? { ...item, skills: [], refreshedAt: null } : item,
        ),
      }));
      setErrors((previous) => ({ ...previous, [id]: undefined }));
      toast.success(i18next.t("install.gitBrowser.cacheCleared"));
      return true;
    } catch (error) {
      if (mounted.current)
        setErrors((previous) => ({
          ...previous,
          [id]: getErrorMessage(error, i18next.t("common.error")),
        }));
      return false;
    } finally {
      clearBusy.current = false;
      if (mounted.current) setClearing(null);
    }
  };

  return {
    ...library,
    ready,
    loadError,
    saveError,
    errors,
    progress,
    installing,
    adding,
    clearing,
    load,
    add,
    rename,
    remove,
    refresh,
    install,
    clearCache,
    retrySave: () => persist(current.current),
    select: (id: string) =>
      commit((previous) => ({ ...previous, activeId: id })),
    cancel: (id: string) => {
      const repo = current.current.repositories.find((item) => item.id === id);
      if (repo)
        void api
          .cancelInstall(repo.url)
          .catch((error: unknown) =>
            toast.error(getErrorMessage(error, i18next.t("common.error"))),
          );
    },
  };
}
