import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useDeferredValue,
} from "react";
import {
  UploadCloud,
  Github,
  Box,
  Star,
  TrendingUp,
  Clock,
  FolderUp,
  Loader2,
  FolderInput,
  ChevronLeft,
  ChevronRight,
  Search,
  Link2,
  SquareCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import type {
  ScanResult,
  SkillsShSkill,
  BatchImportResult,
  GitPreviewResult,
} from "../lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";
import { useSearchParams, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { StatusBanner } from "../components/StatusBanner";
import { LocalSkillsPanel } from "../components/LocalSkillsPanel";
import { LocalImportErrorDialog } from "../components/LocalImportErrorDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { GitImportPanel } from "../components/GitImportPanel";
import type { GitSelection } from "../components/GitImportPanel";
import { MarketSkillCard } from "../components/MarketSkillCard";
import { MultiSelectToolbar } from "../components/MultiSelectToolbar";
import { SourceFilterBar } from "../components/SourceFilterBar";
import { useMultiSelect } from "../hooks/useMultiSelect";
import { getErrorMessage, getErrorKind } from "../lib/error";

const MARKET_PAGE_SIZE = 24;
const MARKET_SEARCH_STEP = 60;
const MARKET_SEARCH_DEBOUNCE_MS = 450;
const MARKET_SEARCH_CACHE_TTL_MS = 120_000;
const MARKET_SEARCH_CACHE_MAX_ENTRIES = 150;

export function InstallSkills() {
  const { t } = useTranslation();
  const {
    refreshSkillGroups,
    refreshManagedSkills,
    refreshTools,
    managedSkills,
    openSkillDetailById,
  } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"market" | "local" | "git">(
    "market",
  );
  const [marketTab, setMarketTab] = useState<"hot" | "trending" | "alltime">(
    "alltime",
  );
  const [marketQuery, setMarketQuery] = useState("");
  const [marketSourceFilter, setMarketSourceFilter] = useState("all");
  const [marketInstalledFilter, setMarketInstalledFilter] = useState(false);
  const [marketSkills, setMarketSkills] = useState<SkillsShSkill[]>([]);
  const [marketPage, setMarketPage] = useState(1);
  const [marketSearchLimit, setMarketSearchLimit] =
    useState(MARKET_SEARCH_STEP);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketLoadingMore, setMarketLoadingMore] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketReloadKey, setMarketReloadKey] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [gitLoading, setGitLoading] = useState(false);
  const [gitCancelKey, setGitCancelKey] = useState<string | null>(null);
  const [gitPreview, setGitPreview] = useState<GitPreviewResult | null>(null);
  const [gitPreviewRepoUrl, setGitPreviewRepoUrl] = useState<string | null>(
    null,
  );
  const [gitSelections, setGitSelections] = useState<GitSelection[]>([]);
  const [gitConfirmLoading, setGitConfirmLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localImportError, setLocalImportError] = useState<string | null>(null);
  const [importingPaths, setImportingPaths] = useState<Set<string>>(new Set());
  const [importingAll, setImportingAll] = useState(false);
  const [uninstallConfirm, setUninstallConfirm] =
    useState<SkillsShSkill | null>(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState<{
    type: "single" | "all" | "local" | "batch" | "skillssh" | "batch-link";
    names: string[];
    sourcePath?: string;
    importName?: string;
    folderPath?: string;
    skillsshSkill?: SkillsShSkill;
    batchLinkSkills?: SkillsShSkill[];
  } | null>(null);
  const [batchLinking, setBatchLinking] = useState(false);
  const marketListRef = useRef<HTMLDivElement | null>(null);
  const marketSearchCacheRef = useRef<
    Map<string, { timestamp: number; data: SkillsShSkill[] }>
  >(new Map());
  const marketSkillsLengthRef = useRef(0);
  const [debouncedMarketQuery, setDebouncedMarketQuery] = useState("");
  const deferredMarketQuery = useDeferredValue(marketQuery);

  const managedSkillsRef = useRef(managedSkills);
  managedSkillsRef.current = managedSkills;

  const goToSkill = useCallback(
    (skillName: string) => {
      // Use ref to get the latest managedSkills after refresh
      const skills = managedSkillsRef.current;
      const skill = skills.find(
        (s) => s.name === skillName || s.source_ref === skillName,
      );
      if (skill) {
        openSkillDetailById(skill.id);
      }
      navigate("/my-skills");
    },
    [navigate, openSkillDetailById],
  );

  const pruneMarketSearchCache = useCallback(() => {
    const now = Date.now();
    const entries = Array.from(marketSearchCacheRef.current.entries());

    for (const [key, value] of entries) {
      if (now - value.timestamp >= MARKET_SEARCH_CACHE_TTL_MS) {
        marketSearchCacheRef.current.delete(key);
      }
    }

    if (marketSearchCacheRef.current.size <= MARKET_SEARCH_CACHE_MAX_ENTRIES) {
      return;
    }

    const sorted = Array.from(marketSearchCacheRef.current.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    const removeCount =
      marketSearchCacheRef.current.size - MARKET_SEARCH_CACHE_MAX_ENTRIES;
    for (const [key] of sorted.slice(0, removeCount)) {
      marketSearchCacheRef.current.delete(key);
    }
  }, []);

  const installedSourceRefs = useMemo(() => {
    const set = new Set<string>();
    for (const skill of managedSkills) {
      if (skill.source_type === "skillssh" && skill.source_ref) {
        set.add(skill.source_ref);
      }
    }
    return set;
  }, [managedSkills]);

  const installedDirNames = useMemo(() => {
    const set = new Set<string>();
    for (const skill of managedSkills) {
      if (skill.source_type === "skillssh" && skill.source_ref) continue;
      const dirName = skill.central_path.split("/").pop();
      if (dirName) {
        set.add(dirName.toLowerCase());
      }
    }
    return set;
  }, [managedSkills]);

  const installedSourceBySkillId = useMemo(() => {
    const map = new Map<string, string>();
    for (const skill of managedSkills) {
      if (skill.source_type === "skillssh" && skill.source_ref) {
        const parts = skill.source_ref.split("/");
        const id = parts.pop();
        if (id) {
          map.set(id.toLowerCase(), parts.join("/"));
        }
      }
    }
    return map;
  }, [managedSkills]);

  const findInstalledByGitUrl = useCallback(
    (url: string) => {
      const trimmed = url
        .trim()
        .replace(/\.git$/, "")
        .toLowerCase();
      return managedSkills.find((s) => {
        if (!s.source_ref) return false;
        const ref = s.source_ref.replace(/\.git$/, "").toLowerCase();
        return (
          ref === trimmed ||
          ref.endsWith("/" + trimmed.split("/").slice(-2).join("/"))
        );
      });
    },
    [managedSkills],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMarketQuery(deferredMarketQuery);
    }, MARKET_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [deferredMarketQuery]);

  useEffect(() => {
    marketSkillsLengthRef.current = marketSkills.length;
  }, [marketSkills.length]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "market" || tab === "local" || tab === "git") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const switchTab = (tab: "market" | "local" | "git") => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const runScan = useCallback(async () => {
    setScanLoading(true);
    setLocalError(null);
    try {
      const result = await api.scanLocalSkills();
      setScanResult(result);
    } catch (error: unknown) {
      console.error(error);
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    } finally {
      setScanLoading(false);
    }
  }, [t]);

  // Silent variant used after install/import. Never surfaces a toast or
  // new error state — failure here must not mask the install success.
  // Clears any stale localError on success so successful operations don't
  // leave previous error banners behind.
  const runScanSilent = useCallback(async () => {
    try {
      const result = await api.scanLocalSkills();
      setScanResult(result);
      setLocalError(null);
    } catch (error: unknown) {
      console.warn("silent scan failed:", error);
    }
  }, []);

  const warnRejected = (
    results: PromiseSettledResult<unknown>[],
    label: string,
  ) => {
    for (const r of results) {
      if (r.status === "rejected") console.warn(`${label} failed:`, r.reason);
    }
  };

  useEffect(() => {
    if (activeTab !== "market") return;

    const query = debouncedMarketQuery.trim();
    const loadingMore =
      query.length > 0 &&
      marketSkillsLengthRef.current > 0 &&
      marketSearchLimit > marketSkillsLengthRef.current;

    if (query.length > 0 && !loadingMore) {
      const cacheKey = `${query.toLowerCase()}|${marketSearchLimit}`;
      const cached = marketSearchCacheRef.current.get(cacheKey);
      if (
        cached &&
        Date.now() - cached.timestamp < MARKET_SEARCH_CACHE_TTL_MS
      ) {
        setMarketSkills(cached.data);
        setMarketLoading(false);
        setMarketLoadingMore(false);
        setMarketPage(1);
        setMarketError(null);
        return;
      }
    }

    setMarketLoadingMore(loadingMore);
    setMarketLoading(true);
    if (!loadingMore) {
      setMarketPage(1);
    }
    setMarketError(null);

    let stale = false;
    const request = query
      ? api.searchSkillssh(query, marketSearchLimit)
      : api.fetchLeaderboard(marketTab);

    request
      .then((result) => {
        if (stale) return;
        setMarketSkills(result);
        if (query.length > 0 && !loadingMore) {
          const cacheKey = `${query.toLowerCase()}|${marketSearchLimit}`;
          marketSearchCacheRef.current.set(cacheKey, {
            timestamp: Date.now(),
            data: result,
          });
          pruneMarketSearchCache();
        }
        if (!loadingMore) {
          setMarketSourceFilter("all");
        }
      })
      .catch((e) => {
        if (stale) return;
        console.error(e);
        const message = e?.toString?.() || t("common.error");
        setMarketError(message);
        toast.error(message);
      })
      .finally(() => {
        if (stale) return;
        setMarketLoading(false);
        setMarketLoadingMore(false);
      });

    return () => {
      stale = true;
    };
  }, [
    activeTab,
    debouncedMarketQuery,
    marketReloadKey,
    marketSearchLimit,
    marketTab,
    pruneMarketSearchCache,
    t,
  ]);

  useEffect(() => {
    if (activeTab === "local" && !scanResult && !scanLoading) {
      runScan();
    }
  }, [activeTab, scanLoading, scanResult, runScan]);

  const installLocalSource = async (
    sourcePath: string,
    overwrite?: boolean,
  ) => {
    setLocalError(null);
    const name = sourcePath.split("/").pop() || sourcePath;

    if (!overwrite) {
      try {
        const conflict = await api.checkInstallLocalConflict(sourcePath);
        if (conflict) {
          setOverwriteConfirm({
            type: "local",
            names: [conflict],
            sourcePath,
          });
          return;
        }
      } catch {
        // conflict check failed — proceed with install
      }
    }

    const toastId = toast.loading(t("install.toast.installing", { name }));
    try {
      await api.installLocal(sourcePath, undefined, overwrite);
    } catch (e) {
      const rawMessage = getErrorMessage(e, t("common.error"));
      const message = rawMessage.includes("INVALID_SKILL_SOURCE")
        ? t("install.local.invalidSource")
        : rawMessage;
      setLocalImportError(message);
      toast.dismiss(toastId);
      return;
    }
    // Install succeeded — post-install refresh is best-effort and must not
    // surface as an install failure.
    const results = await Promise.allSettled([
      refreshSkillGroups(),
      refreshManagedSkills(),
      runScanSilent(),
    ]);
    warnRejected(results, "post-install refresh");
    toast.success(t("install.toast.success", { name }), {
      id: toastId,
      action: {
        label: t("install.toast.view"),
        onClick: () => goToSkill(name),
      },
    });
  };

  const handleLocalFolderInstall = async () => {
    try {
      const selected = await api.pickDirectory();
      if (!selected) return;
      installLocalSource(selected);
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    }
  };

  const handleLocalFileInstall = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Skills", extensions: ["zip", "skill"] }],
      });
      if (!selected) return;
      installLocalSource(selected as string);
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    }
  };

  const handleBatchImportFolder = async (overwriteFolder?: string) => {
    let unlisten: (() => void) | null = null;
    try {
      const selected = overwriteFolder ?? (await api.pickDirectory());
      if (!selected) return;

      if (!overwriteFolder) {
        try {
          const conflicts = await api.checkBatchImportConflicts(
            selected as string,
          );
          if (conflicts.length > 0) {
            setOverwriteConfirm({
              type: "batch",
              names: conflicts,
              folderPath: selected as string,
            });
            return;
          }
        } catch {
          // conflict check failed — proceed with import
        }
      }

      const toastId = toast.loading(t("install.local.batchImporting"));

      unlisten = await listen<{ current: number; total: number; name: string }>(
        "batch-import-progress",
        (event) => {
          const { current, total, name } = event.payload;
          toast.loading(
            t("install.local.batchProgress", { current, total, name }),
            { id: toastId },
          );
        },
      );

      const result: BatchImportResult = await api.batchImportFolder(
        selected as string,
        !!overwriteFolder,
      );

      if (result.errors.length > 0) {
        const previewErrors = result.errors.slice(0, 3).join("; ");
        const remaining = result.errors.length - 3;
        const detail =
          remaining > 0
            ? `${previewErrors}; +${remaining} more`
            : previewErrors;
        toast.error(
          `${t("install.local.batchErrors", { count: result.errors.length })}: ${detail}`,
          { id: toastId },
        );
      } else if (result.imported === 0) {
        toast.info(
          t("install.local.batchAllSkipped", { skipped: result.skipped }),
          { id: toastId },
        );
      } else {
        toast.success(
          t("install.local.batchSuccess", {
            imported: result.imported,
            skipped: result.skipped,
          }),
          { id: toastId },
        );
      }

      await Promise.all([refreshSkillGroups(), refreshManagedSkills()]);
      runScan();
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    } finally {
      unlisten?.();
    }
  };

  const handleInstallSkillssh = async (
    skill: SkillsShSkill,
    overwrite?: boolean,
  ) => {
    const displayName = skill.name || skill.skill_id;
    const cancelKey = `${skill.source}/${skill.skill_id}`;

    if (!overwrite) {
      try {
        const conflict = await api.checkSkillsshConflict(skill.skill_id);
        if (conflict) {
          setOverwriteConfirm({
            type: "skillssh",
            names: [conflict],
            skillsshSkill: skill,
          });
          return;
        }
      } catch {
        // conflict check failed — proceed with install
      }
    }

    setInstalling(skill.id);

    const toastId = toast.loading(t("install.toast.cloning"));
    let unlisten: (() => void) | null = null;

    try {
      unlisten = await listen<{
        skill_id: string;
        phase: string;
        detail?: string;
      }>("install-progress", (event) => {
        if (event.payload.skill_id !== cancelKey) return;
        if (event.payload.phase === "cloning") {
          const detail = event.payload.detail?.trim();
          const msg = detail
            ? `${t("install.toast.cloning")}\n${detail}`
            : t("install.toast.cloning");
          toast.loading(msg, { id: toastId });
        } else if (event.payload.phase === "installing") {
          toast.loading(t("install.toast.installing", { name: displayName }), {
            id: toastId,
          });
        }
      });
      await api.installFromSkillssh(skill.source, skill.skill_id, overwrite);
      await Promise.all([refreshSkillGroups(), refreshManagedSkills()]);
      toast.success(t("install.toast.success", { name: displayName }), {
        id: toastId,
        action: {
          label: t("install.toast.view"),
          onClick: () => goToSkill(displayName),
        },
      });
    } catch (error: unknown) {
      console.error("[skillssh] install error:", JSON.stringify(error), error);
      if (getErrorKind(error) === "cancelled") {
        toast.info(t("install.toast.cancelled"), { id: toastId });
      } else {
        toast.error(getErrorMessage(error, t("common.error")), { id: toastId });
      }
    } finally {
      setInstalling(null);
      unlisten?.();
    }
  };

  const handleBatchLinkToMarket = async (skills: SkillsShSkill[]) => {
    if (skills.length === 0) return;
    setBatchLinking(true);
    const toastId = toast.loading(
      t("install.batchLinkProgress", {
        current: 1,
        total: skills.length,
        name: skills[0].name || skills[0].skill_id,
      }),
    );
    let success = 0;
    const failedNames: string[] = [];
    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const displayName = skill.name || skill.skill_id;
      toast.loading(
        t("install.batchLinkProgress", {
          current: i + 1,
          total: skills.length,
          name: displayName,
        }),
        { id: toastId },
      );
      try {
        await api.installFromSkillssh(skill.source, skill.skill_id, true);
        success++;
      } catch (error) {
        console.error(
          `[batch-link] failed: ${skill.source}/${skill.skill_id}`,
          error,
        );
        failedNames.push(displayName);
      }
    }
    await Promise.allSettled([refreshSkillGroups(), refreshManagedSkills()]);
    setBatchLinking(false);
    exitMarketMultiSelect();
    if (failedNames.length === 0) {
      toast.success(t("install.batchLinkSuccess", { count: success }), {
        id: toastId,
      });
    } else {
      toast.warning(
        t("install.batchLinkPartial", { success, failed: failedNames.length }) +
          "\n" +
          failedNames.join(", "),
        { id: toastId, duration: 8000 },
      );
    }
  };

  const handleCancelInstall = (cancelKey: string) => {
    api.cancelInstall(cancelKey).catch(() => {
      // Ignore race: install may have completed before cancel request arrives.
    });
  };

  const findManagedSkillForMarket = useCallback(
    (skill: SkillsShSkill) => {
      const sourceRef = `${skill.source}/${skill.skill_id}`;
      return managedSkills.find(
        (s) =>
          (s.source_type === "skillssh" && s.source_ref === sourceRef) ||
          s.central_path.split("/").pop()?.toLowerCase() ===
            skill.skill_id.toLowerCase(),
      );
    },
    [managedSkills],
  );

  const handleUninstallSkillssh = async (skill: SkillsShSkill) => {
    const managed = findManagedSkillForMarket(skill);
    if (!managed) return;
    const displayName = skill.name || skill.skill_id;
    try {
      await api.deleteManagedSkill(managed.id);
      await Promise.allSettled([refreshSkillGroups(), refreshManagedSkills()]);
      toast.success(t("install.toast.uninstalled", { name: displayName }));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setUninstallConfirm(null);
    }
  };

  const handleGitPreview = async () => {
    if (!gitUrl.trim()) return;
    setGitLoading(true);
    const url = gitUrl.trim();
    setGitCancelKey(url);

    const toastId = toast.loading(t("install.toast.cloning"));
    let unlisten: (() => void) | null = null;

    try {
      unlisten = await listen<{
        skill_id: string;
        phase: string;
        detail?: string;
      }>("install-progress", (event) => {
        if (event.payload.skill_id !== url) return;
        if (event.payload.phase === "cloning") {
          const detail = event.payload.detail?.trim();
          const msg = detail
            ? `${t("install.toast.cloning")}\n${detail}`
            : t("install.toast.cloning");
          toast.loading(msg, { id: toastId });
        }
      });
      const preview = await api.previewGitInstall(url);
      toast.dismiss(toastId);
      setGitPreview(preview);
      setGitPreviewRepoUrl(url);
      setGitSelections(
        preview.skills.map((s) => ({
          rel_path: s.rel_path,
          name: s.name,
          description: s.description,
          selected: true,
        })),
      );
    } catch (error: unknown) {
      if (getErrorKind(error) === "cancelled") {
        toast.info(t("install.toast.cancelled"), { id: toastId });
      } else {
        toast.error(getErrorMessage(error, t("common.error")), { id: toastId });
      }
    } finally {
      setGitLoading(false);
      setGitCancelKey(null);
      unlisten?.();
    }
  };

  const handleGitPreviewClose = () => {
    if (gitConfirmLoading) return;
    if (gitPreview) {
      api.cancelGitPreview(gitPreview.temp_dir).catch(() => {});
    }
    setGitPreview(null);
    setGitPreviewRepoUrl(null);
    setGitSelections([]);
  };

  const handleGitConfirm = async () => {
    if (!gitPreview) return;
    const repoUrl = gitPreviewRepoUrl ?? gitUrl.trim();
    if (!repoUrl) return;
    const selected = gitSelections.filter((s) => s.selected);
    if (selected.length === 0) return;
    setGitConfirmLoading(true);
    try {
      await api.confirmGitInstall(
        repoUrl,
        gitPreview.temp_dir,
        selected.map((s) => ({ rel_path: s.rel_path, name: s.name })),
      );
      await Promise.all([refreshSkillGroups(), refreshManagedSkills()]);
      toast.success(
        t("install.toast.success", {
          name: selected.map((s) => s.name).join(", "),
        }),
      );
      setGitUrl("");
      setGitPreview(null);
      setGitPreviewRepoUrl(null);
      setGitSelections([]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setGitConfirmLoading(false);
    }
  };

  const handleImportDiscovered = async (
    sourcePath: string,
    name: string,
    overwrite?: boolean,
  ) => {
    if (!overwrite) {
      try {
        const conflict = await api.checkImportConflict(name);
        if (conflict) {
          setOverwriteConfirm({
            type: "single",
            names: [conflict],
            sourcePath,
            importName: name,
          });
          return;
        }
      } catch {
        // conflict check failed — proceed with import
      }
    }

    setImportingPaths((prev) => new Set(prev).add(sourcePath));
    try {
      try {
        await api.importExistingSkill(sourcePath, name, overwrite);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
        return;
      }
      toast.success(t("install.scan.importedOne", { name }));
      const results = await Promise.allSettled([
        refreshSkillGroups(),
        refreshManagedSkills(),
        runScanSilent(),
      ]);
      warnRejected(results, "post-import refresh");
    } finally {
      setImportingPaths((prev) => {
        const next = new Set(prev);
        next.delete(sourcePath);
        return next;
      });
    }
  };

  const handleImportAllDiscovered = async (overwrite?: boolean) => {
    if (!overwrite) {
      try {
        const conflicts = await api.checkImportAllConflicts();
        if (conflicts.length > 0) {
          setOverwriteConfirm({ type: "all", names: conflicts });
          return;
        }
      } catch {
        // conflict check failed — proceed with import
      }
    }

    setImportingAll(true);
    try {
      try {
        await api.importAllDiscovered(overwrite);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
        return;
      }
      toast.success(t("install.scan.importedAll"));
      const results = await Promise.allSettled([
        refreshSkillGroups(),
        refreshManagedSkills(),
        runScanSilent(),
      ]);
      warnRejected(results, "post-import refresh");
    } finally {
      setImportingAll(false);
    }
  };

  const scrollMarketListToTop = () => {
    marketListRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const changeMarketPage = (page: number) => {
    setMarketPage(page);
    scrollMarketListToTop();
  };

  const sourceOptions = useMemo(
    () => Array.from(new Set(marketSkills.map((skill) => skill.source))),
    [marketSkills],
  );

  const filteredMarketSkills = useMemo(() => {
    let filtered =
      marketSourceFilter === "all"
        ? marketSkills
        : marketSkills.filter((skill) => skill.source === marketSourceFilter);
    if (marketInstalledFilter) {
      filtered = filtered.filter((skill) => {
        const sourceRef = `${skill.source}/${skill.skill_id}`;
        return (
          installedSourceRefs.has(sourceRef) ||
          installedDirNames.has(skill.skill_id.toLowerCase())
        );
      });
    }
    if (debouncedMarketQuery.trim().length > 0) {
      return [...filtered].sort((a, b) => b.installs - a.installs);
    }
    return filtered;
  }, [
    marketSkills,
    marketSourceFilter,
    marketInstalledFilter,
    installedSourceRefs,
    installedDirNames,
    debouncedMarketQuery,
  ]);

  const linkableMarketSkills = useMemo(
    () =>
      filteredMarketSkills.filter((skill) => {
        const sourceRef = `${skill.source}/${skill.skill_id}`;
        return (
          !installedSourceRefs.has(sourceRef) &&
          installedDirNames.has(skill.skill_id.toLowerCase())
        );
      }),
    [filteredMarketSkills, installedSourceRefs, installedDirNames],
  );

  const marketFilterSignal = `${marketSourceFilter}|${marketInstalledFilter}|${debouncedMarketQuery}`;
  const {
    isMultiSelect: isMarketMultiSelect,
    setIsMultiSelect: setIsMarketMultiSelect,
    selectedIds: marketSelectedIds,
    toggleSelect: toggleMarketSelect,
    isAllSelected: isMarketAllSelected,
    handleSelectAll: handleMarketSelectAll,
    exitMultiSelect: exitMarketMultiSelect,
  } = useMultiSelect({
    items: linkableMarketSkills,
    filtered: linkableMarketSkills,
    getKey: (s) => s.id,
    isItemActive: () => true,
    filterSignal: marketFilterSignal,
    escapeEnabled: !overwriteConfirm && !uninstallConfirm,
  });

  const totalMarketPages = Math.max(
    1,
    Math.ceil(filteredMarketSkills.length / MARKET_PAGE_SIZE),
  );
  const currentMarketPage = Math.min(marketPage, totalMarketPages);
  const marketPageStart = (currentMarketPage - 1) * MARKET_PAGE_SIZE;
  const paginatedMarketSkills = filteredMarketSkills.slice(
    marketPageStart,
    marketPageStart + MARKET_PAGE_SIZE,
  );
  const visibleMarketPages = Array.from(
    { length: totalMarketPages },
    (_, index) => index + 1,
  ).filter((page) => {
    if (totalMarketPages <= 7) return true;
    if (page === 1 || page === totalMarketPages) return true;
    return Math.abs(page - currentMarketPage) <= 1;
  });
  const hasMarketQuery = debouncedMarketQuery.trim().length > 0;
  const canLoadMoreSearch =
    hasMarketQuery && marketSkills.length >= marketSearchLimit;
  const isLoadingMoreSearch = hasMarketQuery && marketLoadingMore;

  return (
    <div className="app-page gap-4">
      <LocalImportErrorDialog
        message={localImportError}
        onClose={() => setLocalImportError(null)}
      />
      <div className="app-page-header border-b-0 pb-0">
        <h1 className="app-page-title mb-4">{t("install.title")}</h1>
        <div className="flex gap-1 border-b border-border-subtle">
          {[
            {
              id: "market" as const,
              label: t("install.browseMarket"),
              icon: Box,
            },
            {
              id: "local" as const,
              label: t("install.localInstall"),
              icon: UploadCloud,
            },
            {
              id: "git" as const,
              label: t("install.gitInstall"),
              icon: Github,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  "mr-4 flex items-center gap-1.5 border-b-2 px-1 pb-1.5 text-[13px] font-medium transition-colors outline-none",
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-tertiary",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "market" && (
        <div className="animate-in fade-in duration-300">
          <div className="app-panel mb-3 p-3.5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center">
                  {!hasMarketQuery ? (
                    <div className="app-segmented shrink-0 bg-background">
                      {[
                        {
                          id: "alltime" as const,
                          label: t("install.all"),
                          icon: Clock,
                        },
                        {
                          id: "trending" as const,
                          label: t("install.trending"),
                          icon: TrendingUp,
                        },
                        {
                          id: "hot" as const,
                          label: t("install.hot"),
                          icon: Star,
                        },
                      ].map((tab) => {
                        const Icon = tab.icon;
                        const isActive = marketTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setMarketTab(tab.id)}
                            className={cn(
                              "app-segmented-button flex items-center gap-1.5",
                              isActive && "app-segmented-button-active",
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="relative flex-1 lg:max-w-[640px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      value={marketQuery}
                      onChange={(event) => {
                        setMarketQuery(event.target.value);
                        setMarketSearchLimit(MARKET_SEARCH_STEP);
                      }}
                      placeholder={t("install.searchMarket")}
                      className="app-input w-full bg-background pl-9"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  {marketInstalledFilter && linkableMarketSkills.length > 0 && (
                    <>
                      <div className="mx-1 h-5 w-px shrink-0 self-center bg-border-subtle" />
                      <button
                        type="button"
                        aria-pressed={isMarketMultiSelect}
                        onClick={() =>
                          isMarketMultiSelect
                            ? exitMarketMultiSelect()
                            : setIsMarketMultiSelect(true)
                        }
                        className={cn(
                          "app-segmented-button inline-flex shrink-0 items-center gap-1.5 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-border",
                          isMarketMultiSelect &&
                            "app-segmented-button-active hover:bg-surface-active hover:text-secondary",
                        )}
                      >
                        <SquareCheck className="h-4 w-4" />
                        {isMarketMultiSelect
                          ? t("mySkills.cancelSelect")
                          : t("mySkills.selectMode")}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <SourceFilterBar
                sources={sourceOptions}
                value={marketSourceFilter}
                onChange={setMarketSourceFilter}
                installedFilter={marketInstalledFilter}
                onInstalledFilterToggle={() => {
                  setMarketInstalledFilter((v) => {
                    if (v) exitMarketMultiSelect();
                    return !v;
                  });
                  setMarketPage(1);
                }}
              />
            </div>
          </div>

          {isMarketMultiSelect && (
            <MultiSelectToolbar
              selectedCount={marketSelectedIds.size}
              isAllSelected={isMarketAllSelected}
              actions={[
                {
                  key: "batch-link",
                  tone: "primary",
                  label: t("install.batchLinkAction", {
                    count: marketSelectedIds.size,
                  }),
                  icon: <Link2 className="h-3.5 w-3.5" />,
                  busy: batchLinking,
                  disabled: marketSelectedIds.size === 0,
                  onSelect: () => {
                    const selected = linkableMarketSkills.filter((s) =>
                      marketSelectedIds.has(s.id),
                    );
                    if (selected.length === 0) return;
                    setOverwriteConfirm({
                      type: "batch-link",
                      names: selected.map((s) => s.name || s.skill_id),
                      batchLinkSkills: selected,
                    });
                  },
                },
              ]}
              labels={{
                hint: t("install.batchLinkSelectAll"),
                selected: t("mySkills.selectedCount", {
                  count: marketSelectedIds.size,
                }),
                selectAll: t("mySkills.selectAll"),
                deselectAll: t("mySkills.deselectAll"),
                cancel: t("common.cancel"),
                more: t("mySkills.moreActions"),
              }}
              onSelectAll={handleMarketSelectAll}
              onCancel={exitMarketMultiSelect}
            />
          )}

          {marketError ? (
            <div className="mb-4">
              <StatusBanner
                compact
                title={t("common.requestFailed")}
                description={marketError}
                actionLabel={t("common.retry")}
                onAction={() => setMarketReloadKey((value) => value + 1)}
                tone="danger"
              />
            </div>
          ) : null}

          {marketLoading && !marketLoadingMore ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : (
            <div className="pb-8">
              <div ref={marketListRef} className="scroll-mt-4" />

              {filteredMarketSkills.length === 0 ? (
                <div className="app-panel flex flex-col items-center justify-center rounded-2xl px-6 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-muted">
                    <Search className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-[14px] font-semibold text-secondary">
                    {t("install.noResults.title")}
                  </h3>
                  <p className="mt-1 max-w-md text-[13px] text-muted">
                    {t("install.noResults.description")}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                    {paginatedMarketSkills.map((skill) => {
                      const sourceRef = `${skill.source}/${skill.skill_id}`;
                      const isMarketInstalled =
                        installedSourceRefs.has(sourceRef);
                      const isLocalMatch =
                        !isMarketInstalled &&
                        installedDirNames.has(skill.skill_id.toLowerCase());
                      const otherSource = !isMarketInstalled
                        ? installedSourceBySkillId.get(
                            skill.skill_id.toLowerCase(),
                          )
                        : undefined;

                      return (
                        <MarketSkillCard
                          key={skill.id}
                          skill={skill}
                          isMarketInstalled={isMarketInstalled}
                          isLocalMatch={isLocalMatch}
                          installedFromSource={otherSource}
                          isMultiSelect={isMarketMultiSelect}
                          isSelected={
                            isMarketMultiSelect &&
                            marketSelectedIds.has(skill.id)
                          }
                          installing={installing}
                          batchLinking={batchLinking}
                          marketSourceFilter={marketSourceFilter}
                          onToggleSelect={toggleMarketSelect}
                          onInstall={handleInstallSkillssh}
                          onCancelInstall={handleCancelInstall}
                          onUninstall={setUninstallConfirm}
                          onFilterSource={setMarketSourceFilter}
                        />
                      );
                    })}
                  </div>

                  {totalMarketPages > 1 ? (
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
                      <button
                        onClick={() =>
                          changeMarketPage(Math.max(1, currentMarketPage - 1))
                        }
                        disabled={currentMarketPage === 1}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        {t("install.pagination.previous")}
                      </button>

                      {visibleMarketPages.map((page, index) => {
                        const previousPage = visibleMarketPages[index - 1];
                        const showGap = previousPage && page - previousPage > 1;

                        return (
                          <div key={page} className="flex items-center gap-1.5">
                            {showGap ? (
                              <span className="px-1 text-[13px] text-faint">
                                ...
                              </span>
                            ) : null}
                            <button
                              onClick={() => changeMarketPage(page)}
                              className={cn(
                                "min-w-8 rounded-[6px] border px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
                                page === currentMarketPage
                                  ? "border-accent-border bg-accent-dark text-white"
                                  : "border-border-subtle bg-surface text-secondary hover:bg-surface-hover",
                              )}
                            >
                              {page}
                            </button>
                          </div>
                        );
                      })}

                      <button
                        onClick={() =>
                          changeMarketPage(
                            Math.min(totalMarketPages, currentMarketPage + 1),
                          )
                        }
                        disabled={currentMarketPage === totalMarketPages}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        {t("install.pagination.next")}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}

                  {hasMarketQuery ? (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          setMarketSearchLimit(
                            (value) => value + MARKET_SEARCH_STEP,
                          )
                        }
                        disabled={!canLoadMoreSearch || marketLoading}
                        className="inline-flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface px-3.5 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {marketLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Search className="h-3.5 w-3.5" />
                        )}
                        {isLoadingMoreSearch
                          ? t("install.loadingMore")
                          : t("install.loadMoreSearch")}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "local" && (
        <div className="space-y-4 pb-8 animate-in fade-in duration-300">
          <section className="app-panel overflow-hidden">
            <div className="border-b border-border-subtle px-4 py-3.5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-accent-border bg-accent-bg px-2 py-1 font-medium text-accent-light">
                      <FolderUp className="h-3.5 w-3.5" />
                      {t("install.local.title")}
                    </span>
                  </div>

                  <h2 className="text-[14px] font-semibold text-secondary">
                    {t("install.local.title")}
                  </h2>
                  <p className="mt-1 text-[13px] leading-5 text-muted">
                    {t("install.local.description")}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleLocalFolderInstall}
                    className="app-button-primary"
                  >
                    <FolderUp className="h-4 w-4" />
                    {t("install.local.selectFolder")}
                  </button>
                  <button
                    type="button"
                    onClick={handleLocalFileInstall}
                    className="app-button-secondary bg-background"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {t("install.local.selectArchive")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchImportFolder()}
                    className="app-button-secondary bg-background"
                  >
                    <FolderInput className="h-4 w-4" />
                    {t("install.local.batchImport")}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {localError ? (
            <StatusBanner
              compact
              title={t("common.requestFailed")}
              description={localError}
              actionLabel={t("common.retry")}
              onAction={runScan}
              tone="danger"
            />
          ) : null}

          <LocalSkillsPanel
            scanResult={scanResult}
            scanLoading={scanLoading}
            importingPaths={importingPaths}
            importingAll={importingAll}
            runScan={runScan}
            onChanged={async () => {
              await Promise.all([refreshManagedSkills(), refreshTools()]);
            }}
            handleImportDiscovered={handleImportDiscovered}
            handleImportAllDiscovered={handleImportAllDiscovered}
          />
        </div>
      )}

      {activeTab === "git" && (
        <GitImportPanel
          gitUrl={gitUrl}
          setGitUrl={setGitUrl}
          gitLoading={gitLoading}
          gitCancelKey={gitCancelKey}
          gitPreview={gitPreview}
          gitSelections={gitSelections}
          setGitSelections={setGitSelections}
          gitConfirmLoading={gitConfirmLoading}
          findInstalledByGitUrl={findInstalledByGitUrl}
          onPreview={handleGitPreview}
          onPreviewClose={handleGitPreviewClose}
          onConfirm={handleGitConfirm}
          onCancelInstall={handleCancelInstall}
        />
      )}

      <ConfirmDialog
        open={!!uninstallConfirm}
        title={t("install.uninstallTitle")}
        message={t("install.uninstallMessage", {
          name: uninstallConfirm?.name || uninstallConfirm?.skill_id || "",
        })}
        confirmLabel={t("install.uninstallConfirm")}
        tone="danger"
        onClose={() => setUninstallConfirm(null)}
        onConfirm={async () => {
          if (uninstallConfirm) {
            await handleUninstallSkillssh(uninstallConfirm);
          }
        }}
      />
      <ConfirmDialog
        open={!!overwriteConfirm}
        title={t("install.scan.overwriteTitle")}
        message={
          overwriteConfirm?.type === "batch-link"
            ? t("install.batchLinkConfirm", {
                count: overwriteConfirm.names.length,
              })
            : overwriteConfirm && overwriteConfirm.names.length === 1
              ? t("install.scan.overwriteSingle", {
                  name: overwriteConfirm.names[0],
                })
              : t("install.scan.overwriteMultiple", {
                  count: overwriteConfirm?.names.length ?? 0,
                })
        }
        details={
          overwriteConfirm &&
          (overwriteConfirm.type === "batch-link" ||
            overwriteConfirm.names.length > 1)
            ? overwriteConfirm.names
            : undefined
        }
        confirmLabel={t("install.scan.overwriteConfirm")}
        tone="warning"
        onClose={() => setOverwriteConfirm(null)}
        onConfirm={async () => {
          const ctx = overwriteConfirm;
          setOverwriteConfirm(null);
          if (!ctx) return;
          switch (ctx.type) {
            case "single":
              if (ctx.sourcePath && ctx.importName) {
                await handleImportDiscovered(
                  ctx.sourcePath,
                  ctx.importName,
                  true,
                );
              }
              break;
            case "all":
              await handleImportAllDiscovered(true);
              break;
            case "local":
              if (ctx.sourcePath) {
                await installLocalSource(ctx.sourcePath, true);
              }
              break;
            case "batch":
              if (ctx.folderPath) {
                await handleBatchImportFolder(ctx.folderPath);
              }
              break;
            case "skillssh":
              if (ctx.skillsshSkill) {
                await handleInstallSkillssh(ctx.skillsshSkill, true);
              }
              break;
            case "batch-link":
              if (ctx.batchLinkSkills) {
                await handleBatchLinkToMarket(ctx.batchLinkSkills);
              }
              break;
          }
        }}
      />
    </div>
  );
}
