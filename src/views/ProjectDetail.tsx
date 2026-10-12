import { ProjectSkillDetailPanel } from "../components/ProjectSkillDetailPanel";
import {
  getProjectSkillStatusMeta as getSyncStatusMeta,
  getAssignedAgents,
  type ProjectSkillEntry,
} from "../lib/projectSkillEntries";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FolderOpen,
  Search,
  LayoutGrid,
  List,
  RefreshCw,
  FileText,
  Download,
  Upload,
  Layers,
  X,
  Trash2,
  SquareCheck,
  Square,
  Plus,
  CircleSlash,
  CheckCircle2,
  Circle,
  Tag,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { useMultiSelect } from "../hooks/useMultiSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MultiSelectToolbar } from "../components/MultiSelectToolbar";
import { ProjectBatchAgentDialog } from "../components/ProjectBatchAgentDialog";
import { ProjectEnabledAgents } from "../components/ProjectEnabledAgents";
import { BatchTagDialog } from "../components/BatchTagDialog";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { uploadProjectSkillToGroup } from "../lib/projectSkillUpload";
import { ProjectSkillConflictPreview } from "../components/ProjectSkillConflictPreview";
import { ProjectAgentDots } from "../components/ProjectAgentDots";
import { SkillGroupBar } from "../components/SkillGroupBar";
import { ProjectSkillCardHeader } from "../components/ProjectSkillCardHeader";
import { ProjectSkillSyncActions } from "../components/ProjectSkillSyncActions";
import { ProjectSkillBadges } from "../components/ProjectSkillBadges";
import {
  getTagActiveColor,
  getTagColor,
  pruneStaleTagFilters,
  UNTAGGED_FILTER,
} from "../lib/skillTags";
import {
  detectedProjectAgentFilters,
  getDefaultExportAgents,
} from "../lib/exportAgents";
import { cn, compactHomePath } from "../utils";
import * as api from "../lib/tauri";
import type {
  ProjectSkill,
  ManagedSkill,
  ProjectAgentTarget,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { SkillDirectoryActions } from "../components/SkillDirectoryActions";
import {
  deleteProjectSkillGroup,
  toggleProjectSkillGroup,
} from "../lib/projectLibraryActions";
import { ProjectLibraryPanel } from "../components/ProjectLibraryPanel";
import { AddSkillsSheet } from "../components/AddSkillsSheet";
import { AgentIcon } from "../components/AgentIcon";
const projectLastUsedAgentsKey = (projectId: string) =>
  `project_last_used_export_agents:${projectId}`;

function getGroupStatus(variants: ProjectSkill[]): ProjectSkill["sync_status"] {
  const priority: ProjectSkill["sync_status"][] = [
    "diverged",
    "project_newer",
    "center_newer",
    "project_only",
    "in_sync",
  ];
  for (const status of priority) {
    if (variants.some((variant) => variant.sync_status === status)) {
      return status;
    }
  }
  return "project_only";
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    projects,
    skillGroups,
    managedSkills,
    refreshManagedSkills,
    refreshSkillGroups,
    refreshProjects,
  } = useApp();
  const [skills, setSkills] = useState<ProjectSkill[]>([]);
  const [projectAgentTargets, setProjectAgentTargets] = useState<
    ProjectAgentTarget[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterMode, setFilterMode] = useState<"all" | "enabled" | "disabled">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [agentFilters, setAgentFilters] = useState<Set<string>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [detailSkill, setDetailSkill] = useState<ProjectSkillEntry | null>(
    null,
  );
  const [updatingCenterSkill, setUpdatingCenterSkill] = useState<string | null>(
    null,
  );
  const [updatingProjectSkill, setUpdatingProjectSkill] = useState<
    string | null
  >(null);
  const [batchUpdatingCenter, setBatchUpdatingCenter] = useState(false);
  const [batchUpdatingProject, setBatchUpdatingProject] = useState(false);
  const [centerConflict, setCenterConflict] = useState<{
    skill: ProjectSkillEntry;
    variants: ProjectSkill[];
  } | null>(null);
  const [centerConflictAgent, setCenterConflictAgent] = useState<string | null>(
    null,
  );
  const [centerConflictGroup, setCenterConflictGroup] = useState<
    string | undefined
  >();
  const [togglingSkill, setTogglingSkill] = useState<string | null>(null);
  const [togglingAgentTarget, setTogglingAgentTarget] = useState<{
    skillKey: string;
    agent: string;
  } | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSkillEntry | null>(
    null,
  );
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [batchTagDialogOpen, setBatchTagDialogOpen] = useState(false);
  const [batchAgentMode, setBatchAgentMode] = useState<boolean | null>(null);
  const PROJECT_ADD_CALLOUT_KEY = "agent-hub.projectAddCalloutDismissed";
  const [showAddCallout, setShowAddCallout] = useState(() => {
    try {
      return localStorage.getItem(PROJECT_ADD_CALLOUT_KEY) !== "1";
    } catch {
      return false;
    }
  });
  const dismissAddCallout = () => {
    setShowAddCallout(false);
    try {
      localStorage.setItem(PROJECT_ADD_CALLOUT_KEY, "1");
    } catch {
      // ignore
    }
  };

  const project = projects.find((p) => p.id === id);
  const getSkillKey = useCallback((skill: Pick<ProjectSkillEntry, "id">) => {
    return skill.id;
  }, []);

  // Scanning a project is slow enough that switching projects can let the older
  // scan land last, swapping another project's skills in under this route — and
  // now also pruning this project's tag filter against the other one's tags.
  // Same request-id guard as WorkspaceView's local-skill load.
  const skillsRequestRef = useRef(0);
  const loadSkills = useCallback(async () => {
    if (!id) return;
    const requestId = ++skillsRequestRef.current;
    setLoading(true);
    try {
      const result = await api.getProjectSkills(id);
      if (skillsRequestRef.current === requestId) setSkills(result);
    } catch (e) {
      console.error("Failed to load project skills:", e);
    } finally {
      if (skillsRequestRef.current === requestId) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    setSearch("");
    setFilterMode("all");
    setAgentFilters(new Set());
    setTagFilters(new Set());
    setDetailSkill(null);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const loadProjectAgentTargets = async () => {
      if (!id) return;
      try {
        const result = await api.getProjectAgentTargets(id);
        if (!cancelled) {
          setProjectAgentTargets(result);
        }
      } catch (e) {
        console.error("Failed to load project agent targets:", e);
      }
    };
    loadProjectAgentTargets();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!project && !loading) {
      navigate("/");
    }
  }, [project, loading, navigate]);

  const groupedSkills = useMemo<ProjectSkillEntry[]>(() => {
    const groups = new Map<string, ProjectSkillEntry>();
    for (const skill of skills) {
      const key = skill.relative_path.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.variants.push(skill);
        existing.enabledCount += skill.enabled ? 1 : 0;
        existing.totalCount += 1;
        existing.files = Array.from(
          new Set([...existing.files, ...skill.files]),
        ).sort();
        existing.tags = Array.from(
          new Set([...existing.tags, ...skill.tags]),
        ).sort((a, b) => a.localeCompare(b));
        if (
          skill.center_skill_id &&
          !existing.centerSkillIds.includes(skill.center_skill_id)
        ) {
          existing.centerSkillIds.push(skill.center_skill_id);
          existing.centerSkillIds.sort((a, b) => a.localeCompare(b));
        }
        if (!existing.description && skill.description) {
          existing.description = skill.description;
        }
        continue;
      }
      groups.set(key, {
        id: key,
        name: skill.name,
        dir_name: skill.dir_name,
        relative_path: skill.relative_path,
        description: skill.description,
        files: [...skill.files],
        variants: [skill],
        enabledCount: skill.enabled ? 1 : 0,
        totalCount: 1,
        primaryVariant: skill,
        status: skill.sync_status,
        tags: [...skill.tags].sort((a, b) => a.localeCompare(b)),
        centerSkillIds: skill.center_skill_id ? [skill.center_skill_id] : [],
      });
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        variants: [...group.variants].sort((a, b) =>
          a.agent_display_name.localeCompare(b.agent_display_name),
        ),
        primaryVariant: [...group.variants].sort((a, b) =>
          a.agent_display_name.localeCompare(b.agent_display_name),
        )[0],
        status: getGroupStatus(group.variants),
      }))
      .sort((a, b) => {
        // Put skills that need attention ahead of the clean list. This keeps
        // project workspaces useful as a review queue while preserving the
        // stable alphabetical order within each sync state.
        const statusRank: Record<ProjectSkill["sync_status"], number> = {
          diverged: 0,
          project_newer: 1,
          center_newer: 2,
          project_only: 3,
          in_sync: 4,
        };
        return (
          statusRank[a.status] - statusRank[b.status] ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      });
  }, [skills]);

  const agentFilterOptions = useMemo(
    () => detectedProjectAgentFilters(projectAgentTargets),
    [projectAgentTargets],
  );

  useEffect(() => {
    if (!detailSkill) return;
    const refreshed =
      groupedSkills.find((skill) => skill.id === detailSkill.id) ?? null;
    if (!refreshed) {
      setDetailSkill(null);
      return;
    }
    if (refreshed !== detailSkill) {
      setDetailSkill(refreshed);
    }
  }, [detailSkill, groupedSkills]);

  const groupFilterSkillIds = useMemo(() => {
    if (!groupFilter) return null;
    const managedById = new Map(managedSkills.map((s) => [s.id, s]));
    const ids = new Set<string>();
    for (const entry of groupedSkills) {
      for (const cid of entry.centerSkillIds) {
        const managed = managedById.get(cid);
        if (managed?.skill_group_ids.includes(groupFilter)) {
          ids.add(entry.id);
          break;
        }
      }
    }
    return ids;
  }, [groupFilter, groupedSkills, managedSkills]);

  const filtered = useMemo(() => {
    return groupedSkills.filter((skill) => {
      if (groupFilterSkillIds && !groupFilterSkillIds.has(skill.id))
        return false;
      const matchesSearch =
        skill.name.toLowerCase().includes(search.toLowerCase()) ||
        (skill.description || "").toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (
        agentFilters.size > 0 &&
        !skill.variants.some((variant) => agentFilters.has(variant.agent))
      ) {
        return false;
      }
      if (tagFilters.size > 0) {
        const wantUntagged = tagFilters.has(UNTAGGED_FILTER);
        const matchUntagged = wantUntagged && skill.tags.length === 0;
        const matchTag = skill.tags.some((tag) => tagFilters.has(tag));
        if (!matchUntagged && !matchTag) return false;
      }
      if (filterMode === "enabled") return skill.enabledCount > 0;
      if (filterMode === "disabled") return skill.enabledCount === 0;
      return true;
    });
  }, [
    groupedSkills,
    groupFilterSkillIds,
    search,
    filterMode,
    agentFilters,
    tagFilters,
  ]);

  const hasActiveFilters =
    search.trim() !== "" ||
    filterMode !== "all" ||
    agentFilters.size > 0 ||
    tagFilters.size > 0 ||
    groupFilter !== null;

  const clearFilters = () => {
    setSearch("");
    setFilterMode("all");
    setAgentFilters(new Set());
    setTagFilters(new Set());
    setGroupFilter(null);
  };

  const handleGroupBadgeClick = useCallback((groupId: string) => {
    setGroupFilter((prev) => (prev === groupId ? null : groupId));
  }, []);

  const {
    isMultiSelect,
    setIsMultiSelect,
    selectedIds,
    toggleSelect,
    isAllSelected,
    handleSelectAll,
    exitMultiSelect,
  } = useMultiSelect({
    items: groupedSkills,
    filtered,
    getKey: getSkillKey,
    isItemActive: (s) => s.enabledCount === s.totalCount,
    filterSignal: JSON.stringify([
      search,
      [...agentFilters].sort(),
      [...tagFilters].sort(),
      filterMode,
    ]),
    scopeSignal: id ?? "",
    escapeEnabled:
      !batchTagDialogOpen && !batchDeleteConfirm && batchAgentMode === null,
  });

  const exportTargets = useMemo(() => {
    if (projectAgentTargets.length > 0) return projectAgentTargets;
    return [
      {
        key: "claude_code",
        display_name: "Claude Code",
        enabled: true,
        installed: true,
        is_custom: false,
      },
    ];
  }, [projectAgentTargets]);

  const projectSkillDirNamesByAgent = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const skill of skills) {
      if (!map[skill.agent]) {
        map[skill.agent] = [];
      }
      map[skill.agent].push(skill.relative_path.toLowerCase());
    }
    return map;
  }, [skills]);

  const projectCenterSkillIdsByAgent = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const skill of skills) {
      if (!skill.center_skill_id) continue;
      if (!map[skill.agent]) {
        map[skill.agent] = [];
      }
      map[skill.agent].push(skill.center_skill_id);
    }
    return map;
  }, [skills]);

  const projectSkillGroupVariants = useMemo(() => {
    const map = new Map<string, ProjectSkill>();
    for (const skill of skills) {
      if (!skill.center_skill_id) continue;
      map.set(`${skill.center_skill_id}::${skill.agent}`, skill);
    }
    return map;
  }, [skills]);

  const findProjectSkillGroupVariant = useCallback(
    (skill: ManagedSkill, agentKey: string) =>
      projectSkillGroupVariants.get(`${skill.id}::${agentKey}`) ?? null,
    [projectSkillGroupVariants],
  );

  const selectedExportAgents = useMemo(
    () => getDefaultExportAgents(exportTargets),
    [exportTargets],
  );

  const [lastUsedExportAgents, setLastUsedExportAgents] = useState<
    string[] | null
  >(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getSettings(projectLastUsedAgentsKey(id))
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setLastUsedExportAgents(null);
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setLastUsedExportAgents(
              parsed.filter((x): x is string => typeof x === "string"),
            );
            return;
          }
        } catch {
          // fall through
        }
        setLastUsedExportAgents(null);
      })
      .catch(() => {
        if (!cancelled) setLastUsedExportAgents(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handlePersistLastUsedAgents = useCallback(
    (agents: string[]) => {
      setLastUsedExportAgents(agents);
      if (id) {
        void api
          .setSettings(projectLastUsedAgentsKey(id), JSON.stringify(agents))
          .catch(() => {});
      }
    },
    [id],
  );

  const initialSheetAgents = useMemo(() => {
    const availableKeys = new Set(exportTargets.map((target) => target.key));
    if (lastUsedExportAgents && lastUsedExportAgents.length > 0) {
      const filtered = lastUsedExportAgents.filter((k) => availableKeys.has(k));
      if (filtered.length > 0) return filtered;
    }
    return selectedExportAgents.filter((k) => availableKeys.has(k));
  }, [exportTargets, lastUsedExportAgents, selectedExportAgents]);

  const skillGroupBarAgentKeys = useMemo(() => {
    // The real targets load asynchronously; until they arrive `exportTargets`
    // stands in with a claude_code-only singleton. Applying a skillGroup off that
    // stand-in would deploy to Claude Code alone — the exact failure #400
    // reported — so keep the bar out of the DOM until the targets are real.
    if (projectAgentTargets.length === 0) return [];
    const availableKeys = new Set(exportTargets.map((target) => target.key));
    return selectedExportAgents.filter((key) => availableKeys.has(key));
  }, [exportTargets, projectAgentTargets, selectedExportAgents]);

  const enabledCount = groupedSkills.filter((s) => s.enabledCount > 0).length;
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const skill of groupedSkills) {
      for (const tag of skill.tags) {
        if (tag.trim()) tags.add(tag);
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [groupedSkills]);

  const skillGroupsById = useMemo(() => {
    const map = new Map<string, (typeof skillGroups)[number]>();
    for (const g of skillGroups) map.set(g.id, g);
    return map;
  }, [skillGroups]);

  const skillGroupsForEntry = useMemo(() => {
    const managedById = new Map(managedSkills.map((s) => [s.id, s]));
    const result = new Map<string, (typeof skillGroups)[number][]>();
    for (const entry of groupedSkills) {
      const groupIds = new Set<string>();
      for (const cid of entry.centerSkillIds) {
        const managed = managedById.get(cid);
        if (managed) {
          for (const gid of managed.skill_group_ids) groupIds.add(gid);
        }
      }
      const groups = [...groupIds]
        .map((gid) => skillGroupsById.get(gid))
        .filter((g): g is (typeof skillGroups)[number] => !!g);
      if (groups.length > 0) result.set(entry.id, groups);
    }
    return result;
  }, [groupedSkills, managedSkills, skillGroupsById]);

  // Prune tag filters whose pill disappeared (e.g. its last skill was deleted),
  // otherwise a stale filter silently hides everything. An empty skill list
  // says nothing about which tags are valid, so wait for one before pruning.
  useEffect(() => {
    if (groupedSkills.length === 0) return;
    const hasUntagged = groupedSkills.some((skill) => skill.tags.length === 0);
    setTagFilters((prev) => pruneStaleTagFilters(prev, allTags, hasUntagged));
  }, [allTags, groupedSkills]);

  const selectedSkills = useMemo(
    () => groupedSkills.filter((skill) => selectedIds.has(getSkillKey(skill))),
    [getSkillKey, groupedSkills, selectedIds],
  );
  /**
   * Tags live on the central skill, and one selected row can map to several of
   * them — so the button counts (and the dialog shows) the central skills that
   * will actually change, not the rows that were clicked.
   */
  const selectedCenterSkills = useMemo(() => {
    const byId = new Map(managedSkills.map((skill) => [skill.id, skill]));
    const ids = new Set(
      selectedSkills.flatMap((skill) => skill.centerSkillIds),
    );
    return [...ids]
      .map((centerId) => byId.get(centerId))
      .filter((skill): skill is ManagedSkill => !!skill);
  }, [managedSkills, selectedSkills]);
  // Counts, not booleans: the buttons must announce how many skills they will
  // actually touch, which is rarely the whole selection.
  const updatableCenterCount = useMemo(
    () =>
      selectedSkills.filter(
        (skill) =>
          skill.status === "project_only" ||
          skill.status === "project_newer" ||
          skill.status === "diverged",
      ).length,
    [selectedSkills],
  );
  const updatableProjectCount = useMemo(
    () =>
      selectedSkills.filter(
        (skill) =>
          skill.status === "project_newer" ||
          skill.status === "center_newer" ||
          skill.status === "diverged",
      ).length,
    [selectedSkills],
  );
  const handleOpenDetail = (skill: ProjectSkillEntry) => {
    setDetailSkill(skill);
  };

  // Push one variant to the center, then realign the rest from it.
  //
  // in_sync is the only status that proves a variant holds nothing of its own:
  // it is a content-hash match. center_newer does NOT prove it —
  // classify_sync_status reaches that status only after the hashes already
  // differed, then picks a side by mtime — and project_only was never pushed at
  // all. So any variant that is not in_sync may carry unique content.
  //
  // With more than one such variant there is no safe push. Writing the center
  // rebuilds its directory and moves its mtime to now, so every other unproven
  // variant re-reads as center_newer; the card then drops "update to center"
  // (which needs project_only/project_newer/diverged) and offers only "update
  // to project", which overwrites every variant — and the backend refuses only
  // project_newer, so nothing stops it. Refuse and name the conflict instead,
  // the way 1.34.0 answers a write that would destroy something.
  const pushSkillToCenterAndAlign = async (
    skill: ProjectSkillEntry,
    selectedWinner?: ProjectSkill,
    targetGroup?: string,
  ): Promise<{ alignFailed: number; conflicting: number }> => {
    if (!id) return { alignFailed: 0, conflicting: 0 };

    const unproven = skill.variants.filter((v) => v.sync_status !== "in_sync");
    if (unproven.length > 1 && !selectedWinner) {
      return { alignFailed: 0, conflicting: unproven.length };
    }

    const winner = selectedWinner ?? unproven[0] ?? skill.primaryVariant;
    if (!skill.variants.some((variant) => variant === winner)) {
      throw new Error("Selected project skill variant is no longer available");
    }
    await uploadProjectSkillToGroup(id, winner, targetGroup, t);

    // Every remaining variant is in_sync, so pulling the freshly written center
    // over it discards nothing — and it keeps a multi-agent group from flipping
    // to "center_newer" off the stale-but-clean siblings right after the user
    // updated *to* center. Serially: two agents' skills roots can be symlinks
    // onto one real directory, and each realign removes and rebuilds its
    // target, so concurrent calls on one path make a call fail for no reason.
    let alignFailed = 0;
    for (const variant of skill.variants.filter((v) => v !== winner)) {
      try {
        await api.updateProjectSkillFromCenter(
          id,
          variant.relative_path,
          variant.agent,
        );
      } catch {
        alignFailed += 1;
      }
    }
    return { alignFailed, conflicting: 0 };
  };

  const handleUpdateCenter = async (skill: ProjectSkillEntry) => {
    if (!id) return;
    setUpdatingCenterSkill(getSkillKey(skill));
    try {
      const { alignFailed, conflicting } =
        await pushSkillToCenterAndAlign(skill);
      if (conflicting > 0) {
        const variants = skill.variants.filter(
          (variant) => variant.sync_status !== "in_sync",
        );
        setCenterConflictGroup(undefined);
        setCenterConflict({ skill, variants });
        setCenterConflictAgent(variants[0]?.agent ?? null);
        return;
      } else if (alignFailed > 0) {
        toast.warning(
          t("project.updateCenterAlignFailed", {
            name: skill.name,
            count: alignFailed,
          }),
        );
      } else {
        toast.success(t("project.updateCenterSuccess", { name: skill.name }));
      }
      await Promise.all([
        refreshManagedSkills(),
        refreshSkillGroups(),
        loadSkills(),
      ]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setUpdatingCenterSkill(null);
    }
  };

  const handleConfirmCenterConflict = async () => {
    if (!centerConflict || !centerConflictAgent) return false;
    const winner = centerConflict.variants.find(
      (variant) => variant.agent === centerConflictAgent,
    );
    if (!winner || !id) return false;

    setUpdatingCenterSkill(getSkillKey(centerConflict.skill));
    try {
      const { alignFailed } = await pushSkillToCenterAndAlign(
        centerConflict.skill,
        winner,
        centerConflictGroup ??
          managedSkills.find((skill) => skill.id === winner.center_skill_id)
            ?.skill_group_ids[0] ??
          "",
      );
      if (alignFailed > 0) {
        toast.warning(
          t("project.updateCenterAlignFailed", {
            name: centerConflict.skill.name,
            count: alignFailed,
          }),
        );
      } else {
        toast.success(
          t("project.updateCenterSuccess", { name: centerConflict.skill.name }),
        );
      }
      await Promise.all([
        refreshManagedSkills(),
        refreshSkillGroups(),
        loadSkills(),
      ]);
      setCenterConflict(null);
      setCenterConflictAgent(null);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      return false;
    } finally {
      setUpdatingCenterSkill(null);
    }
  };

  const handleUpdateProject = async (skill: ProjectSkillEntry) => {
    if (!id) return;
    setUpdatingProjectSkill(getSkillKey(skill));
    try {
      await Promise.all(
        skill.variants.map((variant) =>
          api.updateProjectSkillFromCenter(
            id,
            variant.relative_path,
            variant.agent,
          ),
        ),
      );
      if (skill.status === "project_newer") {
        toast.success(
          t("project.resetFromCenterSuccess", { name: skill.name }),
        );
      } else {
        toast.success(t("project.updateProjectSuccess", { name: skill.name }));
      }
      await Promise.all([loadSkills(), refreshProjects()]);
    } catch (error: unknown) {
      toast.error(
        t("project.updateProjectFailed", {
          name: skill.name,
          reason: getErrorMessage(error, t("common.error")),
        }),
      );
    } finally {
      setUpdatingProjectSkill(null);
    }
  };

  const handleToggleSkill = async (skill: ProjectSkillEntry) => {
    if (!id) return;
    setTogglingSkill(getSkillKey(skill));
    try {
      const nextEnabled = skill.enabledCount !== skill.totalCount;
      await toggleProjectSkillGroup(
        id,
        skill.variants,
        nextEnabled,
        project?.workspace_type === "linked",
      );
      if (skill.enabledCount === skill.totalCount) {
        toast.success(t("project.skillDisabled", { name: skill.name }));
      } else {
        toast.success(t("project.skillEnabled", { name: skill.name }));
      }
      await loadSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setTogglingSkill(null);
    }
  };

  const handleToggleDetailAgent = async (
    skill: ProjectSkillEntry,
    agentKey: string,
    enabled: boolean,
  ) => {
    if (!id) return;
    if (togglingAgentTarget) return;
    const target = exportTargets.find((item) => item.key === agentKey);
    const displayName = target?.display_name ?? agentKey;
    const existingVariant = skill.variants.find(
      (variant) => variant.agent === agentKey,
    );

    setTogglingAgentTarget({ skillKey: getSkillKey(skill), agent: agentKey });
    try {
      if (enabled) {
        const centerSkillId = skill.centerSkillIds[0];
        if (!centerSkillId && project?.workspace_type !== "linked") {
          await api.deployProjectLibrarySkill(
            id,
            skill.variants[0].relative_path,
            [agentKey],
          );
        } else if (centerSkillId) {
          await api.exportSkillToProject(centerSkillId, id, [agentKey]);
        } else {
          toast.error(
            t("project.agentAddRequiresCenter", { agent: displayName }),
          );
          return;
        }
        toast.success(
          t("project.agentAdded", { agent: displayName, name: skill.name }),
        );
      } else {
        if (!existingVariant) return;
        await api.deleteProjectSkill(
          id,
          existingVariant.relative_path,
          agentKey,
        );
        toast.success(
          t("project.agentRemoved", { agent: displayName, name: skill.name }),
        );
      }
      await Promise.all([loadSkills(), refreshProjects()]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setTogglingAgentTarget(null);
    }
  };

  const handleDeleteSkill = async () => {
    if (!id || !deleteTarget) return;
    try {
      await deleteProjectSkillGroup(
        id,
        deleteTarget.variants,
        project?.workspace_type === "linked",
      );
      toast.success(t("project.skillDeleted", { name: deleteTarget.name }));
      await Promise.all([loadSkills(), refreshProjects()]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    }
  };

  const handleBatchDeleteProject = async () => {
    if (!id) return;
    let deleted = 0;
    let failed = 0;
    for (const skill of selectedSkills) {
      try {
        await deleteProjectSkillGroup(
          id,
          skill.variants,
          project?.workspace_type === "linked",
        );
        deleted++;
      } catch {
        failed++;
        // continue deleting remaining
      }
    }
    if (deleted > 0) {
      toast.success(t("project.batchDeleted", { count: deleted }));
    }
    if (failed > 0) {
      toast.error(t("project.batchDeleteFailed", { count: failed }));
    }
    exitMultiSelect();
    setBatchDeleteConfirm(false);
    await Promise.all([loadSkills(), refreshProjects()]);
  };

  const handleBatchUpdateCenter = async () => {
    if (!id) return;
    setBatchUpdatingCenter(true);
    try {
      let updated = 0;
      let failed = 0;
      let conflicting = 0;
      for (const skill of selectedSkills) {
        const canUpdateCenter =
          skill.status === "project_only" ||
          skill.status === "project_newer" ||
          skill.status === "diverged";
        if (!canUpdateCenter) continue;
        try {
          const { alignFailed, conflicting: conflictingForSkill } =
            await pushSkillToCenterAndAlign(skill);
          // Refused outright: neither written nor failed, so it is counted on
          // its own rather than folded into either total.
          if (conflictingForSkill > 0) {
            conflicting += 1;
            continue;
          }
          // The push landed but some sibling failed to realign → the group is
          // not fully in sync, so count it as failed rather than reporting a
          // clean success.
          if (alignFailed > 0) failed++;
          else updated++;
        } catch {
          failed++;
        }
      }
      if (updated > 0) {
        toast.success(t("project.batchUpdatedCenter", { count: updated }));
      }
      if (conflicting > 0) {
        toast.warning(
          t("project.batchUpdateCenterConflict", { count: conflicting }),
        );
      }
      if (failed > 0) {
        toast.error(t("project.batchUpdateCenterFailed", { count: failed }));
      }
      await Promise.all([
        refreshManagedSkills(),
        refreshSkillGroups(),
        loadSkills(),
      ]);
    } finally {
      setBatchUpdatingCenter(false);
    }
  };

  const handleBatchUpdateProject = async () => {
    if (!id) return;
    setBatchUpdatingProject(true);
    try {
      let updated = 0;
      let failed = 0;
      for (const skill of selectedSkills) {
        const canUpdateProject =
          skill.status === "project_newer" ||
          skill.status === "center_newer" ||
          skill.status === "diverged";
        if (!canUpdateProject) continue;
        try {
          await Promise.all(
            skill.variants.map((variant) =>
              api.updateProjectSkillFromCenter(
                id,
                variant.relative_path,
                variant.agent,
              ),
            ),
          );
          updated++;
        } catch {
          failed++;
        }
      }
      if (updated > 0) {
        toast.success(t("project.batchUpdatedProject", { count: updated }));
      }
      if (failed > 0) {
        toast.error(t("project.batchUpdateProjectFailed", { count: failed }));
      }
      await Promise.all([loadSkills(), refreshProjects()]);
    } finally {
      setBatchUpdatingProject(false);
    }
  };

  const handleBatchEditTags = async (adds: string[], removes: string[]) => {
    let updated = 0;
    let failed = 0;

    for (const centerSkill of selectedCenterSkills) {
      const removeSet = new Set(removes);
      const nextTags = centerSkill.tags.filter((tag) => !removeSet.has(tag));
      for (const tag of adds) {
        if (!nextTags.includes(tag)) nextTags.push(tag);
      }
      const changed =
        nextTags.length !== centerSkill.tags.length ||
        nextTags.some((tag, index) => tag !== centerSkill.tags[index]);
      if (!changed) continue;

      try {
        await api.setSkillTags(centerSkill.id, nextTags);
        updated++;
      } catch {
        failed++;
      }
    }

    if (updated > 0) {
      toast.success(t("project.batchTagsUpdated", { count: updated }));
    }
    if (failed > 0) {
      toast.error(t("project.batchTagsFailed", { count: failed }));
    }
    await Promise.all([refreshManagedSkills(), loadSkills()]);
  };

  const skillGroupSkillExistsInProject = useCallback(
    (skill: ManagedSkill, agentKey: string) => {
      return findProjectSkillGroupVariant(skill, agentKey) !== null;
    },
    [findProjectSkillGroupVariant],
  );

  const handleAddSkillGroupSkillToProject = useCallback(
    async (skill: ManagedSkill, agentKey: string) => {
      if (!id) return;
      await api.exportSkillToProject(skill.id, id, [agentKey]);
    },
    [id],
  );

  const handleRemoveSkillGroupSkillFromProject = useCallback(
    async (skill: ManagedSkill, agentKey: string) => {
      if (!id) return;
      const projectVariant = findProjectSkillGroupVariant(skill, agentKey);
      if (!projectVariant) return;
      await api.deleteProjectSkill(id, projectVariant.relative_path, agentKey);
    },
    [findProjectSkillGroupVariant, id],
  );

  const handleSkillGroupActionComplete = useCallback(async () => {
    await Promise.all([loadSkills(), refreshProjects()]);
  }, [loadSkills, refreshProjects]);

  if (!project) return null;

  return (
    <div className="app-page">
      {project.workspace_type !== "linked" && (
        <ProjectLibraryPanel
          projectId={project.id}
          refreshKey={skills}
          onChanged={loadSkills}
        />
      )}
      <div className="app-page-header flex flex-col gap-2.5 pb-3 pr-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-[1_1_260px]">
            <h1 className="app-page-title flex items-center gap-2.5">
              <FolderOpen className="h-5 w-5 text-accent" />
              {project.name}
              <span className="app-badge">{groupedSkills.length}</span>
            </h1>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] leading-5 text-muted">
              <span
                className="min-w-0 truncate"
                title={compactHomePath(project.path)}
              >
                {compactHomePath(project.path)}
                {groupedSkills.length > 0 &&
                  ` \u00B7 ${t("project.batchAgents.summary", { active: enabledCount, total: groupedSkills.length })}`}
              </span>
              <SkillDirectoryActions path={project.path} compact />
            </div>
          </div>

          <div className="flex min-w-0 flex-[2_1_560px] flex-wrap items-center justify-end gap-2">
            <div className="relative w-full min-w-[220px] max-w-[300px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("project.searchPlaceholder")}
                className="app-input w-full pl-8 font-medium"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div className="app-segmented app-toolbar-segmented shrink-0">
              {(["all", "enabled", "disabled"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={cn(
                    "app-segmented-button",
                    filterMode === mode && "app-segmented-button-active",
                  )}
                >
                  {t(`project.filters.${mode}`)}
                </button>
              ))}
            </div>

            <div className="app-segmented app-toolbar-segmented shrink-0">
              <button
                onClick={loadSkills}
                className="rounded-md p-2 text-muted transition-colors outline-none hover:bg-surface-hover hover:text-secondary"
                title={t("common.refresh")}
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
              </button>
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
                  ? t("project.cancelSelect")
                  : t("project.selectMode")}
              </button>
            </div>

            <div className="relative shrink-0">
              <button
                onClick={() => {
                  setShowExportDialog(true);
                  dismissAddCallout();
                }}
                className="app-toolbar-button app-toolbar-button-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("project.addSkill")}
              </button>
              {showAddCallout && groupedSkills.length > 0 && (
                <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-md border border-border bg-surface p-3 text-[12px] leading-snug shadow-lg">
                  <button
                    onClick={dismissAddCallout}
                    className="absolute right-1.5 top-1.5 rounded p-0.5 text-faint hover:text-secondary"
                    aria-label={t("common.close")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <p className="pr-4 text-secondary">
                    {t("project.addCallout")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {agentFilterOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-muted">
              {t("project.agentFilter.label")}
            </span>
            <button
              type="button"
              onClick={() => setAgentFilters(new Set())}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                agentFilters.size === 0
                  ? "bg-accent text-white dark:bg-accent dark:text-white"
                  : "bg-surface-hover text-muted hover:text-secondary",
              )}
            >
              {t("project.agentFilter.all")}
            </button>
            {agentFilterOptions.map(({ key, displayName }) => {
              const active = agentFilters.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setAgentFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors",
                    active
                      ? "bg-accent text-white dark:bg-accent dark:text-white"
                      : "bg-surface-hover text-muted hover:text-secondary",
                  )}
                  title={displayName}
                >
                  <AgentIcon
                    agentKey={key}
                    displayName={displayName}
                    className="h-4 w-4 border-0 bg-transparent"
                  />
                  <span>{displayName}</span>
                </button>
              );
            })}
          </div>
        )}

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-muted">
              {t("mySkills.tags.filter")}
            </span>
            <button
              onClick={() => setTagFilters(new Set())}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                tagFilters.size === 0
                  ? "bg-accent text-white dark:bg-accent dark:text-white"
                  : "bg-surface-hover text-muted hover:text-secondary",
              )}
            >
              {t("mySkills.tags.allTags")}
            </button>
            {groupedSkills.some((s) => s.tags.length === 0) &&
              (() => {
                const isActive = tagFilters.has(UNTAGGED_FILTER);
                return (
                  <button
                    onClick={() => {
                      setTagFilters((prev) => {
                        const next = new Set(prev);
                        if (next.has(UNTAGGED_FILTER))
                          next.delete(UNTAGGED_FILTER);
                        else next.add(UNTAGGED_FILTER);
                        return next;
                      });
                    }}
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
              const active = tagFilters.has(tag);
              return (
                <button
                  key={tag}
                  onClick={() => {
                    setTagFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(tag)) next.delete(tag);
                      else next.add(tag);
                      return next;
                    });
                  }}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                    active
                      ? getTagActiveColor(tag, allTags)
                      : getTagColor(tag, allTags),
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        {/* SkillGroup bar */}
        {skillGroups.length > 0 && skillGroupBarAgentKeys.length > 0 && (
          <SkillGroupBar
            skillGroups={skillGroups}
            managedSkills={managedSkills}
            agentKeys={skillGroupBarAgentKeys}
            statusMode="logical-skill"
            existsInWorkspace={skillGroupSkillExistsInProject}
            onAddSkill={handleAddSkillGroupSkillToProject}
            onRemoveSkill={handleRemoveSkillGroupSkillFromProject}
            onComplete={handleSkillGroupActionComplete}
          />
        )}
      </div>

      {isMultiSelect && (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          isAllSelected={isAllSelected}
          actions={[
            ...(project.supports_skill_toggle
              ? [
                  {
                    key: "enable-agents",
                    tone: "primary" as const,
                    label: t("project.batchAgents.enable"),
                    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                    onSelect: () => setBatchAgentMode(true),
                  },
                  {
                    key: "disable-agents",
                    label: t("project.batchAgents.disable"),
                    icon: <Circle className="h-3.5 w-3.5" />,
                    onSelect: () => setBatchAgentMode(false),
                  },
                ]
              : []),
            ...(updatableProjectCount > 0
              ? [
                  {
                    key: "update-project",
                    label: t("project.batchUpdateProject", {
                      count: updatableProjectCount,
                    }),
                    icon: <Download className="h-3.5 w-3.5" />,
                    busy: batchUpdatingProject,
                    onSelect: handleBatchUpdateProject,
                  },
                ]
              : []),
            ...(updatableCenterCount > 0
              ? [
                  {
                    key: "update-center",
                    label: t("project.batchUpdateCenter", {
                      count: updatableCenterCount,
                    }),
                    icon: <Upload className="h-3.5 w-3.5" />,
                    busy: batchUpdatingCenter,
                    onSelect: handleBatchUpdateCenter,
                  },
                ]
              : []),
          ]}
          overflowActions={[
            ...(selectedCenterSkills.length > 0
              ? [
                  {
                    key: "tags",
                    label: t("project.batchEditTags", {
                      count: selectedCenterSkills.length,
                    }),
                    icon: <Tag className="h-3.5 w-3.5" />,
                    onSelect: () => setBatchTagDialogOpen(true),
                  },
                ]
              : []),
            {
              key: "delete",
              tone: "danger" as const,
              label: t("project.deleteSelected", { count: selectedIds.size }),
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onSelect: () => setBatchDeleteConfirm(true),
            },
          ]}
          labels={{
            hint: t("project.selectHint"),
            selected: t("project.selectedCount", { count: selectedIds.size }),
            selectAll: t("project.selectAll"),
            deselectAll: t("project.deselectAll"),
            cancel: t("common.cancel"),
            more: t("mySkills.moreActions"),
          }}
          onSelectAll={handleSelectAll}
          onCancel={exitMultiSelect}
        />
      )}

      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
          <div className="text-[13px] text-muted">{t("common.loading")}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
          <Layers className="mb-4 h-12 w-12 text-faint" />
          <h3 className="mb-1.5 text-[14px] font-semibold text-tertiary">
            {groupedSkills.length === 0
              ? t("project.noSkills")
              : t("mySkills.noMatch")}
          </h3>
          <p className="max-w-md text-[13px] text-muted">
            {groupedSkills.length === 0 ? t("project.noSkillsHint") : ""}
          </p>
          {groupedSkills.length === 0 && (
            <button
              onClick={() => {
                setShowExportDialog(true);
                dismissAddCallout();
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("project.addSkillsCta")}
            </button>
          )}
          {groupedSkills.length > 0 && hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="app-button-secondary mt-4"
            >
              {t("mySkills.clearFilters")}
            </button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "pb-8",
            viewMode === "grid"
              ? "grid grid-cols-2 gap-3 lg:grid-cols-3"
              : "flex flex-col gap-0.5",
          )}
        >
          {filtered.map((skill) => {
            const skillKey = getSkillKey(skill);
            const isSelected = selectedIds.has(skillKey);
            const isUpdatingCenter = updatingCenterSkill === skillKey;
            const isUpdatingProject = updatingProjectSkill === skillKey;
            const isToggling = togglingSkill === skillKey;
            const statusMeta = getSyncStatusMeta(t, skill.status);
            const assignedAgents = getAssignedAgents(skill.variants);

            if (viewMode === "grid") {
              return (
                <div
                  key={skillKey}
                  className={cn(
                    "app-panel group relative flex h-full cursor-pointer flex-col overflow-hidden shadow-card transition-all hover:-translate-y-px hover:border-border hover:shadow-card-hover",
                    isMultiSelect &&
                      isSelected &&
                      "ring-1 ring-accent border-accent/40",
                  )}
                  onClick={() =>
                    isMultiSelect
                      ? toggleSelect(skillKey)
                      : handleOpenDetail(skill)
                  }
                >
                  <ProjectSkillCardHeader
                    title={skill.name}
                    fileCount={skill.files.length}
                    leading={
                      isMultiSelect ? (
                        isSelected ? (
                          <SquareCheck className="h-3.5 w-3.5 text-accent" />
                        ) : (
                          <Square className="h-3.5 w-3.5 text-faint" />
                        )
                      ) : (
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            skill.enabledCount === skill.totalCount
                              ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
                              : skill.enabledCount > 0
                                ? "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
                                : "bg-surface-active",
                          )}
                          title={`${skill.enabledCount}/${skill.totalCount}`}
                        />
                      )
                    }
                    actions={
                      !isMultiSelect && (
                        <ProjectSkillSyncActions
                          status={skill.status}
                          updatingCenter={isUpdatingCenter}
                          updatingProject={isUpdatingProject}
                          onUpdateCenter={() => void handleUpdateCenter(skill)}
                          onUpdateProject={() =>
                            void handleUpdateProject(skill)
                          }
                        />
                      )
                    }
                  />

                  <div className="px-3.5 pb-3">
                    <ProjectEnabledAgents variants={skill.variants} />
                    <p className="text-[13px] leading-[18px] text-muted truncate">
                      {skill.description || "\u2014"}
                    </p>
                    {skill.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {skill.tags.map((tag) => (
                          <span
                            key={tag}
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                              getTagColor(tag, allTags),
                            )}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5 border-t border-border-faint px-3.5 py-2.5">
                    <ProjectSkillBadges
                      status={statusMeta}
                      disabled={skill.enabledCount === 0}
                      groups={skillGroupsForEntry.get(skill.id) ?? []}
                      activeGroupId={groupFilter}
                      onGroupClick={handleGroupBadgeClick}
                    />
                    {!isMultiSelect && (
                      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                        <ProjectAgentDots
                          assignedAgents={assignedAgents}
                          targets={projectAgentTargets}
                          limit={4}
                          size="sm"
                          onToggle={(agentKey, enabled) =>
                            handleToggleDetailAgent(skill, agentKey, enabled)
                          }
                          pendingKey={
                            togglingAgentTarget?.skillKey === skillKey
                              ? togglingAgentTarget.agent
                              : null
                          }
                        />
                        {project.supports_skill_toggle ? (
                          <ToggleSwitch
                            checked={skill.enabledCount === skill.totalCount}
                            loading={isToggling}
                            onChange={() => handleToggleSkill(skill)}
                            title={
                              skill.enabledCount === skill.totalCount
                                ? t("project.enabled")
                                : t("project.enableSkill")
                            }
                          />
                        ) : null}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(skill);
                          }}
                          className="rounded px-2 py-1 text-muted transition-colors outline-none hover:bg-red-500/10 hover:text-red-500"
                          title={t("project.deleteSkill")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // List view
            return (
              <div
                key={skillKey}
                className={cn(
                  "app-panel group flex cursor-pointer items-center gap-3.5 rounded-xl border-transparent px-3.5 py-3 transition-all hover:border-border hover:bg-surface-hover",
                  isMultiSelect &&
                    isSelected &&
                    "ring-1 ring-accent border-accent/40",
                )}
                onClick={() =>
                  isMultiSelect
                    ? toggleSelect(skillKey)
                    : handleOpenDetail(skill)
                }
              >
                <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {isMultiSelect ? (
                    isSelected ? (
                      <SquareCheck className="h-3.5 w-3.5 text-accent" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-faint" />
                    )
                  ) : (
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        skill.enabledCount === skill.totalCount
                          ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
                          : skill.enabledCount > 0
                            ? "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
                            : "bg-surface-active",
                      )}
                      title={`${skill.enabledCount}/${skill.totalCount}`}
                    />
                  )}
                </div>
                <h3
                  className="w-[180px] shrink-0 truncate text-[14px] font-semibold text-secondary"
                  title={skill.name}
                >
                  {skill.name}
                </h3>

                <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
                  {skill.description || "\u2014"}
                </p>

                {skill.tags.length > 0 && (
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
                )}

                <div className="flex shrink-0 items-center gap-2.5">
                  <ProjectSkillBadges
                    status={statusMeta}
                    disabled={skill.enabledCount === 0}
                    groups={skillGroupsForEntry.get(skill.id) ?? []}
                  />
                  {skill.files.length > 0 && (
                    <span className="flex items-center gap-1 text-[12px] text-faint">
                      <FileText className="w-3 h-3" />
                      {skill.files.length}
                    </span>
                  )}
                  <ProjectEnabledAgents variants={skill.variants} />
                  <ProjectAgentDots
                    assignedAgents={assignedAgents}
                    targets={projectAgentTargets}
                    limit={4}
                    size="sm"
                    onToggle={
                      isMultiSelect
                        ? undefined
                        : (agentKey, enabled) =>
                            handleToggleDetailAgent(skill, agentKey, enabled)
                    }
                    pendingKey={
                      togglingAgentTarget?.skillKey === skillKey
                        ? togglingAgentTarget.agent
                        : null
                    }
                  />
                </div>

                {!isMultiSelect && (
                  <>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <ProjectSkillSyncActions
                        variant="list"
                        status={skill.status}
                        updatingCenter={isUpdatingCenter}
                        updatingProject={isUpdatingProject}
                        onUpdateCenter={() => void handleUpdateCenter(skill)}
                        onUpdateProject={() => void handleUpdateProject(skill)}
                      />
                    </div>
                    {project.supports_skill_toggle ? (
                      <ToggleSwitch
                        checked={skill.enabledCount === skill.totalCount}
                        loading={isToggling}
                        onChange={() => handleToggleSkill(skill)}
                        title={
                          skill.enabledCount === skill.totalCount
                            ? t("project.enabled")
                            : t("project.enableSkill")
                        }
                      />
                    ) : null}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(skill);
                      }}
                      className="shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                      title={t("project.deleteSkill")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Skill Document Detail Panel */}
      {detailSkill && project && (
        <ProjectSkillDetailPanel
          key={getSkillKey(detailSkill)}
          projectId={project.id}
          skill={detailSkill}
          updatingCenter={updatingCenterSkill === getSkillKey(detailSkill)}
          updatingProject={updatingProjectSkill === getSkillKey(detailSkill)}
          onUpdateCenter={() => void handleUpdateCenter(detailSkill)}
          onUpdateProject={() => void handleUpdateProject(detailSkill)}
          onClose={() => setDetailSkill(null)}
        />
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t("project.deleteSkill")}
        message={t("project.deleteSkillConfirm", { name: deleteTarget?.name })}
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSkill}
      />

      {id && batchAgentMode !== null && (
        <ProjectBatchAgentDialog
          projectId={id}
          skills={selectedSkills}
          targets={exportTargets}
          enabled={batchAgentMode}
          onClose={() => setBatchAgentMode(null)}
          onComplete={async () => {
            await Promise.all([loadSkills(), refreshProjects()]);
          }}
        />
      )}

      {/* Batch Delete Confirm Dialog */}
      <ConfirmDialog
        open={batchDeleteConfirm}
        title={t("project.deleteSkill")}
        message={t("project.batchDeleteConfirm", { count: selectedIds.size })}
        tone="danger"
        onClose={() => setBatchDeleteConfirm(false)}
        onConfirm={handleBatchDeleteProject}
      />

      <BatchTagDialog
        open={batchTagDialogOpen}
        skills={selectedCenterSkills}
        allTags={allTags}
        note={t("project.batchTagScopeNote")}
        onClose={() => setBatchTagDialogOpen(false)}
        onApply={handleBatchEditTags}
      />

      {centerConflict && (
        <ConfirmDialog
          open={true}
          title={t("project.updateCenterConflictTitle")}
          message={t("project.updateCenterConflictMessage", {
            name: centerConflict.skill.name,
          })}
          details={centerConflict.variants.map(
            (variant) => variant.agent_display_name,
          )}
          tone="warning"
          confirmLabel={t("project.updateCenterOverwrite")}
          onClose={() => {
            setCenterConflict(null);
            setCenterConflictAgent(null);
          }}
          onConfirm={handleConfirmCenterConflict}
        >
          <ProjectSkillConflictPreview
            projectId={id ?? ""}
            variants={centerConflict.variants}
            selectedAgent={centerConflictAgent}
            managedSkills={managedSkills}
            skillGroups={skillGroups}
            selectedGroup={centerConflictGroup}
            onSelectGroup={setCenterConflictGroup}
            onSelectAgent={setCenterConflictAgent}
          />
        </ConfirmDialog>
      )}

      {id && (
        <AddSkillsSheet
          open={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          target={{
            kind: "project",
            projectId: id,
            projectName: project?.name ?? "",
            teamSharing: project.workspace_type !== "linked",
            exportTargets,
            projectSkillDirNamesByAgent,
            projectCenterSkillIdsByAgent,
            initialSelectedAgents: initialSheetAgents,
            onPersistLastUsed: handlePersistLastUsedAgents,
          }}
          managedSkills={managedSkills}
          onInstalled={async () => {
            await Promise.all([loadSkills(), refreshProjects()]);
          }}
        />
      )}
    </div>
  );
}
