import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { confirm as dialogConfirm } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { getErrorMessage } from "../lib/error";
import * as api from "../lib/tauri";

export function useAgentSettings() {
  const { t } = useTranslation();
  const { tools, refreshTools } = useApp();
  const [togglingTools, setTogglingTools] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [savingPath, setSavingPath] = useState(false);
  const pathBusy = useRef(false);
  const [editingPathKey, setEditingPathKey] = useState<string | null>(null);
  const [editingPathValue, setEditingPathValue] = useState("");
  // Project path editing (custom agents only)
  const [editingProjectPathKey, setEditingProjectPathKey] = useState<
    string | null
  >(null);
  const [editingProjectPathValue, setEditingProjectPathValue] = useState("");
  // Custom agent dialog
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [customProjectPath, setCustomProjectPath] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [showMoreAgents, setShowMoreAgents] = useState(false);
  const startEditPath = useCallback((key: string, currentPath: string) => {
    setEditingPathKey(key);
    setEditingPathValue(currentPath);
  }, []);

  const handleSavePath = async () => {
    if (pathBusy.current || !editingPathKey || !editingPathValue.trim()) return;
    pathBusy.current = true;
    setSavingPath(true);
    try {
      await api.setCustomToolPath(editingPathKey, editingPathValue.trim());
      await refreshTools();
      toast.success(t("settings.pathSaved"));
      setEditingPathKey(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      pathBusy.current = false;
      setSavingPath(false);
    }
  };

  const startEditProjectPath = useCallback(
    (key: string, currentPath: string | null) => {
      setEditingProjectPathKey(key);
      setEditingProjectPathValue(currentPath ?? "");
    },
    [],
  );

  const handleSaveProjectPath = async () => {
    if (pathBusy.current || !editingProjectPathKey) return;
    pathBusy.current = true;
    setSavingPath(true);
    const trimmed = editingProjectPathValue.trim();
    try {
      await api.setCustomToolProjectPath(
        editingProjectPathKey,
        trimmed || null,
      );
      await refreshTools();
      toast.success(t("settings.pathSaved"));
      setEditingProjectPathKey(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      pathBusy.current = false;
      setSavingPath(false);
    }
  };

  const handleResetProjectPath = async (key: string) => {
    try {
      await api.resetCustomToolProjectPath(key);
      await refreshTools();
      toast.success(t("settings.projectPathReset"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleResetPath = async (key: string) => {
    try {
      await api.resetCustomToolPath(key);
      await refreshTools();
      toast.success(t("settings.pathReset"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleBrowsePath = async (setter: (v: string) => void) => {
    const selected = await api.pickDirectory();
    if (selected && typeof selected === "string") {
      setter(selected);
    }
  };

  const generateCustomAgentKey = useCallback(
    (name: string) => {
      const base = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const seed = base || "agent";
      const existingKeys = new Set(tools.map((tool) => tool.key));
      if (!existingKeys.has(seed)) return seed;
      let n = 2;
      while (existingKeys.has(`${seed}_${n}`)) n += 1;
      return `${seed}_${n}`;
    },
    [tools],
  );

  const handleAddCustomAgent = async () => {
    const trimName = customName.trim();
    const trimPath = customPath.trim();
    const trimProjectPath = customProjectPath.trim();
    if (!trimName || !trimPath) return;
    const trimKey = generateCustomAgentKey(trimName);
    setAddingCustom(true);
    try {
      await api.addCustomTool(
        trimKey,
        trimName,
        trimPath,
        trimProjectPath || undefined,
      );
      await refreshTools();
      toast.success(t("settings.customAgentAdded"));
      setShowAddCustom(false);
      setCustomName("");
      setCustomPath("");
      setCustomProjectPath("");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAddingCustom(false);
    }
  };

  const handleRemoveCustomAgent = async (key: string, name: string) => {
    const shouldRemove = await dialogConfirm(
      t("settings.removeCustomAgentConfirm", { name }),
    );
    if (!shouldRemove) return;
    try {
      await api.removeCustomTool(key);
      await refreshTools();
      toast.success(t("settings.customAgentRemoved"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshTools();
      toast.success(t("common.success"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleTool = async (key: string, enabled: boolean) => {
    setTogglingTools((prev) => new Set(prev).add(key));
    try {
      await api.setToolEnabled(key, enabled);
      await refreshTools();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setTogglingTools((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleToggleAllTools = async (enabled: boolean) => {
    try {
      await api.setAllToolsEnabled(enabled);
      await refreshTools();
      toast.success(t("common.success"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const installedTools = useMemo(
    () => tools.filter((tool) => tool.installed),
    [tools],
  );
  const enabledTools = useMemo(
    () => installedTools.filter((tool) => tool.enabled),
    [installedTools],
  );
  const customTools = useMemo(
    () => tools.filter((tool) => tool.is_custom),
    [tools],
  );
  const builtInTools = useMemo(
    () => tools.filter((tool) => !tool.is_custom),
    [tools],
  );
  // Grouped by what is actually on this machine rather than by a hand-kept
  // "mainstream" list. A settings page reader cares about the agents they have,
  // and that list stays correct without anyone re-curating it as products rise
  // and fall. Both groups keep the backend's order, which is ranked by how
  // widely used each agent is (see DEFAULT_PRIORITY_ORDER) and overridden by
  // whatever the user has dragged.
  const detectedTools = useMemo(
    () => builtInTools.filter((tool) => tool.installed),
    [builtInTools],
  );
  const undetectedTools = useMemo(
    () => builtInTools.filter((tool) => !tool.installed),
    [builtInTools],
  );

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleAgentDragEnd = useCallback(
    async (event: DragEndEvent, groupKeys: string[]) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = groupKeys.indexOf(String(active.id));
      const newIdx = groupKeys.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return;

      const newGroupKeys = arrayMove(groupKeys, oldIdx, newIdx);
      const fullOrder = tools.map((t) => t.key);
      const groupKeySet = new Set(groupKeys);
      let cursor = 0;
      const newFullOrder = fullOrder.map((k) =>
        groupKeySet.has(k) ? newGroupKeys[cursor++] : k,
      );

      try {
        await api.setToolOrder(newFullOrder);
        await refreshTools();
      } catch (e) {
        toast.error(getErrorMessage(e, t("common.error")));
      }
    },
    [tools, refreshTools, t],
  );
  return {
    savingPath,
    tools,
    refreshTools,
    togglingTools,
    refreshing,
    editingPathKey,
    setEditingPathKey,
    editingPathValue,
    setEditingPathValue,
    editingProjectPathKey,
    setEditingProjectPathKey,
    editingProjectPathValue,
    setEditingProjectPathValue,
    showAddCustom,
    setShowAddCustom,
    customName,
    setCustomName,
    customPath,
    setCustomPath,
    customProjectPath,
    setCustomProjectPath,
    addingCustom,
    showMoreAgents,
    setShowMoreAgents,
    startEditPath,
    handleSavePath,
    startEditProjectPath,
    handleSaveProjectPath,
    handleResetProjectPath,
    handleResetPath,
    handleBrowsePath,
    handleAddCustomAgent,
    handleRemoveCustomAgent,
    handleRefresh,
    handleToggleTool,
    handleToggleAllTools,
    installedTools,
    enabledTools,
    customTools,
    detectedTools,
    undetectedTools,
    dragSensors,
    handleAgentDragEnd,
  };
}
