import { getSkillGroupDisplayName } from "../lib/skillGroupDisplay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  LayoutGrid,
  List,
  CheckCircle2,
  Github,
  HardDrive,
  Globe,
  Layers,
  RefreshCw,
  RotateCcw,
  GitBranch,
  ArrowUpCircle,
  Wrench,
  Loader2,
  X,
  Plus,
  SquareCheck,
  Square,
  GripVertical,
  CircleSlash,
  Circle,
  Pencil,
  Share2,
  Tag,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import { useSkillGroupMembershipActions } from "../hooks/useSkillGroupMembershipActions";
import { useMultiSelect } from "../hooks/useMultiSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TagRenameDialog } from "../components/TagRenameDialog";
import { SkillDetailPanel } from "../components/SkillDetailPanel";
import { MultiSelectToolbar } from "../components/MultiSelectToolbar";
import { BatchTagDialog } from "../components/BatchTagDialog";
import { BatchSyncAgentDialog } from "../components/BatchSyncAgentDialog";
import { SyncDots } from "../components/SyncDots";
import { SkillGroupMembershipButton } from "../components/SkillGroupMembershipButton";
import { SkillGroupContext } from "../components/SkillGroupContext";
import { CardActionMenu } from "../components/CardActionMenu";
import * as api from "../lib/tauri";
import {
  getTagActiveColor,
  getTagColor,
  pruneStaleTagFilters,
  UNTAGGED_FILTER,
} from "../lib/skillTags";
import type {
  ManagedSkill,
  ToolInfo,
  GitBackupStatus,
  SkillToolToggle,
} from "../lib/tauri";
import { skillLibraryContentKey } from "../lib/skillGroupMembership";
import { getErrorMessage } from "../lib/error";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableSkillItemProps {
  id: string;
  disabled: boolean;
  className?: string;
  /** Overrides the handle styling (grid cards render it inside the status-dot slot). */
  handleClassName?: string;
  handleTitle?: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}

function SortableSkillItem({
  id,
  disabled,
  className,
  handleClassName,
  handleTitle,
  children,
}: SortableSkillItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const handle = !disabled ? (
    <div
      ref={setActivatorNodeRef}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      title={handleTitle}
      className={
        handleClassName ??
        "flex cursor-grab items-center justify-center rounded p-1 text-faint transition-colors hover:bg-surface-hover hover:text-muted active:cursor-grabbing"
      }
    >
      <GripVertical className="h-4 w-4" />
    </div>
  ) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn("h-full", className)}
    >
      {children(handle)}
    </div>
  );
}

function getToolDisplayName(toolKey: string, tools: ToolInfo[]) {
  return tools.find((tool) => tool.key === toolKey)?.display_name || toolKey;
}

function centralDirName(skill: ManagedSkill) {
  return skill.central_path.split(/[\\/]/).filter(Boolean).pop() || skill.name;
}

function sourceRefLabel(skill: ManagedSkill): string | null {
  const ref = skill.source_ref;
  if (!ref) return null;
  if (skill.source_type === "skillssh") {
    const parts = ref.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : ref;
  }
  if (skill.source_type === "git") {
    const m = ref.replace(/\.git$/, "").match(/([^/]+\/[^/]+)$/);
    return m ? m[1] : ref;
  }
  return null;
}

function canRefreshSkill(skill: ManagedSkill) {
  return (
    skill.source_type === "git" ||
    skill.source_type === "skillssh" ||
    ((skill.source_type === "local" || skill.source_type === "import") &&
      !!skill.source_ref)
  );
}

function hasAvailableUpdate(skill: ManagedSkill) {
  return skill.update_status === "update_available" && canRefreshSkill(skill);
}

