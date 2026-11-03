import { useId, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { UNTAGGED_FILTER } from "../lib/skillTags";
import type {
  DeploymentFilter,
  MembershipFilter,
} from "../lib/skillLibraryFilters";

interface Props {
  deployment: DeploymentFilter;
  deploymentCounts: Record<DeploymentFilter, number>;
  onDeploymentChange: (mode: DeploymentFilter) => void;
  membership: MembershipFilter;
  membershipCounts: Record<MembershipFilter, number>;
  onMembershipChange: (mode: MembershipFilter) => void;
  groupName?: string;
  viewingUngrouped: boolean;
  ungrouped: boolean;
  ungroupedCount: number;
  onUngroupedChange: () => void;
  sources: Set<string>;
  onSourcesChange: (sources: Set<string>) => void;
  tags: Set<string>;
  allTags: string[];
  hasUntagged: boolean;
  onTagsChange: (tags: Set<string>) => void;
  onTagContextMenu: (tag: string, x: number, y: number) => void;
  resultCount: number;
  hasActiveFilters: boolean;
  onClear: () => void;
  actions?: ReactNode;
}

function toggle(values: Set<string>, value: string) {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
const chipClass = `inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${focusClass}`;

function FilterChoice({
  active,
  children,
  onClick,
  navigation = false,
}: {
  active: boolean;
  navigation?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        navigation
          ? `relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors ${focusClass}`
          : chipClass,
        navigation
          ? active
            ? "text-accent-light after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
            : "text-secondary hover:text-primary"
          : active
            ? "border-accent-border bg-accent-bg text-accent-light"
            : "border-transparent text-secondary hover:bg-surface-hover",
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({
  label,
  children,
  navigation = false,
}: {
  label: string;
  navigation?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-start gap-x-3 gap-y-2 sm:flex-nowrap"
    >
      <span
        aria-hidden="true"
        className={
          navigation
            ? "sr-only"
            : "w-20 shrink-0 whitespace-nowrap pt-2 text-xs text-muted"
        }
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </div>
    </div>
  );
}

/** Filters stay in the list; long tag collections expand in place. */
export function SkillLibraryFilterPanel(props: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const filtersId = useId();
  const tagsId = useId();
  const secondaryFilterCount =
    Number(props.deployment !== "all") + props.sources.size + props.tags.size;
  const visibleTags = expanded
    ? props.allTags
    : props.allTags.filter((tag, index) => index < 6 || props.tags.has(tag));
  const hiddenCount = props.allTags.length - visibleTags.length;

  return (
    <section
      aria-label={t("mySkills.filterPanel.title")}
      className="min-w-0 border-b border-border-subtle"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {props.groupName ? (
          <FilterRow label={t("sidebar.skillGroups")} navigation>
            {(["enabled", "all", "available"] as const).map((mode) => (
              <FilterChoice
                navigation
                key={mode}
                active={props.membership === mode}
                onClick={() => props.onMembershipChange(mode)}
              >
                {t(`mySkills.filters.${mode}`)}
                <span className="rounded-md bg-surface-active px-1.5 py-0.5 text-xs leading-none text-secondary tabular-nums">
                  {props.membershipCounts[mode]}
                </span>
              </FilterChoice>
            ))}
          </FilterRow>
        ) : (
          <FilterRow label={t("sidebar.skillGroups")} navigation>
            {!props.viewingUngrouped && (
              <FilterChoice
                navigation
                active={!props.ungrouped}
                onClick={() => props.ungrouped && props.onUngroupedChange()}
              >
                {t("mySkills.filterPanel.all")}
                <span className="rounded-md bg-surface-active px-1.5 py-0.5 text-xs leading-none text-secondary tabular-nums">
                  {props.membershipCounts.all}
                </span>
              </FilterChoice>
            )}
            <FilterChoice
              navigation
              active={props.ungrouped || props.viewingUngrouped}
              onClick={() =>
                !props.viewingUngrouped && props.onUngroupedChange()
              }
            >
              {t("mySkills.sourceFilter.ungrouped")}
              <span className="rounded-md bg-surface-active px-1.5 py-0.5 text-xs leading-none text-secondary tabular-nums">
                {props.ungroupedCount}
              </span>
            </FilterChoice>
          </FilterRow>
        )}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 py-1">
          <span
            role="status"
            aria-atomic="true"
            className="mr-2 whitespace-nowrap text-xs text-muted"
          >
            {t("mySkills.filterPanel.results", { count: props.resultCount })}
          </span>
          <button
            type="button"
            aria-expanded={filtersExpanded}
            aria-controls={filtersId}
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover",
              filtersExpanded || secondaryFilterCount > 0
                ? "bg-accent-bg text-accent-light"
                : "text-secondary",
              focusClass,
            )}
          >
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            {t(
              filtersExpanded
                ? "mySkills.filterPanel.collapse"
                : "mySkills.filterPanel.expand",
            )}
            {secondaryFilterCount > 0 && (
              <span className="rounded bg-surface-active px-1.5 text-accent-light tabular-nums">
                {secondaryFilterCount}
              </span>
            )}
            {filtersExpanded ? (
              <ChevronUp aria-hidden="true" className="h-3 w-3" />
            ) : (
              <ChevronDown aria-hidden="true" className="h-3 w-3" />
            )}
          </button>
          {props.hasActiveFilters && (
            <button
              type="button"
              onClick={props.onClear}
              className={cn(
                "inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs text-secondary hover:bg-surface-hover",
                focusClass,
              )}
            >
              <X aria-hidden="true" className="h-3 w-3" />
              {t("mySkills.clearFilters")}
            </button>
          )}
          {props.actions}
        </div>
      </div>
      <div
        id={filtersId}
        hidden={!filtersExpanded}
        className="space-y-2 border-t border-border-subtle bg-surface px-3 py-3"
      >
        <FilterRow label={t("mySkills.filterPanel.deployment")}>
          {(["all", "deployed", "undeployed"] as const).map((mode) => (
            <FilterChoice
              key={mode}
              active={props.deployment === mode}
              onClick={() => props.onDeploymentChange(mode)}
            >
              {t(`mySkills.filterPanel.${mode}`)}
              <span className="tabular-nums opacity-70">
                {props.deploymentCounts[mode]}
              </span>
            </FilterChoice>
          ))}
        </FilterRow>
        {props.deployment === "undeployed" && (
          <p className="mt-1 text-xs leading-5 text-muted sm:pl-[92px]">
            {t("mySkills.filterPanel.undeployedHint")}
          </p>
        )}
        <FilterRow label={t("mySkills.filterPanel.source")}>
          <FilterChoice
            active={props.sources.size === 0}
            onClick={() => props.onSourcesChange(new Set())}
          >
            {t("mySkills.filterPanel.all")}
          </FilterChoice>
          {(["local", "import", "git", "skillssh"] as const).map((source) => (
            <FilterChoice
              key={source}
              active={props.sources.has(source)}
              onClick={() =>
                props.onSourcesChange(toggle(props.sources, source))
              }
            >
              {t(`mySkills.sourceFilter.${source}`)}
            </FilterChoice>
          ))}
        </FilterRow>
        {(props.allTags.length > 0 || props.hasUntagged) && (
          <FilterRow label={t("mySkills.filterPanel.tags")}>
            <div
              id={tagsId}
              className="flex min-w-0 flex-wrap items-center gap-1"
            >
              <FilterChoice
                active={props.tags.size === 0}
                onClick={() => props.onTagsChange(new Set())}
              >
                {t("mySkills.filterPanel.all")}
              </FilterChoice>
              {props.hasUntagged && (
                <FilterChoice
                  active={props.tags.has(UNTAGGED_FILTER)}
                  onClick={() =>
                    props.onTagsChange(toggle(props.tags, UNTAGGED_FILTER))
                  }
                >
                  {t("mySkills.tags.untagged")}
                </FilterChoice>
              )}
              {visibleTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={props.tags.has(tag)}
                  onClick={() => props.onTagsChange(toggle(props.tags, tag))}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    props.onTagContextMenu(tag, event.clientX, event.clientY);
                  }}
                  title={t("mySkills.tags.manageHint")}
                  className={cn(
                    chipClass,
                    "max-w-full break-words text-left",
                    props.tags.has(tag)
                      ? "border-accent-border bg-surface-active text-accent-light"
                      : "border-transparent text-secondary hover:bg-surface-hover",
                  )}
                >
                  {props.tags.has(tag) && (
                    <Check aria-hidden="true" className="h-3 w-3 shrink-0" />
                  )}
                  {tag}
                </button>
              ))}
            </div>
            {(hiddenCount > 0 || expanded) && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={tagsId}
                onClick={() => setExpanded(!expanded)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-accent-light hover:bg-surface-hover",
                  focusClass,
                )}
              >
                {expanded
                  ? t("mySkills.filterPanel.lessTags")
                  : t("mySkills.filterPanel.moreTags", { count: hiddenCount })}
                {expanded ? (
                  <ChevronUp aria-hidden="true" className="h-3 w-3" />
                ) : (
                  <ChevronDown aria-hidden="true" className="h-3 w-3" />
                )}
              </button>
            )}
          </FilterRow>
        )}
      </div>
    </section>
  );
}
