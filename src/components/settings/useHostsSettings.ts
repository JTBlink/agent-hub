import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import * as api from "../../lib/hostsApi";
import { openPathInVscode } from "../../lib/openInVscode";
import { describeHostsError, hostsEditorText } from "./hostsPresentation";

type Source = api.HostsSnapshot | api.HostsProfile;
const isProfile = (source: Source | null): source is api.HostsProfile =>
  !!source && "id" in source;
interface Model {
  system: api.HostsSnapshot | null;
  profiles: api.HostsProfile[];
  source: Source | null;
  draft: string;
  readAt: Date | null;
}
const edited = (model: Model) =>
  !!model.source && model.draft !== hostsEditorText(model.source.content);

export function useHostsSettings(active: boolean) {
  const { t } = useTranslation();
  const [model, setModel] = useState<Model>({
    system: null,
    profiles: [],
    source: null,
    draft: "",
    readAt: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<
    typeof describeHostsError
  > | null>(null);
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  const failedAction = useRef<(() => Promise<void>) | null>(null);
  const current = useRef(model);
  current.current = model;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (pending.current) return false;
      pending.current = true;
      setBusy(true);
      setError(null);
      setNotice("");
      try {
        await action();
        failedAction.current = null;
        return true;
      } catch (cause) {
        failedAction.current = action;
        if (mounted.current) setError(describeHostsError(cause, t));
        return false;
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [t],
  );

  const load = useCallback(
    (discard = false) =>
      run(async () => {
        const [systemResult, profilesResult] = await Promise.allSettled([
          api.readSystemHosts(),
          api.listHostsProfiles(),
        ]);
        if (!mounted.current) return;
        setModel((previous) => {
          const system =
            systemResult.status === "fulfilled"
              ? systemResult.value
              : previous.system;
          const profiles =
            profilesResult.status === "fulfilled"
              ? profilesResult.value
              : previous.profiles;
          const previousSource = previous.source;
          const fresh = isProfile(previousSource)
            ? (profiles.find((p) => p.id === previousSource.id) ?? system)
            : system;
          const canReload = isProfile(previousSource)
            ? profilesResult.status === "fulfilled"
            : systemResult.status === "fulfilled";
          const keepDraft = edited(previous) && (!discard || !canReload);
          return {
            system,
            profiles,
            source: keepDraft ? previous.source : fresh,
            draft: keepDraft
              ? previous.draft
              : hostsEditorText(fresh?.content ?? ""),
            readAt:
              systemResult.status === "fulfilled"
                ? new Date()
                : previous.readAt,
          };
        });
        const failure =
          systemResult.status === "rejected"
            ? systemResult.reason
            : profilesResult.status === "rejected"
              ? profilesResult.reason
              : null;
        if (failure) throw failure;
        if (
          systemResult.status === "fulfilled" &&
          systemResult.value.backup_warning
        ) {
          setError({
            message: t("hosts.backupWarning", {
              message: systemResult.value.backup_warning,
            }),
            permission: false,
          });
        }
      }),
    [run, t],
  );

  useEffect(() => {
    if (active) void load();
  }, [active, load]);
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      void load();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    const unlisten = listen("app-files-changed", refresh).catch(() => null);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
      void unlisten.then((stop) => stop?.());
    };
  }, [active, load]);
  const dirty = edited(model);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const select = (profile: api.HostsProfile | null) => {
    const source = profile ?? current.current.system;
    setModel((m) => ({
      ...m,
      source,
      draft: hostsEditorText(source?.content ?? ""),
    }));
    setNotice("");
    setError(null);
  };
  const setDraft = (draft: string) => {
    setModel((m) => ({ ...m, draft }));
    setNotice("");
  };
  const save = () =>
    run(async () => {
      const { source, draft } = current.current;
      if (!source) return;
      if (isProfile(source)) {
        const next = await api.updateHostsProfile(source, source.name, draft);
        if (!mounted.current) return;
        setModel((m) => ({
          ...m,
          profiles: m.profiles.map((p) => (p.id === next.id ? next : p)),
          source: next,
          draft: hostsEditorText(next.content),
        }));
        setNotice(t("hosts.profileSaved"));
      } else {
        const result = await api.saveSystemHosts(draft, source.revision);
        if (!mounted.current) return;
        setModel((m) => ({
          ...m,
          system: result.snapshot,
          source: result.snapshot,
          draft: hostsEditorText(result.snapshot.content),
          readAt: new Date(),
        }));
        setNotice(t("hosts.saved"));
        if (result.snapshot.backup_warning)
          setError({
            message: t("hosts.backupWarning", {
              message: result.snapshot.backup_warning,
            }),
            permission: false,
          });
      }
    });
  const apply = (profile: api.HostsProfile) =>
    run(async () => {
      const system = current.current.system;
      if (!system) return;
      const result = await api.applyHostsProfile(profile, system.revision);
      if (!mounted.current) return;
      setModel((m) => ({
        ...m,
        system: result.snapshot,
        ...(!isProfile(m.source)
          ? {
              source: result.snapshot,
              draft: hostsEditorText(result.snapshot.content),
            }
          : {}),
        readAt: new Date(),
      }));
      setNotice(t("hosts.applied", { name: profile.name }));
      if (result.snapshot.backup_warning)
        setError({
          message: t("hosts.backupWarning", {
            message: result.snapshot.backup_warning,
          }),
          permission: false,
        });
    });
  const create = (name: string, content: string) =>
    run(async () => {
      const next = await api.createHostsProfile(name, content);
      if (!mounted.current) return;
      setModel((m) => ({
        ...m,
        profiles: [...m.profiles, next],
        source: next,
        draft: hostsEditorText(next.content),
      }));
      setNotice(t("hosts.profileSaved"));
    });
  const rename = (name: string) =>
    run(async () => {
      const source = current.current.source;
      if (!isProfile(source)) return;
      const next = await api.updateHostsProfile(source, name, source.content);
      if (!mounted.current) return;
      setModel((m) => ({
        ...m,
        source: next,
        profiles: m.profiles.map((p) => (p.id === next.id ? next : p)),
      }));
      setNotice(t("hosts.renamed"));
    });
  const remove = () =>
    run(async () => {
      const source = current.current.source;
      if (!isProfile(source)) return;
      await api.deleteHostsProfile(source);
      if (!mounted.current) return;
      setModel((m) => ({
        ...m,
        profiles: m.profiles.filter((p) => p.id !== source.id),
        source: m.system,
        draft: hostsEditorText(m.system?.content ?? ""),
      }));
      setNotice(t("hosts.deleted"));
    });
  const openVscode = () =>
    run(async () => {
      const source = current.current.source;
      if (!source) return;
      await openPathInVscode(source.path);
      if (mounted.current) setNotice(t("hosts.openedVscode"));
    });
  const profile = isProfile(model.source) ? model.source : null;
  const latest = profile
    ? model.profiles.find((p) => p.id === profile.id)
    : model.system;
  const externalChange =
    !!model.source && latest?.revision !== model.source.revision;
  return {
    ...model,
    profile,
    dirty,
    busy,
    error,
    notice,
    externalChange,
    load,
    select,
    setDraft,
    save,
    apply,
    create,
    rename,
    remove,
    openVscode,
    retry: () =>
      failedAction.current ? run(failedAction.current) : Promise.resolve(false),
  };
}
