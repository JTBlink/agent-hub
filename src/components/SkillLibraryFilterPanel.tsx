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
}

function toggle(values: Set<string>, value: string) {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
const chipClass = `inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${focusClass}`;

function FilterChoice({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        chipClass,
        active
          ? "border-accent-border bg-surface-active text-accent-light"
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
}: {
  label: string;
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
        className="w-16 shrink-0 pt-2 text-[12px] text-muted"
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
    Number(Boolean(props.groupName) && props.membership !== "all") +
    Number(props.ungrouped) +
    props.sources.size +
    props.tags.size;
  const visibleTags = expanded
    ? props.allTags
    : props.allTags.filter((tag, index) => index < 6 || props.tags.has(tag));
  const hiddenCount = props.allTags.length - visibleTags.length;

  return (
    <section
      aria-label={t("mySkills.filterPanel.title")}
      className="-mt-3 rounded-xl border border-border-subtle bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
        <div className="ml-auto flex min-h-8 items-center gap-3">
          <span
            role="status"
            aria-atomic="true"
            className="text-[12px] text-muted"
          >
            {t("mySkills.filterPanel.results", { count: props.resultCount })}
          </span>
          <button
            type="button"
            aria-expanded={filtersExpanded}
            aria-controls={filtersId}
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-secondary hover:bg-surface-hover",
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
                "inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[12px] text-secondary hover:bg-surface-hover",
                focusClass,
              )}
            >
              <X aria-hidden="true" className="h-3 w-3" />
              {t("mySkills.clearFilters")}
            </button>
          )}
        </div>
      </div>
      {filtersExpanded && props.deployment === "undeployed" && (
        <p className="mt-1 text-[12px] leading-5 text-muted sm:pl-[76px]">
          {t("mySkills.filterPanel.undeployedHint")}
        </p>
      )}
      <div
        id={filtersId}
        hidden={!filtersExpanded}
        className="mt-2 space-y-1 border-t border-border-subtle pt-2"
      >
        {props.groupName ? (
          <FilterRow label={t("sidebar.skillGroups")}>
            {(["enabled", "all", "available"] as const).map((mode) => (
              <FilterChoice
                key={mode}
                active={props.membership === mode}
                onClick={() => props.onMembershipChange(mode)}
              >
                {t(`mySkills.filters.${mode}`)}
                <span className="tabular-nums opacity-70">
                  {props.membershipCounts[mode]}
                </span>
              </FilterChoice>
            ))}
          </FilterRow>
        ) : (
          !props.viewingUngrouped && (
            <FilterRow label={t("sidebar.skillGroups")}>
              <FilterChoice
                active={!props.ungrouped}
                onClick={() => props.ungrouped && props.onUngroupedChange()}
              >
                {t("mySkills.filterPanel.all")}
              </FilterChoice>
              <FilterChoice
                active={props.ungrouped}
                onClick={props.onUngroupedChange}
              >
                {t("mySkills.sourceFilter.ungrouped")}
                <span className="tabular-nums opacity-70">
                  {props.ungroupedCount}
                </span>
              </FilterChoice>
            </FilterRow>
          )
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
                  "inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12px] text-accent-light hover:bg-surface-hover",
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