export function MySkills() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    viewedSkillGroup,
    viewingUngrouped,
    skillGroups,
    tools,
    managedSkills: skills,
    refreshSkillGroups,
    refreshManagedSkills,
    refreshTools,
    detailSkillId,
    openSkillDetailById,
    closeSkillDetail,
    projects,
    refreshProjects,
  } = useApp();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterMode, setFilterMode] = useState<"all" | "enabled" | "available">(
    viewedSkillGroup ? "enabled" : "all",
  );
  const [sourceFilters, setSourceFilters] = useState<Set<string>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<string[]>([]);
  // Tag management from the filter bar (#233): right-click a tag pill to
  // rename (dialog) or delete (confirm). Left-click stays "filter only".
  const [tagMenu, setTagMenu] = useState<{
    tag: string;
    x: number;
    y: number;
  } | null>(null);
  const [tagToRename, setTagToRename] = useState<string | null>(null);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterUngrouped, setFilterUngrouped] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const refreshAfterDeleteRef = useRef<number | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [batchTagDialogOpen, setBatchTagDialogOpen] = useState(false);
  const [batchSyncDialogOpen, setBatchSyncDialogOpen] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingSkillId, setCheckingSkillId] = useState<string | null>(null);
  const [updatingSkillId, setUpdatingSkillId] = useState<string | null>(null);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [toolToggles, setToolToggles] = useState<SkillToolToggle[] | null>(
    null,
  );
  const [togglingToolKey, setTogglingToolKey] = useState<string | null>(null);
  const [togglingTarget, setTogglingTarget] = useState<{
    skillId: string;
    tool: string;
  } | null>(null);
  const [gitStatus, setGitStatus] = useState<GitBackupStatus | null>(null);
  const [gitRemoteConfig, setGitRemoteConfig] = useState("");
  const [tagEditSkillId, setTagEditSkillId] = useState<string | null>(null);
  const [menuSkillId, setMenuSkillId] = useState<string | null>(null);
  const [skillToDelete, setSkillToDelete] = useState<ManagedSkill | null>(null);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [skillGroupSkillOrder, setSkillGroupSkillOrder] = useState<string[]>(
    [],
  );

  const viewedSkillGroupName = viewingUngrouped
    ? t("mySkills.sourceFilter.ungrouped")
    : viewedSkillGroup
      ? getSkillGroupDisplayName(viewedSkillGroup.name, t)
      : t("mySkills.currentSkillGroupFallback");

  const groupNameMap = useMemo(
    () =>
      new Map(
        skillGroups.map((g) => [
          g.id,
          getSkillGroupDisplayName(g.name, t),
        ]),
      ),
    [skillGroups, t],
  );

  // Fetch sort order whenever active skillGroup changes
  useEffect(() => {
    if (!viewedSkillGroup) {
      setSkillGroupSkillOrder([]);
      return;
    }
    api
      .getSkillGroupSkillOrder(viewedSkillGroup.id)
      .then(setSkillGroupSkillOrder)
      .catch(() => {});
  }, [viewedSkillGroup, skills]);

  useEffect(() => {
    setFilterMode(viewedSkillGroup && !viewingUngrouped ? "enabled" : "all");
  }, [viewedSkillGroup?.id, viewingUngrouped]);

  // Skills with an unresolved sync conflict get a "needs attention" badge
  // that jumps to the Backup page (merge-engine design §4 UI).
  const [conflictIds, setConflictIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    api
      .gitBackupPendingConflicts()
      .then((rows) => setConflictIds(new Set(rows.map((row) => row.skill_id))))
      .catch(() => setConflictIds(new Set()));
  }, [skills]);

  const refreshAllTags = async () => {
    try {
      const tags = await api.getAllTags();
      setAllTags(tags);
    } catch {
      // not critical
    }
  };

  useEffect(() => {
    refreshAllTags();
  }, [skills]);

  // Prune tag filters whose pill disappeared (e.g. its last skill was deleted),
  // otherwise a stale filter silently hides everything. An empty skill list
  // says nothing about which tags are valid, so wait for one before pruning.
  // A tag still carried by a loaded skill counts as available even when it is
  // missing from `allTags`: that list is refetched asynchronously and lags
  // `skills`, and in that window a rename would otherwise drop the filter that
  // `replaceTagInFilters` just moved onto the new name.
  useEffect(() => {
    if (skills.length === 0) return;
    const hasUntagged = skills.some((skill) => skill.tags.length === 0);
    const available = [...allTags, ...skills.flatMap((skill) => skill.tags)];
    setTagFilters((prev) => pruneStaleTagFilters(prev, available, hasUntagged));
  }, [allTags, skills]);

  // Close the tag context menu on Escape (click-outside is handled by its backdrop).
  useEffect(() => {
    if (!tagMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTagMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tagMenu]);

  const toggleFilter = (set: Set<string>, value: string): Set<string> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  // A filter can outlive the control that set it (the tag row hides itself once
  // no tag is left), so the empty state carries the way out. `filterMode` is
  // reset too — its control never hides, but a button labelled "clear filters"
  // that leaves one of them on is a lie.
  const hasActiveFilters =
    search.trim() !== "" ||
    sourceFilters.size > 0 ||
    filterUngrouped ||
    tagFilters.size > 0 ||
    filterMode !== "all";
  const clearFilters = () => {
    setSearch("");
    setSourceFilters(new Set());
    setFilterUngrouped(false);
    setTagFilters(new Set());
    setFilterMode("all");
  };

  const skillDisplayNames = useMemo(() => {
    const nameCounts = new Map<string, number>();
    for (const skill of skills) {
      nameCounts.set(skill.name, (nameCounts.get(skill.name) || 0) + 1);
    }

    const displayNames = new Map<string, string>();
    for (const skill of skills) {
      const dirName = centralDirName(skill);
      displayNames.set(
        skill.id,
        (nameCounts.get(skill.name) || 0) > 1 && dirName !== skill.name
          ? dirName
          : skill.name,
      );
    }
    return displayNames;
  }, [skills]);

  const filtered = useMemo(() => {
    const result = skills.filter((skill) => {
      const displayName = skillDisplayNames.get(skill.id) || skill.name;
      const matchesSearch =
        skill.name.toLowerCase().includes(search.toLowerCase()) ||
        displayName.toLowerCase().includes(search.toLowerCase()) ||
        (skill.description || "").toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (sourceFilters.size > 0 && !sourceFilters.has(skill.source_type))
        return false;

      if (filterUngrouped && skill.skill_group_ids.length > 0)
        return false;

      if (tagFilters.size > 0) {
        const wantUntagged = tagFilters.has(UNTAGGED_FILTER);
        const matchUntagged = wantUntagged && skill.tags.length === 0;
        const matchTag = skill.tags.some((t) => tagFilters.has(t));
        if (!matchUntagged && !matchTag) return false;
      }

      if (viewingUngrouped) return skill.skill_group_ids.length === 0;

      if (!viewedSkillGroup) return true;

      const enabledInSkillGroup = skill.skill_group_ids.includes(
        viewedSkillGroup.id,
      );
      if (filterMode === "enabled") return enabledInSkillGroup;
      if (filterMode === "available") return !enabledInSkillGroup;
      return true;
    });

    result.sort((a, b) => {
      // Skills with an actionable update stay at the front of the library.
      const aNeedsUpdate = hasAvailableUpdate(a) ? 0 : 1;
      const bNeedsUpdate = hasAvailableUpdate(b) ? 0 : 1;
      if (aNeedsUpdate !== bNeedsUpdate) return aNeedsUpdate - bNeedsUpdate;

      if (!viewedSkillGroup) return 0;

      // Keep enabled skills together after the update priority.
      const aEnabled = a.skill_group_ids.includes(viewedSkillGroup.id) ? 0 : 1;
      const bEnabled = b.skill_group_ids.includes(viewedSkillGroup.id) ? 0 : 1;
      if (aEnabled !== bEnabled) return aEnabled - bEnabled;

      // Within the same group, use the custom skill group order.
      const aOrder = skillGroupSkillOrder.indexOf(a.id);
      const bOrder = skillGroupSkillOrder.indexOf(b.id);
      if (aOrder !== -1 && bOrder !== -1) return aOrder - bOrder;
      if (aOrder !== -1) return -1;
      if (bOrder !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [
    skills,
    skillDisplayNames,
    search,
    sourceFilters,
    filterUngrouped,
    tagFilters,
    filterMode,
    viewedSkillGroup,
    viewingUngrouped,
    skillGroupSkillOrder,
  ]);

  const filterCounts = useMemo(() => {
    if (!viewedSkillGroup) return { all: skills.length, enabled: 0, available: 0 };
    const enabled = skills.filter((s) =>
      s.skill_group_ids.includes(viewedSkillGroup.id),
    ).length;
    return { all: skills.length, enabled, available: skills.length - enabled };
  }, [skills, viewedSkillGroup]);

  const ungroupedCount = useMemo(
    () => skills.filter((s) => s.skill_group_ids.length === 0).length,
    [skills],
  );

  const {
    isMultiSelect,
    setIsMultiSelect,
    selectedIds,
    toggleSelect,
    isAllSelected,
    anyDisabled,
    handleSelectAll,
    exitMultiSelect,
  } = useMultiSelect({
    items: skills,
    filtered,
    getKey: (s) => s.id,
    isItemActive: (s) =>
      viewedSkillGroup ? s.skill_group_ids.includes(viewedSkillGroup.id) : true,
    filterSignal: JSON.stringify([
      search,
      [...sourceFilters].sort(),
      [...tagFilters].sort(),
      filterMode,
      viewedSkillGroup?.id ?? null,
    ]),
    escapeEnabled:
      !batchTagDialogOpen && !batchSyncDialogOpen && !batchDeleteConfirm,
  });

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === detailSkillId) || null,
    [detailSkillId, skills],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !viewedSkillGroup) return;

      // Only reorder enabled skills (they are always at the front)
      const enabledSkills = filtered.filter((s) =>
        s.skill_group_ids.includes(viewedSkillGroup.id),
      );
      const oldIndex = enabledSkills.findIndex((s) => s.id === active.id);
      const newIndex = enabledSkills.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...enabledSkills];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      // Optimistic update
      setSkillGroupSkillOrder(reordered.map((s) => s.id));

      try {
        await api.reorderSkillGroupSkills(
          viewedSkillGroup.id,
          reordered.map((s) => s.id),
        );
      } catch {
        // Revert on failure
        await api
          .getSkillGroupSkillOrder(viewedSkillGroup.id)
          .then(setSkillGroupSkillOrder)
          .catch(() => {});
      }
    },
    [filtered, viewedSkillGroup],
  );

  const canDrag = !!viewedSkillGroup;

  const refreshGitStatus = useCallback(async () => {
    try {
      await api.gitBackupFetch().catch(() => {});
      const status = await api.gitBackupStatus();
      setGitStatus(status);
    } catch {
      // not critical
    }
  }, []);

  // Local-only status refresh: no `git fetch`, so it can fire from
  // dependency-driven effects without driving the file-watcher → refresh
  // → fetch feedback loop.
  const refreshGitStatusLocal = useCallback(async () => {
    try {
      const status = await api.gitBackupStatus();
      setGitStatus(status);
    } catch {
      // not critical
    }
  }, []);

  useEffect(() => {
    (async () => {
      const savedRemote =
        (
          await api.getSettings("git_backup_remote_url").catch(() => null)
        )?.trim() || "";
      const status = await api.gitBackupStatus().catch(() => null);
      setGitStatus(status);
      // The saved setting is the single source of truth. Do not backfill from
      // `.git/config` — that made a cleared URL reappear after disconnect (#260).
      setGitRemoteConfig(savedRemote);
    })();
  }, []);

  useEffect(() => {
    const handleWindowFocus = () => {
      refreshGitStatus();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshGitStatus();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshGitStatus]);

  const libraryContentKey = useMemo(
    () => skillLibraryContentKey(skills),
    [skills],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshGitStatusLocal();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [libraryContentKey, refreshGitStatusLocal]);

  useEffect(() => {
    let cancelled = false;
    const loadToggles = async () => {
      if (!selectedSkill || !viewedSkillGroup) {
        setToolToggles(null);
        return;
      }
      if (!selectedSkill.skill_group_ids.includes(viewedSkillGroup.id)) {
        setToolToggles(null);
        return;
      }
      try {
        const toggles = await api.getSkillToolToggles(
          selectedSkill.id,
          viewedSkillGroup.id,
        );
        if (!cancelled) setToolToggles(toggles);
      } catch {
        if (!cancelled) setToolToggles(null);
      }
    };
    loadToggles();
    return () => {
      cancelled = true;
    };
  }, [selectedSkill, viewedSkillGroup]);

  const handleToggleSkillTool = async (toolKey: string, enabled: boolean) => {
    if (!selectedSkill || !viewedSkillGroup) return;
    setTogglingToolKey(toolKey);
    try {
      await api.setSkillToolToggle(
        selectedSkill.id,
        viewedSkillGroup.id,
        toolKey,
        enabled,
      );
      const displayName = getToolDisplayName(toolKey, tools);
      toast.success(
        enabled
          ? t("mySkills.agentToggleEnabled", { agent: displayName })
          : t("mySkills.agentToggleDisabled", { agent: displayName }),
      );
      const [, toggles] = await Promise.all([
        refreshManagedSkills(),
        api.getSkillToolToggles(selectedSkill.id, viewedSkillGroup.id),
      ]);
      setToolToggles(toggles);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      await refreshManagedSkills();
    } finally {
      setTogglingToolKey(null);
    }
  };

  const handleToggleSkillTarget = useCallback(
    async (skill: ManagedSkill, toolKey: string, enabled: boolean) => {
      if (togglingTarget) return;
      setTogglingTarget({ skillId: skill.id, tool: toolKey });
      const displayName = getToolDisplayName(toolKey, tools);
      try {
        if (enabled) {
          await api.syncSkillToTool(skill.id, toolKey);
          toast.success(
            t("mySkills.targetInstalled", {
              name: skill.name,
              agent: displayName,
            }),
          );
        } else {
          await api.unsyncSkillFromTool(skill.id, toolKey);
          toast.success(
            t("mySkills.targetUninstalled", {
              name: skill.name,
              agent: displayName,
            }),
          );
        }
        await refreshManagedSkills();
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
        await refreshManagedSkills();
      } finally {
        setTogglingTarget(null);
      }
    },
    [togglingTarget, tools, t, refreshManagedSkills],
  );

  const scheduleRefreshAfterDelete = useCallback(() => {
    if (refreshAfterDeleteRef.current !== null) {
      window.clearTimeout(refreshAfterDeleteRef.current);
    }
    refreshAfterDeleteRef.current = window.setTimeout(() => {
      refreshAfterDeleteRef.current = null;
      void Promise.all([refreshManagedSkills(), refreshSkillGroups()]);
    }, 300);
  }, [refreshManagedSkills, refreshSkillGroups]);

  useEffect(() => {
    return () => {
      if (refreshAfterDeleteRef.current !== null) {
        window.clearTimeout(refreshAfterDeleteRef.current);
      }
    };
  }, []);

  const handleDeleteSkill = useCallback(
    (skill: ManagedSkill) => {
      setDeletingIds((prev) => {
        if (prev.has(skill.id)) return prev;
        const next = new Set(prev);
        next.add(skill.id);
        return next;
      });
      void (async () => {
        try {
          await api.deleteManagedSkill(skill.id);
          if (selectedSkill?.id === skill.id) closeSkillDetail();
          toast.success(`${skill.name} ${t("mySkills.deleted")}`);
        } catch (error: unknown) {
          toast.error(getErrorMessage(error, t("common.error")));
        } finally {
          setDeletingIds((prev) => {
            if (!prev.has(skill.id)) return prev;
            const next = new Set(prev);
            next.delete(skill.id);
            return next;
          });
          scheduleRefreshAfterDelete();
        }
      })();
    },
    [selectedSkill, closeSkillDetail, t, scheduleRefreshAfterDelete],
  );

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    try {
      const result = await api.deleteManagedSkills(ids);
      if (
        selectedSkill &&
        ids.includes(selectedSkill.id) &&
        !result.failed.includes(selectedSkill.id)
      ) {
        closeSkillDetail();
      }
      if (result.deleted > 0) {
        toast.success(t("mySkills.batchDeleted", { count: result.deleted }));
      }
      if (result.failed.length > 0) {
        toast.error(
          t("mySkills.batchDeleteFailed", { count: result.failed.length }),
        );
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      exitMultiSelect();
      setBatchDeleteConfirm(false);
      await Promise.all([refreshManagedSkills(), refreshSkillGroups()]);
    }
  };

  const handleBatchEditTags = async (adds: string[], removes: string[]) => {
    const selectedSkillsList = skills.filter((s) => selectedIds.has(s.id));
    let updated = 0;
    let failed = 0;
    for (const skill of selectedSkillsList) {
      const removeSet = new Set(removes);
      const remaining = skill.tags.filter((tag) => !removeSet.has(tag));
      const merged = [...remaining];
      for (const tag of adds) {
        if (!merged.includes(tag)) merged.push(tag);
      }
      const changed =
        merged.length !== skill.tags.length ||
        merged.some((tag, i) => tag !== skill.tags[i]);
      if (!changed) continue;
      try {
        await api.setSkillTags(skill.id, merged);
        updated++;
      } catch {
        failed++;
      }
    }
    if (updated > 0) {
      toast.success(t("mySkills.batchTagsUpdated", { count: updated }));
    }
    if (failed > 0) {
      toast.error(t("mySkills.batchTagsFailed", { count: failed }));
    }
    await refreshManagedSkills();
    await refreshAllTags();
  };

  const handleBatchSyncAgents = async (agentKeys: string[]) => {
    const selectedSkillsList = skills.filter((s) => selectedIds.has(s.id));
    let synced = 0;
    let failed = 0;
    for (const skill of selectedSkillsList) {
      for (const agentKey of agentKeys) {
        if (skill.targets.some((target) => target.tool === agentKey)) continue;
        try {
          await api.syncSkillToTool(skill.id, agentKey);
          synced++;
        } catch {
          failed++;
        }
      }
    }
    if (synced > 0) {
      toast.success(t("mySkills.batchSynced", { count: synced }));
    }
    if (failed > 0) {
      toast.error(t("mySkills.batchSyncFailed", { count: failed }));
    }
    await Promise.all([refreshManagedSkills(), refreshTools()]);
  };

  const handleBatchRefresh = async () => {
    const refreshableSkills = skills.filter(
      (skill) => selectedIds.has(skill.id) && canRefresh(skill),
    );
    if (refreshableSkills.length === 0) return;

    setBatchUpdating(true);
    try {
      const result = await api.batchUpdateSkills(
        refreshableSkills.map((skill) => skill.id),
      );
      if (result.refreshed > 0) {
        toast.success(t("mySkills.batchUpdated", { count: result.refreshed }));
      }
      if (result.unchanged > 0) {
        toast.info(
          t("mySkills.batchAlreadyUpToDate", { count: result.unchanged }),
        );
      }
      if (result.held_back.length > 0) {
        toast.warning(
          t("mySkills.batchHeldBack", {
            count: result.held_back.length,
            names: result.held_back.slice(0, 3).join("、"),
          }),
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          t("mySkills.batchUpdateFailed", { count: result.failed.length }),
        );
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      await refreshManagedSkills();
      setBatchUpdating(false);
    }
  };

  /** The update the user has been asked to confirm, and what it would remove. */
  const [pendingRemoval, setPendingRemoval] = useState<{
    skill: ManagedSkill;
    removals: api.PendingRemoval[];
    approval: string | null;
    /** Set when the pending replacement is a relink, so confirming re-uses the
     *  directory the user already chose instead of asking for it again. */
    relinkSource?: string;
  } | null>(null);

  const handleUpdateAvailableSkills = async () => {
    const updatableSkills = skills.filter(
      (skill) =>
        skill.update_status === "update_available" && canRefresh(skill),
    );
    if (updatableSkills.length === 0) return;

    setBatchUpdating(true);
    try {
      const result = await api.batchUpdateSkills(
        updatableSkills.map((skill) => skill.id),
      );
      if (result.refreshed > 0) {
        toast.success(t("mySkills.batchUpdated", { count: result.refreshed }));
      }
      if (result.unchanged > 0) {
        toast.info(
          t("mySkills.batchAlreadyUpToDate", { count: result.unchanged }),
        );
      }
      if (result.held_back.length > 0) {
        toast.warning(
          t("mySkills.batchHeldBack", {
            count: result.held_back.length,
            names: result.held_back.slice(0, 3).join("、"),
          }),
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          t("mySkills.batchUpdateFailed", { count: result.failed.length }),
        );
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      await refreshManagedSkills();
      setBatchUpdating(false);
    }
  };

  const handleCheckAllUpdates = async () => {
    setCheckingAll(true);
    try {
      await api.checkAllSkillUpdates(true);
      toast.success(t("mySkills.updateActions.checkedAll"));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      await refreshManagedSkills();
      setCheckingAll(false);
    }
  };

  const handleCheckUpdate = async (skill: ManagedSkill) => {
    setCheckingSkillId(skill.id);
    try {
      await api.checkSkillUpdate(skill.id, true);
      await refreshManagedSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      await refreshManagedSkills();
    } finally {
      setCheckingSkillId(null);
    }
  };

  const handleRefreshSkill = async (
    skill: ManagedSkill,
    approvedRemovals?: string,
  ) => {
    setUpdatingSkillId(skill.id);
    try {
      if (skill.source_type === "local" || skill.source_type === "import") {
        const result = await api.reimportLocalSkill(skill.id, approvedRemovals);
        if (result.pending_removals.length > 0) {
          setPendingRemoval({
            skill,
            removals: result.pending_removals,
            approval: result.removal_approval,
          });
          return;
        }
        toast.success(t("mySkills.updateActions.reimported"));
      } else {
        const result = await api.updateSkill(skill.id, approvedRemovals);
        // Nothing was changed: the update would have taken away files the new
        // version does not have. Show them and let the user decide (#256).
        if (result.pending_removals.length > 0) {
          setPendingRemoval({
            skill,
            removals: result.pending_removals,
            approval: result.removal_approval,
          });
          return;
        }
        if (result.content_changed) {
          toast.success(t("mySkills.updateActions.updated"));
        } else {
          toast.info(t("mySkills.updateActions.alreadyUpToDate"));
        }
      }
      await refreshManagedSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      await refreshManagedSkills();
    } finally {
      setUpdatingSkillId(null);
    }
  };

  const handleRelinkSource = async (
    skill: ManagedSkill,
    skillGroupSource?: string,
    approvedRemovals?: string,
  ) => {
    const selected =
      skillGroupSource ??
      (await api.pickDirectory());
    if (!selected || Array.isArray(selected)) return;

    setUpdatingSkillId(skill.id);
    try {
      const result = await api.relinkLocalSkillSource(
        skill.id,
        selected,
        approvedRemovals,
      );
      if (result.pending_removals.length > 0) {
        setPendingRemoval({
          skill,
          removals: result.pending_removals,
          approval: result.removal_approval,
          relinkSource: selected,
        });
        return;
      }
      toast.success(t("mySkills.updateActions.relinked"));
      await refreshManagedSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      await refreshManagedSkills();
    } finally {
      setUpdatingSkillId(null);
    }
  };

  const handleDetachSource = async (skill: ManagedSkill) => {
    setUpdatingSkillId(skill.id);
    try {
      await api.detachLocalSkillSource(skill.id);
      toast.success(t("mySkills.updateActions.detachedSource"));
      await refreshManagedSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      await refreshManagedSkills();
    } finally {
      setUpdatingSkillId(null);
    }
  };

  const handleAddTag = async (skill: ManagedSkill, inputValue?: string) => {
    const trimmed = (inputValue ?? tagInput).trim();
    if (!trimmed || skill.tags.includes(trimmed)) {
      setTagInput("");
      return;
    }
    try {
      await api.setSkillTags(skill.id, [...skill.tags, trimmed]);
      toast.success(t("mySkills.tags.tagAdded"));
      setTagEditSkillId(null);
      setTagInput("");
      await refreshManagedSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    }
  };

  const handleRemoveTag = async (skill: ManagedSkill, tagToRemove: string) => {
    try {
      await api.setSkillTags(
        skill.id,
        skill.tags.filter((t) => t !== tagToRemove),
      );
      toast.success(t("mySkills.tags.tagsUpdated"));
      await refreshManagedSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    }
  };

  // Replace `oldTag` with `newTag` in the active filter set so the current
  // filtering survives a rename/delete.
  const replaceTagInFilters = (oldTag: string, newTag?: string) =>
    setTagFilters((prev) => {
      if (!prev.has(oldTag)) return prev;
      const next = new Set(prev);
      next.delete(oldTag);
      if (newTag) next.add(newTag);
      return next;
    });

  // Throws on failure so the rename dialog stays open (it only closes after a
  // resolved onRename), matching how RenameSkillGroupDialog behaves.
  const handleRenameTag = async (newName: string) => {
    const oldName = tagToRename;
    if (oldName === null) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    try {
      await api.renameTag(oldName, trimmed);
      replaceTagInFilters(oldName, trimmed);
      toast.success(t("mySkills.tags.tagRenamed"));
      await refreshManagedSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      throw error;
    }
  };

  const handleDeleteTag = async () => {
    const tag = tagToDelete;
    if (tag === null) return;
    try {
      await api.deleteTag(tag);
      replaceTagInFilters(tag);
      toast.success(t("mySkills.tags.tagDeleted"));
      await refreshManagedSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    }
  };

  const getTagOptions = (skill: ManagedSkill, keyword: string) => {
    const needle = keyword.trim().toLowerCase();
    return allTags.filter((tag) => {
      if (skill.tags.includes(tag)) return false;
      if (!needle) return true;
      return tag.toLowerCase().includes(needle);
    });
  };

  type GitToolbarMode =
    | "loading"
    | "uninitialized"
    | "needs_remote"
    | "needs_fix"
    | "up_to_date"
    | "pending_changes";

  const getGitToolbarMode = (): GitToolbarMode => {
    if (!gitStatus) return "loading";
    if (!gitStatus.is_repo) return "uninitialized";
    if (!gitStatus.remote_url && !gitRemoteConfig) return "needs_remote";
    if (
      gitStatus.upstream_health === "unrelated_histories" ||
      gitStatus.upstream_health === "detached"
    ) {
      return "needs_fix";
    }
    // First-push case: remote is set but upstream tracking is not yet established.
    // Treat as a normal pending sync — the push path will set upstream automatically.
    if (gitStatus.upstream_health === "no_upstream") {
      return "pending_changes";
    }
    if (gitStatus.has_changes || gitStatus.ahead > 0 || gitStatus.behind > 0) {
      return "pending_changes";
    }
    return "up_to_date";
  };

  const getGitStatusMeta = (mode: GitToolbarMode) => {
    if (mode === "loading") {
      return {
        icon: Loader2,
        label: t("backup.status.loading"),
        className: "text-muted",
        iconClassName: "animate-spin",
      };
    }
    if (mode === "uninitialized" || mode === "needs_remote") {
      return {
        icon: GitBranch,
        label: t("backup.status.notConnected"),
        className: "text-muted",
        iconClassName: "",
      };
    }
    if (mode === "needs_fix") {
      return {
        icon: Wrench,
        label: t("backup.status.needsFix"),
        className: "text-red-500",
        iconClassName: "",
      };
    }
    if (mode === "pending_changes") {
      return {
        icon: ArrowUpCircle,
        label: t("backup.status.pending"),
        className: "text-amber-600 dark:text-amber-400",
        iconClassName: "",
      };
    }
    return {
      icon: CheckCircle2,
      label: t("backup.status.synced"),
      className: "text-muted",
      iconClassName: "",
    };
  };

  const sourceIcon = (type: string) => {
    switch (type) {
      case "git":
      case "skillssh":
        return <Github className="h-3 w-3" />;
      case "local":
      case "import":
        return <HardDrive className="h-3 w-3" />;
      default:
        return <Globe className="h-3 w-3" />;
    }
  };

  const canRefresh = canRefreshSkill;

  const anyRefreshableSelected = useMemo(
    () =>
      skills.some((skill) => selectedIds.has(skill.id) && canRefresh(skill)),
    [skills, selectedIds, canRefresh],
  );
  const availableUpdateCount = useMemo(
    () =>
      skills.filter(
        (skill) =>
          skill.update_status === "update_available" && canRefresh(skill),
      ).length,
    [skills, canRefresh],
  );
  const refreshableSelectedCount = useMemo(
    () =>
      skills.filter((skill) => selectedIds.has(skill.id) && canRefresh(skill))
        .length,
    [skills, selectedIds, canRefresh],
  );
  /**
   * Only the selected skills the toggle would actually change — a mixed selection
   * enables the ones that are off, so the button must not count the rest.
   */
  const togglableSelectedSkills = useMemo(() => {
    if (!viewedSkillGroup) return [];
    const enabling = anyDisabled;
    return skills.filter((skill) => {
      if (!selectedIds.has(skill.id)) return false;
      return skill.skill_group_ids.includes(viewedSkillGroup.id) !== enabling;
    });
  }, [skills, selectedIds, viewedSkillGroup, anyDisabled]);

  const {
    batchToggling,
    handleToggleSkillGroup,
    handleBatchToggleSkillGroup,
    moveConfirm,
    confirmMove,
    cancelMove,
  } = useSkillGroupMembershipActions({
      group: viewedSkillGroup,
      groupName: viewedSkillGroupName,
      groupNameMap,
      selectedSkills: togglableSelectedSkills,
      enabling: anyDisabled,
      onChanged: () =>
        setGitStatus((current) =>
          current ? { ...current, has_changes: true } : current,
        ),
    });

  const sourceTypeLabel = (skill: ManagedSkill) =>
    skill.source_type === "skillssh" ? "skills.sh" : skill.source_type;

  const refreshLabel = (skill: ManagedSkill) =>
    skill.source_type === "local" || skill.source_type === "import"
      ? t("mySkills.updateActions.reimport")
      : t("mySkills.updateActions.update");

  const statusBadge = (skill: ManagedSkill) => {
    if (skill.update_status === "update_available") {
      return {
        label: "Update",
        className: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
      };
    }
    if (skill.update_status === "source_missing") {
      return {
        label: t("mySkills.updateStatus.sourceMissing"),
        className: "bg-red-500/10 text-red-600 dark:text-red-300",
      };
    }
    if (skill.update_status === "error") {
      return {
        label: t("mySkills.updateStatus.error"),
        className: "bg-red-500/10 text-red-600 dark:text-red-300",
      };
    }
    return null;
  };

  return (
    <div className="app-page">
      <div className="app-page-header pr-2 pb-1 flex items-center justify-between gap-3">
        <h1 className="app-page-title flex items-center gap-2">
          {t("mySkills.title")}
          <span className="app-badge">{skills.length}</span>
        </h1>
      </div>

      <SkillGroupContext
        groupName={viewedSkillGroup ? viewedSkillGroupName : undefined}
        count={
          viewedSkillGroup
            ? skills.filter((skill) =>
                skill.skill_group_ids.includes(viewedSkillGroup.id),
              ).length
            : 0
        }
      />

      <div className="app-toolbar">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full min-w-[200px] max-w-[280px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("mySkills.searchPlaceholder")}
              className="app-input w-full pl-9 font-medium"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {viewedSkillGroup && (
            <div className="app-segmented app-toolbar-segmented shrink-0">
              {(["enabled", "all", "available"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={cn(
                    "app-segmented-button",
                    filterMode === mode && "app-segmented-button-active",
                  )}
                >
                  {t(`mySkills.filters.${mode}`)}
                  <span className="ml-1 opacity-60">{filterCounts[mode]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Keep all library actions in one toolbar so they wrap together. */}
        <div className="flex items-center gap-3">
          <div className="app-segmented app-toolbar-segmented shrink-0">
            {(() => {
              const mode = getGitToolbarMode();
              const meta = getGitStatusMeta(mode);
              const Icon = meta.icon;
              return (
                <button
                  type="button"
                  onClick={() => navigate("/backup")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-3 py-2 text-[13px] font-medium transition-colors hover:bg-surface-hover hover:text-secondary",
                    meta.className,
                  )}
                  title={t("sidebar.backup")}
                >
                  <Icon className={cn("h-3.5 w-3.5", meta.iconClassName)} />
                  {meta.label}
                </button>
              );
            })()}
            <button
              onClick={handleCheckAllUpdates}
              disabled={checkingAll}
              className="ml-2 mr-2 inline-flex items-center gap-1 rounded-md border-l border-border-subtle pl-4 pr-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", checkingAll && "animate-spin")}
              />
              {t("mySkills.updateActions.checkAll")}
            </button>
            <button
              onClick={handleUpdateAvailableSkills}
              disabled={batchUpdating || availableUpdateCount === 0}
              className="mr-2 inline-flex items-center gap-1 rounded-md px-3 py-2 text-[13px] font-medium text-accent-light transition-colors hover:bg-accent-bg disabled:opacity-50"
            >
              <RotateCcw
                className={cn("h-3.5 w-3.5", batchUpdating && "animate-spin")}
              />
              {t("mySkills.updateActions.updateAvailable", {
                count: availableUpdateCount,
              })}
            </button>
            <span
              aria-hidden="true"
              className="mx-1 h-5 w-px shrink-0 self-center bg-border-subtle"
            />
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-md p-2 transition-colors outline-none",
                viewMode === "grid"
                  ? "bg-surface-active text-secondary"
                  : "text-muted hover:text-tertiary",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-2 transition-colors outline-none",
                viewMode === "list"
                  ? "bg-surface-active text-secondary"
                  : "text-muted hover:text-tertiary",
              )}
            >
              <List className="h-4 w-4" />
            </button>

            {/* Selection can stay active in either view. */}
            <span
              aria-hidden="true"
              className="mx-1 h-5 w-px shrink-0 self-center bg-border-subtle"
            />
            <button
              type="button"
              aria-pressed={isMultiSelect}
              onClick={() =>
                isMultiSelect ? exitMultiSelect() : setIsMultiSelect(true)
              }
              className={cn(
                "app-segmented-button inline-flex items-center gap-1.5 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-border",
                isMultiSelect &&
                  "app-segmented-button-active hover:bg-surface-active hover:text-secondary",
              )}
            >
              <SquareCheck className="h-4 w-4" />
              {isMultiSelect
                ? t("mySkills.cancelSelect")
                : t("mySkills.selectMode")}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 px-1 -mt-2 -mb-3">
        {(["local", "import", "git", "skillssh"] as const).map((src) => (
          <button
            key={src}
            onClick={() => setSourceFilters(toggleFilter(sourceFilters, src))}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
              sourceFilters.has(src)
                ? "bg-accent text-white dark:bg-accent dark:text-white"
                : "bg-surface-hover text-muted hover:text-secondary",
            )}
          >
            {t(`mySkills.sourceFilter.${src}`)}
          </button>
        ))}
        {skills.some((s) => s.skill_group_ids.length === 0) && (
          <>
            <span className="mx-0.5 h-3 w-px bg-border-subtle" />
            <button
              onClick={() => setFilterUngrouped((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                filterUngrouped
                  ? "bg-surface-active text-primary"
                  : "border border-dashed border-border text-muted hover:text-secondary",
              )}
            >
              <CircleSlash className="h-3 w-3" />
              {t("mySkills.sourceFilter.ungrouped")}
              <span className="opacity-60">{ungroupedCount}</span>
            </button>
          </>
        )}
        {allTags.length > 0 && (
          <>
            <span className="mx-0.5 h-3 w-px bg-border-subtle" />
            {skills.some((s) => s.tags.length === 0) &&
              (() => {
                const isActive = tagFilters.has(UNTAGGED_FILTER);
                return (
                  <button
                    onClick={() =>
                      setTagFilters(toggleFilter(tagFilters, UNTAGGED_FILTER))
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                      isActive
                        ? "bg-surface-active text-primary"
                        : "border border-dashed border-border text-muted hover:text-secondary",
                    )}
                    title={t("mySkills.tags.untagged")}
                  >
                    <CircleSlash className="h-3 w-3" />
                    {t("mySkills.tags.untagged")}
                  </button>
                );
              })()}
            {allTags.map((tag) => {
              const isActive = tagFilters.has(tag);
              return (
                <button
                  key={tag}
                  onClick={() => setTagFilters(toggleFilter(tagFilters, tag))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTagMenu({
                      tag,
                      x: Math.min(e.clientX, window.innerWidth - 160),
                      y: Math.min(e.clientY, window.innerHeight - 90),
                    });
                  }}
                  title={t("mySkills.tags.manageHint")}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                    isActive
                      ? getTagActiveColor(tag, allTags)
                      : getTagColor(tag, allTags),
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </>
        )}
      </div>

      {isMultiSelect && (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          isAllSelected={isAllSelected}
          actions={[
            ...(viewedSkillGroup && togglableSelectedSkills.length > 0
              ? [
                  {
                    key: "toggle",
                    tone: "primary" as const,
                    label: anyDisabled
                      ? t("mySkills.batchEnable", {
                          count: togglableSelectedSkills.length,
                        })
                      : t("mySkills.batchDisable", {
                          count: togglableSelectedSkills.length,
                        }),
                    icon: anyDisabled ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Circle className="h-3.5 w-3.5" />
                    ),
                    busy: batchToggling,
                    onSelect: handleBatchToggleSkillGroup,
                  },
                ]
              : []),
            {
              key: "sync",
              label: t("mySkills.batchSyncAgents", { count: selectedIds.size }),
              icon: <Share2 className="h-3.5 w-3.5" />,
              onSelect: () => setBatchSyncDialogOpen(true),
            },
            {
              key: "tags",
              label: t("mySkills.batchEditTags", { count: selectedIds.size }),
              icon: <Tag className="h-3.5 w-3.5" />,
              onSelect: () => setBatchTagDialogOpen(true),
            },
          ]}
          overflowActions={[
            ...(anyRefreshableSelected
              ? [
                  {
                    key: "update",
                    label: t("mySkills.batchUpdate", {
                      count: refreshableSelectedCount,
                    }),
                    icon: <RotateCcw className="h-3.5 w-3.5" />,
                    busy: batchUpdating,
                    onSelect: handleBatchRefresh,
                  },
                ]
              : []),
            {
              key: "delete",
              tone: "danger" as const,
              label: t("mySkills.deleteSelected", { count: selectedIds.size }),
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onSelect: () => setBatchDeleteConfirm(true),
            },
          ]}
          labels={{
            hint: t("mySkills.selectHint"),
            selected: t("mySkills.selectedCount", { count: selectedIds.size }),
            selectAll: t("mySkills.selectAll"),
            deselectAll: t("mySkills.deselectAll"),
            cancel: t("common.cancel"),
            more: t("mySkills.moreActions"),
          }}
          onSelectAll={handleSelectAll}
          onCancel={exitMultiSelect}
        />
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
          <Layers className="mb-4 h-12 w-12 text-faint" />
          <h3 className="mb-1.5 text-[14px] font-semibold text-tertiary">
            {t("mySkills.noSkills")}
          </h3>
          <p className="text-[13px] text-muted">
            {skills.length === 0
              ? t("mySkills.addFirst")
              : t("mySkills.noMatch")}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="app-button-secondary mt-4"
            >
              {t("mySkills.clearFilters")}
            </button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filtered.map((s) => s.id)}
            strategy={
              viewMode === "grid"
                ? rectSortingStrategy
                : verticalListSortingStrategy
            }
          >
            <div
              className={cn(
                "pb-8",
                viewMode === "grid"
                  ? "grid grid-cols-2 gap-3 lg:grid-cols-3"
                  : "flex flex-col gap-0.5",
              )}
            >
              {filtered.map((skill) => {
                const enabledInSkillGroup = viewedSkillGroup
                  ? skill.skill_group_ids.includes(viewedSkillGroup.id)
                  : false;
                const badge = statusBadge(skill);
                const hasUpdate =
                  skill.update_status === "update_available" &&
                  canRefresh(skill);
                // The header pill is hidden in multi-select, so the body badge has to
                // take over — otherwise the update state vanishes entirely.
                const showUpdatePill = hasUpdate && !isMultiSelect;
                const isMissingLocalSource =
                  skill.update_status === "source_missing" &&
                  (skill.source_type === "local" ||
                    skill.source_type === "import");
                const displayName =
                  skillDisplayNames.get(skill.id) || skill.name;

                if (viewMode === "grid") {
                  return (
                    <SortableSkillItem
                      key={skill.id}
                      id={skill.id}
                      disabled={!canDrag}
                      className={
                        tagEditSkillId === skill.id || menuSkillId === skill.id
                          ? "relative z-30"
                          : undefined
                      }
                      handleTitle={t("mySkills.dragToReorder")}
                      handleClassName="absolute inset-0 flex cursor-grab items-center justify-center rounded text-faint opacity-0 transition-opacity hover:text-muted group-hover:opacity-100 active:cursor-grabbing"
                    >
                      {(dragHandle) => (
                        <div
                          className={cn(
                            "app-panel group relative flex h-full cursor-pointer flex-col shadow-card transition-all hover:-translate-y-px hover:border-border hover:shadow-card-hover",
                            isMultiSelect &&
                              selectedIds.has(skill.id) &&
                              "ring-1 ring-accent border-accent/40",
                          )}
                          onClick={() =>
                            isMultiSelect
                              ? toggleSelect(skill.id)
                              : openSkillDetailById(skill.id)
                          }
                        >
                          {deletingIds.has(skill.id) && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-surface/70 backdrop-blur-[1px]">
                              <Loader2 className="h-5 w-5 animate-spin text-muted" />
                            </div>
                          )}

                          <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-1.5">
                            {/* Fixed-width slot: status dot / drag handle on hover / checkbox in multi-select */}
                            <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                              {isMultiSelect ? (
                                selectedIds.has(skill.id) ? (
                                  <SquareCheck className="h-3.5 w-3.5 text-accent" />
                                ) : (
                                  <Square className="h-3.5 w-3.5 text-faint" />
                                )
                              ) : (
                                <>
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full transition-opacity",
                                      canDrag && "group-hover:opacity-0",
                                      enabledInSkillGroup
                                        ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
                                        : "bg-surface-active",
                                    )}
                                    title={
                                      enabledInSkillGroup
                                        ? t("mySkills.membership.inNamed", {
                                            group: viewedSkillGroupName,
                                          })
                                        : t("mySkills.membership.notInNamed", {
                                            group: viewedSkillGroupName,
                                          })
                                    }
                                  />
                                  {dragHandle}
                                </>
                              )}
                            </div>
                            <h3
                              className="flex-1 truncate text-[14px] font-semibold text-primary group-hover:text-accent-light"
                              title={displayName}
                            >
                              {displayName}
                            </h3>
                            {showUpdatePill && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRefreshSkill(skill);
                                }}
                                disabled={updatingSkillId === skill.id}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-600 outline-none transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
                                title={refreshLabel(skill)}
                              >
                                <RotateCcw
                                  className={cn(
                                    "h-2.5 w-2.5",
                                    updatingSkillId === skill.id &&
                                      "animate-spin",
                                  )}
                                />
                                {t("mySkills.updateActions.update")}
                              </button>
                            )}
                            {!isMultiSelect && (
                              <>
                                <CardActionMenu
                                  label={t("mySkills.moreActions")}
                                  onOpenChange={(open) =>
                                    setMenuSkillId(open ? skill.id : null)
                                  }
                                  className={cn(
                                    "transition-opacity",
                                    menuSkillId === skill.id
                                      ? "opacity-100"
                                      : "opacity-0 group-hover:opacity-100",
                                  )}
                                  actions={[
                                    {
                                      key: "check",
                                      label: t("mySkills.updateActions.check"),
                                      icon: (
                                        <RefreshCw
                                          className={cn(
                                            "h-3.5 w-3.5",
                                            checkingSkillId === skill.id &&
                                              "animate-spin",
                                          )}
                                        />
                                      ),
                                      disabled: checkingSkillId === skill.id,
                                      onSelect: () => handleCheckUpdate(skill),
                                    },
                                    ...(canRefresh(skill)
                                      ? [
                                          {
                                            key: "refresh",
                                            label: refreshLabel(skill),
                                            icon: (
                                              <RotateCcw
                                                className={cn(
                                                  "h-3.5 w-3.5",
                                                  updatingSkillId ===
                                                    skill.id && "animate-spin",
                                                )}
                                              />
                                            ),
                                            disabled:
                                              updatingSkillId === skill.id,
                                            onSelect: () =>
                                              handleRefreshSkill(skill),
                                          },
                                        ]
                                      : []),
                                    {
                                      key: "delete",
                                      label: t("common.delete"),
                                      icon: <Trash2 className="h-3.5 w-3.5" />,
                                      danger: true,
                                      onSelect: () => setSkillToDelete(skill),
                                    },
                                  ]}
                                />
                                <SkillGroupMembershipButton
                                  included={enabledInSkillGroup}
                                  groupName={
                                    viewedSkillGroup
                                      ? viewedSkillGroupName
                                      : undefined
                                  }
                                  skillName={skill.name}
                                  onChange={() => handleToggleSkillGroup(skill)}
                                />
                              </>
                            )}
                          </div>

                          <div className="px-3.5 pb-3">
                            <p className="text-[13px] leading-[18px] text-muted truncate">
                              {skill.description || "—"}
                            </p>
                            {((badge && !showUpdatePill) ||
                              conflictIds.has(skill.id)) && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {conflictIds.has(skill.id) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate("/backup");
                                    }}
                                    className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[13px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                                    title={t("mySkills.needsAttentionHint")}
                                  >
                                    {t("mySkills.needsAttention")}
                                  </button>
                                )}
                                {badge && !showUpdatePill && (
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[13px] font-medium",
                                      badge.className,
                                    )}
                                  >
                                    {badge.label}
                                  </span>
                                )}
                                {isMissingLocalSource && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRelinkSource(skill);
                                      }}
                                      disabled={updatingSkillId === skill.id}
                                      className="rounded-full border border-border-subtle px-2 py-0.5 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                                    >
                                      {t("mySkills.updateActions.relink")}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDetachSource(skill);
                                      }}
                                      disabled={updatingSkillId === skill.id}
                                      className="rounded-full border border-border-subtle px-2 py-0.5 text-[12px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
                                    >
                                      {t("mySkills.updateActions.detachSource")}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {skill.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className={cn(
                                    "group/tag inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    getTagColor(tag, allTags),
                                  )}
                                >
                                  {tag}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveTag(skill, tag);
                                    }}
                                    className="hidden group-hover/tag:inline-flex rounded-full p-0 opacity-60 hover:opacity-100"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              ))}
                              {tagEditSkillId === skill.id ? (
                                <div
                                  className="relative"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    ref={tagInputRef}
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) =>
                                      setTagInput(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleAddTag(skill);
                                      }
                                      if (e.key === "Escape") {
                                        setTagEditSkillId(null);
                                        setTagInput("");
                                      }
                                    }}
                                    onBlur={() => {
                                      if (tagInput.trim()) handleAddTag(skill);
                                      else {
                                        setTagEditSkillId(null);
                                        setTagInput("");
                                      }
                                    }}
                                    placeholder={t("mySkills.tags.addTag")}
                                    className="h-5 w-28 rounded-full border border-border-subtle bg-transparent px-1.5 text-[11px] text-secondary outline-none focus:border-accent"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    autoComplete="off"
                                    spellCheck={false}
                                    autoFocus
                                  />
                                  {getTagOptions(skill, tagInput).length >
                                    0 && (
                                    <div className="absolute left-0 top-6 z-50 max-h-56 min-w-[112px] max-w-[180px] overflow-y-auto rounded-md border border-border-subtle bg-surface p-1 shadow-lg">
                                      {getTagOptions(skill, tagInput).map(
                                        (tagOption) => (
                                          <button
                                            key={tagOption}
                                            type="button"
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleAddTag(skill, tagOption);
                                            }}
                                            className="w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-secondary hover:bg-surface-hover"
                                            title={tagOption}
                                          >
                                            {tagOption}
                                          </button>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTagEditSkillId(skill.id);
                                    setTagInput("");
                                  }}
                                  className="inline-flex items-center rounded-full p-0.5 text-faint transition-colors hover:text-muted opacity-0 group-hover:opacity-100"
                                  title={t("mySkills.tags.addTag")}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-faint px-3.5 py-2.5">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted">
                                {sourceIcon(skill.source_type)}
                                {sourceTypeLabel(skill)}
                              </span>
                              {sourceRefLabel(skill) && (
                                <>
                                  <span className="text-faint">·</span>
                                  <span className="truncate text-[12px] text-faint" title={skill.source_ref ?? undefined}>
                                    {sourceRefLabel(skill)}
                                  </span>
                                </>
                              )}
                              {skill.skill_group_ids.length > 0 && (
                                <>
                                  <span className="text-faint">·</span>
                                  <span className="truncate text-[12px] font-medium text-amber-600 dark:text-amber-400/80">
                                    {skill.skill_group_ids
                                      .map((gid) => groupNameMap.get(gid))
                                      .filter(Boolean)
                                      .join(", ")}
                                  </span>
                                </>
                              )}
                            </div>
                            <SyncDots
                              className="shrink-0"
                              skill={skill}
                              tools={tools}
                              limit={6}
                              onToggle={
                                isMultiSelect
                                  ? undefined
                                  : (tool, enabled) =>
                                      handleToggleSkillTarget(
                                        skill,
                                        tool,
                                        enabled,
                                      )
                              }
                              pendingKey={
                                togglingTarget?.skillId === skill.id
                                  ? togglingTarget.tool
                                  : null
                              }
                            />
                          </div>
                        </div>
                      )}
                    </SortableSkillItem>
                  );
                }

                return (
                  <SortableSkillItem
                    key={skill.id}
                    id={skill.id}
                    disabled={!canDrag}
                    className={
                      menuSkillId === skill.id ? "relative z-30" : undefined
                    }
                    handleTitle={t("mySkills.dragToReorder")}
                    handleClassName="absolute inset-0 flex cursor-grab items-center justify-center rounded text-faint opacity-0 transition-opacity hover:text-muted group-hover:opacity-100 active:cursor-grabbing"
                  >
                    {(dragHandle) => (
                      <div
                        className={cn(
                          "app-panel group relative flex cursor-pointer items-center gap-3.5 rounded-xl border-transparent px-3.5 py-3 transition-all hover:border-border hover:bg-surface-hover",
                          isMultiSelect &&
                            selectedIds.has(skill.id) &&
                            "ring-1 ring-accent border-accent/40",
                        )}
                        onClick={() =>
                          isMultiSelect
                            ? toggleSelect(skill.id)
                            : openSkillDetailById(skill.id)
                        }
                      >
                        {deletingIds.has(skill.id) && (
                          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-surface/70 backdrop-blur-[1px]">
                            <Loader2 className="h-5 w-5 animate-spin text-muted" />
                          </div>
                        )}
                        {/* Same fixed slot as the grid card: status dot / drag handle / checkbox */}
                        <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                          {isMultiSelect ? (
                            selectedIds.has(skill.id) ? (
                              <SquareCheck className="h-3.5 w-3.5 text-accent" />
                            ) : (
                              <Square className="h-3.5 w-3.5 text-faint" />
                            )
                          ) : (
                            <>
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full transition-opacity",
                                  canDrag && "group-hover:opacity-0",
                                  enabledInSkillGroup
                                    ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
                                    : "bg-surface-active",
                                )}
                                title={
                                  enabledInSkillGroup
                                    ? t("mySkills.membership.inNamed", {
                                        group: viewedSkillGroupName,
                                      })
                                    : t("mySkills.membership.notInNamed", {
                                        group: viewedSkillGroupName,
                                      })
                                }
                              />
                              {dragHandle}
                            </>
                          )}
                        </div>

                        <h3
                          className="w-[180px] shrink-0 truncate text-[14px] font-semibold text-secondary group-hover:text-primary"
                          title={displayName}
                        >
                          {displayName}
                        </h3>

                        <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
                          {skill.description || "—"}
                        </p>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {skill.tags.map((tag) => (
                            <span
                              key={tag}
                              className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                                getTagColor(tag, allTags),
                              )}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="flex shrink-0 items-center gap-2.5">
                          {conflictIds.has(skill.id) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("/backup");
                              }}
                              className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[12px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                              title={t("mySkills.needsAttentionHint")}
                            >
                              {t("mySkills.needsAttention")}
                            </button>
                          )}
                          {hasUpdate && !isMultiSelect ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRefreshSkill(skill);
                              }}
                              disabled={updatingSkillId === skill.id}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-600 outline-none transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
                              title={refreshLabel(skill)}
                            >
                              <RotateCcw
                                className={cn(
                                  "h-2.5 w-2.5",
                                  updatingSkillId === skill.id &&
                                    "animate-spin",
                                )}
                              />
                              {t("mySkills.updateActions.update")}
                            </button>
                          ) : (
                            badge && (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[12px] font-medium",
                                  badge.className,
                                )}
                              >
                                {badge.label}
                              </span>
                            )
                          )}
                          <SyncDots
                            skill={skill}
                            tools={tools}
                            limit={6}
                            size="sm"
                            onToggle={
                              isMultiSelect
                                ? undefined
                                : (tool, enabled) =>
                                    handleToggleSkillTarget(
                                      skill,
                                      tool,
                                      enabled,
                                    )
                            }
                            pendingKey={
                              togglingTarget?.skillId === skill.id
                                ? togglingTarget.tool
                                : null
                            }
                          />
                          <span className="inline-flex items-center gap-1 text-[13px] text-muted">
                            {sourceIcon(skill.source_type)}
                            {sourceTypeLabel(skill)}
                          </span>
                          {sourceRefLabel(skill) && (
                            <span className="text-[13px] text-faint" title={skill.source_ref ?? undefined}>
                              {sourceRefLabel(skill)}
                            </span>
                          )}
                          {skill.skill_group_ids.length > 0 && (
                            <span className="text-[13px] font-medium text-amber-600 dark:text-amber-400/80">
                              {skill.skill_group_ids
                                .map((gid) => groupNameMap.get(gid))
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          )}
                        </div>

                        {isMissingLocalSource && !isMultiSelect && (
                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRelinkSource(skill);
                              }}
                              disabled={updatingSkillId === skill.id}
                              className="rounded px-2 py-0.5 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                            >
                              {t("mySkills.updateActions.relink")}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDetachSource(skill);
                              }}
                              disabled={updatingSkillId === skill.id}
                              className="rounded px-2 py-0.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
                            >
                              {t("mySkills.updateActions.detachSource")}
                            </button>
                          </div>
                        )}

                        {!isMultiSelect && (
                          <div className="flex shrink-0 items-center gap-2">
                            <CardActionMenu
                              label={t("mySkills.moreActions")}
                              onOpenChange={(open) =>
                                setMenuSkillId(open ? skill.id : null)
                              }
                              className={cn(
                                "transition-opacity",
                                menuSkillId === skill.id
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100",
                              )}
                              actions={[
                                {
                                  key: "check",
                                  label: t("mySkills.updateActions.check"),
                                  icon: (
                                    <RefreshCw
                                      className={cn(
                                        "h-3.5 w-3.5",
                                        checkingSkillId === skill.id &&
                                          "animate-spin",
                                      )}
                                    />
                                  ),
                                  disabled: checkingSkillId === skill.id,
                                  onSelect: () => handleCheckUpdate(skill),
                                },
                                ...(canRefresh(skill)
                                  ? [
                                      {
                                        key: "refresh",
                                        label: refreshLabel(skill),
                                        icon: (
                                          <RotateCcw
                                            className={cn(
                                              "h-3.5 w-3.5",
                                              updatingSkillId === skill.id &&
                                                "animate-spin",
                                            )}
                                          />
                                        ),
                                        disabled: updatingSkillId === skill.id,
                                        onSelect: () =>
                                          handleRefreshSkill(skill),
                                      },
                                    ]
                                  : []),
                                {
                                  key: "delete",
                                  label: t("common.delete"),
                                  icon: <Trash2 className="h-3.5 w-3.5" />,
                                  danger: true,
                                  onSelect: () => setSkillToDelete(skill),
                                },
                              ]}
                            />
                            <SkillGroupMembershipButton
                              included={enabledInSkillGroup}
                              groupName={
                                viewedSkillGroup
                                  ? viewedSkillGroupName
                                  : undefined
                              }
                              skillName={skill.name}
                              onChange={() => handleToggleSkillGroup(skill)}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </SortableSkillItem>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <SkillDetailPanel
        key={selectedSkill?.id ?? "skill-detail-empty"}
        skill={selectedSkill}
        onClose={closeSkillDetail}
        tools={tools}
        toolToggles={toolToggles}
        togglingTool={togglingToolKey}
        onToggleTool={handleToggleSkillTool}
        projects={projects}
        onProjectsChanged={refreshProjects}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        tone="warning"
        title={t("mySkills.updateActions.removalTitle")}
        message={t("mySkills.updateActions.removalMessage", {
          name: pendingRemoval?.skill.name ?? "",
          count: pendingRemoval?.removals.length ?? 0,
        })}
        // Every path, never a truncated sample: recognising one's own file is
        // the whole point, and it might be the twenty-first.
        details={pendingRemoval?.removals.map((r) =>
          r.location === "library" ? r.path : `${r.location}: ${r.path}`,
        )}
        confirmLabel={t("mySkills.updateActions.removalConfirm")}
        onClose={() => setPendingRemoval(null)}
        onConfirm={async () => {
          const target = pendingRemoval?.skill;
          const approval = pendingRemoval?.approval ?? undefined;
          const relinkSource = pendingRemoval?.relinkSource;
          setPendingRemoval(null);
          if (!target) return;
          if (relinkSource) {
            await handleRelinkSource(target, relinkSource, approval);
          } else {
            await handleRefreshSkill(target, approval);
          }
        }}
      />
      <ConfirmDialog
        open={batchDeleteConfirm}
        message={t("mySkills.batchDeleteConfirm", { count: selectedIds.size })}
        onClose={() => setBatchDeleteConfirm(false)}
        onConfirm={handleBatchDelete}
      />
      <ConfirmDialog
        open={skillToDelete !== null}
        title={t("mySkills.delete")}
        message={t("mySkills.deleteConfirm", {
          name: skillToDelete?.name || "",
        })}
        onClose={() => setSkillToDelete(null)}
        onConfirm={async () => {
          if (skillToDelete) handleDeleteSkill(skillToDelete);
        }}
      />
      <ConfirmDialog
        open={tagToDelete !== null}
        title={t("mySkills.tags.deleteTag")}
        message={t("mySkills.tags.deleteConfirm", { tag: tagToDelete || "" })}
        onClose={() => setTagToDelete(null)}
        onConfirm={handleDeleteTag}
      />
      <ConfirmDialog
        open={moveConfirm !== null}
        tone="warning"
        title={t("mySkills.membership.moveConfirmTitle")}
        message={t("mySkills.membership.moveConfirmMessage", {
          skill: moveConfirm?.skill.name ?? "",
          fromGroup: moveConfirm?.fromGroupName ?? "",
          toGroup: viewedSkillGroupName,
        })}
        confirmLabel={t("mySkills.membership.moveConfirmAction")}
        onClose={cancelMove}
        onConfirm={confirmMove}
      />
      <TagRenameDialog
        open={tagToRename !== null}
        currentName={tagToRename || ""}
        onClose={() => setTagToRename(null)}
        onRename={handleRenameTag}
      />
      {tagMenu && (
        <>
          {/* Backdrop closes on left- or right-click outside the menu. Explicit
              z-index (z-40/z-50) to avoid the macOS WKWebView stacking bug. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setTagMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTagMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-2xl"
            style={{ top: tagMenu.y, left: tagMenu.x }}
          >
            <button
              onClick={() => {
                setTagToRename(tagMenu.tag);
                setTagMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-secondary hover:bg-surface-hover"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("mySkills.tags.renameTag")}
            </button>
            <button
              onClick={() => {
                setTagToDelete(tagMenu.tag);
                setTagMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-400 hover:bg-surface-hover"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("mySkills.tags.deleteTag")}
            </button>
          </div>
        </>
      )}
      <BatchTagDialog
        open={batchTagDialogOpen}
        skills={skills.filter((s) => selectedIds.has(s.id))}
        allTags={allTags}
        onClose={() => setBatchTagDialogOpen(false)}
        onApply={handleBatchEditTags}
      />

      <BatchSyncAgentDialog
        open={batchSyncDialogOpen}
        skills={skills.filter((s) => selectedIds.has(s.id))}
        tools={tools}
        onClose={() => setBatchSyncDialogOpen(false)}
        onApply={handleBatchSyncAgents}
      />
    </div>
  );
}
