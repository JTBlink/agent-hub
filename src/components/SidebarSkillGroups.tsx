import { useEffect, useId, useRef, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type DraggableProvidedDragHandleProps,
} from "@hello-pangea/dnd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronUp, Ellipsis, Layers, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import type { SkillGroup } from "../lib/tauri";
import { getSkillGroupDisplayName } from "../lib/skillGroupDisplay";
import { cn } from "../utils";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { SkillGroupNavigationRow } from "./SkillGroupNavigationRow";
import { CreateSkillGroupDialog } from "./CreateSkillGroupDialog";
import { RenameSkillGroupDialog } from "./RenameSkillGroupDialog";
import { ConfirmDialog } from "./ConfirmDialog";

const COMMON_GROUP_LIMIT = 5;
const navClass =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-[7px] text-left text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const badgeClass =
  "min-w-[18px] shrink-0 rounded-full bg-surface-hover px-1.5 text-center text-[12px] font-medium leading-[18px] tabular-nums text-muted";

export function SidebarSkillGroups({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    skillGroups,
    managedSkills,
    viewedSkillGroup,
    viewingUngrouped,
    setViewedSkillGroupId,
    setViewingUngrouped,
    closeSkillDetail,
    refreshSkillGroups,
    refreshManagedSkills,
  } = useApp();
  const [ordered, setOrdered] = useState(skillGroups);
  const [pending, setPending] = useState(false);
  const reordering = useRef(false);
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const [showCreate, setShowCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SkillGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkillGroup | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOrdered(skillGroups);
  }, [skillGroups]);
  const common = ordered.slice(0, COMMON_GROUP_LIMIT);
  const visible = showAll ? ordered : common;
  const commonIds = new Set(common.map((group) => group.id));
  const inLibrary = location.pathname === "/my-skills";
  const activeId =
    inLibrary && !viewingUngrouped ? viewedSkillGroup?.id : undefined;
  const extraActive = ordered.find(
    (group) => group.id === activeId && !commonIds.has(group.id),
  );
  const ungroupedCount = managedSkills.filter(
    (skill) => skill.skill_group_ids.length === 0,
  ).length;

  const reorder = async (next: SkillGroup[]) => {
    if (reordering.current) return;
    reordering.current = true;
    setPending(true);
    const previous = ordered;
    setOrdered(next);
    try {
      await api.reorderSkillGroups(next.map((group) => group.id));
      await refreshSkillGroups();
    } catch {
      setOrdered(previous);
      toast.error(t("common.error"));
    } finally {
      reordering.current = false;
      setPending(false);
    }
  };
  const handleDragEnd = ({ source, destination }: DropResult) => {
    if (!destination || source.index === destination.index) return;
    const next = [...ordered];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    void reorder(next);
  };
  const select = (id: string) => {
    closeSkillDetail();
    setViewedSkillGroupId(id);
    setViewingUngrouped(false);
    if (!inLibrary) navigate("/my-skills");
  };
  const refreshMembership = () =>
    Promise.all([refreshSkillGroups(), refreshManagedSkills()]);
  const create = async (name: string, description?: string, icon?: string) => {
    await api.createSkillGroup(name, description, icon);
    await refreshMembership();
    if (location.pathname === "/settings") navigate("/my-skills");
    toast.success(t("skillGroup.created"));
  };
  const rename = async (name: string, icon?: string, description?: string) => {
    if (!renameTarget) return;
    await api.updateSkillGroup(
      renameTarget.id,
      name,
      description,
      icon || renameTarget.icon || undefined,
    );
    await refreshSkillGroups();
    toast.success(t("skillGroup.updated"));
  };
  const remove = async () => {
    if (!deleteTarget) return;
    await api.deleteSkillGroup(deleteTarget.id);
    await refreshMembership();
    if (location.pathname === "/settings") navigate("/my-skills");
    toast.success(t("skillGroup.deleted"));
  };
  const edit = (group: SkillGroup) => {
    setRenameTarget(group);
  };
  const confirmDelete = (group: SkillGroup) => {
    setDeleteTarget(group);
  };
  const openCreate = () => {
    setShowCreate(true);
  };
  const restoreFocus = () => moreRef.current?.focus();
  const row = (
    group: SkillGroup,
    dragHandleProps?: DraggableProvidedDragHandleProps | null,
  ) => (
    <SkillGroupNavigationRow
      group={group}
      active={group.id === activeId}
      onSelect={() => select(group.id)}
      onEdit={() => edit(group)}
      onDelete={() => confirmDelete(group)}
      dragHandleProps={dragHandleProps}
      pending={pending}
    />
  );

  return (
    <>
      <SidebarSectionHeader
        label={t("sidebar.mySkills")}
        isOpen={isOpen}
        onToggle={onToggle}
        icon={<Layers className="h-3.5 w-3.5 shrink-0" />}
        count={managedSkills.length}
      />
      {isOpen && (
        <>
          <Link
            to="/my-skills"
            onClick={() => {
              closeSkillDetail();
              setViewedSkillGroupId("");
              setViewingUngrouped(false);
            }}
            aria-current={
              inLibrary && !viewedSkillGroup && !viewingUngrouped
                ? "page"
                : undefined
            }
            className={cn(
              navClass,
              "mb-0.5",
              inLibrary && !viewedSkillGroup && !viewingUngrouped
                ? "bg-surface-active font-medium text-primary"
                : "text-tertiary hover:text-secondary hover:bg-surface-hover",
            )}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-surface text-muted">
              <Layers className="h-3 w-3" />
            </span>
            <span className="flex-1 truncate">{t("sidebar.allSkills")}</span>
          </Link>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="skillGroups">
              {(drop) => (
                <div
                  id={listId}
                  ref={drop.innerRef}
                  {...drop.droppableProps}
                  className="space-y-0.5"
                >
                  {visible.map((group, index) => (
                    <Draggable
                      key={group.id}
                      draggableId={group.id}
                      index={index}
                      isDragDisabled={pending}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                        >
                          {row(group, provided.dragHandleProps)}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {drop.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          {!showAll && extraActive && row(extraActive)}
          {ordered.length > COMMON_GROUP_LIMIT && (
            <button
              ref={moreRef}
              type="button"
              aria-controls={listId}
              aria-expanded={showAll}
              disabled={pending}
              onClick={() => setShowAll((value) => !value)}
              className={cn(
                navClass,
                "text-muted hover:text-secondary hover:bg-surface-hover",
              )}
            >
              {showAll ? (
                <ChevronUp className="h-5 w-5 shrink-0" />
              ) : (
                <Ellipsis className="h-5 w-5 shrink-0" />
              )}
              <span className="flex-1 truncate">
                {t(showAll ? "sidebar.lessGroups" : "sidebar.moreGroups")}
              </span>
              <span className={badgeClass}>{ordered.length}</span>
            </button>
          )}
          {ungroupedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                closeSkillDetail();
                setViewingUngrouped(true);
                if (!inLibrary) navigate("/my-skills");
              }}
              className={cn(
                navClass,
                viewingUngrouped && inLibrary
                  ? "bg-surface-active text-primary"
                  : "text-tertiary hover:text-secondary hover:bg-surface-hover",
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-surface text-muted">
                <Layers className="h-3 w-3" />
              </span>
              <span className="flex-1 truncate">
                {t("mySkills.sourceFilter.ungrouped")}
              </span>
              <span className={badgeClass}>{ungroupedCount}</span>
            </button>
          )}
          <button
            type="button"
            onClick={openCreate}
            className={cn(
              navClass,
              "mt-1 text-muted hover:text-secondary hover:bg-surface-hover",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("sidebar.newSkillGroup")}
          </button>
        </>
      )}
      <CreateSkillGroupDialog
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          restoreFocus();
        }}
        onCreate={create}
      />
      <RenameSkillGroupDialog
        open={renameTarget !== null}
        currentName={renameTarget?.name || ""}
        currentIcon={renameTarget?.icon}
        currentDescription={renameTarget?.description}
        onClose={() => {
          setRenameTarget(null);
          restoreFocus();
        }}
        onRename={rename}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        message={t("skillGroup.deleteConfirm", {
          name: getSkillGroupDisplayName(deleteTarget?.name || "", t),
        })}
        onClose={() => {
          setDeleteTarget(null);
          restoreFocus();
        }}
        onConfirm={remove}
      />
    </>
  );
}
