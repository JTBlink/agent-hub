import { useMemo, useState } from "react";
import { DownloadCloud, Search, SquareCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMultiSelect } from "../hooks/useMultiSelect";
import {
  gitSkillInstallation,
  type GitRepository,
} from "../lib/gitRepositories";
import type { GitSkillPreview, ManagedSkill } from "../lib/tauri";
import type { GitInstallSelection } from "../hooks/useGitRepositories";
import { GitSkillCard } from "./GitSkillCard";
import { GitBrowserDialog } from "./GitBrowserDialog";
import { MultiSelectToolbar } from "./MultiSelectToolbar";

export function GitRepositorySkills({
  repository,
  managedSkills,
  busyPaths,
  disabled,
  onInstall,
  onOpenInstalled,
}: {
  repository: GitRepository;
  managedSkills: ManagedSkill[];
  busyPaths: string[];
  disabled: boolean;
  onInstall: (items: GitInstallSelection[]) => Promise<boolean>;
  onOpenInstalled: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<GitSkillPreview | null>(null);
  const [plan, setPlan] = useState<GitInstallSelection[] | null>(null);
  const installed = useMemo(
    () =>
      new Map(
        repository.skills.map((skill) => [
          skill.repo_path,
          gitSkillInstallation(repository, skill, managedSkills),
        ]),
      ),
    [repository, managedSkills],
  );
  const filtered = repository.skills.filter((skill) => {
    const matches =
      `${skill.name} ${skill.description ?? ""} ${skill.repo_path}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    return (
      matches &&
      (status === "all" ||
        (status === "installed") === !!installed.get(skill.repo_path))
    );
  });
  const available = repository.skills.filter(
    (skill) => !installed.get(skill.repo_path)?.fromCurrentRepository,
  );
  const selectable = filtered.filter(
    (skill) => !installed.get(skill.repo_path)?.fromCurrentRepository,
  );
  const multi = useMultiSelect({
    items: available,
    filtered: selectable,
    getKey: (skill) => skill.repo_path,
    isItemActive: () => !disabled,
    filterSignal: `${query}:${status}`,
    scopeSignal: repository.id,
    escapeEnabled: !detail && !plan && !disabled,
  });

  const requestInstall = (skills: GitSkillPreview[]) => {
    const selections = skills.map((skill) => {
      const existing = installed.get(skill.repo_path);
      return {
        repo_path: skill.repo_path,
        name: existing?.skill.name ?? skill.name,
        ...(existing ? { overwrite_skill_id: existing.skill.id } : {}),
      };
    });
    if (
      skills.length > 1 ||
      selections.some((item) => item.overwrite_skill_id)
    ) {
      setPlan(selections);
    } else {
      void onInstall(selections).then((success) => {
        if (success) multi.exitMultiSelect();
      });
    }
  };

  const detailInstallation = detail
    ? installed.get(detail.repo_path)
    : undefined;
  const overwriting = plan?.some((item) => !!item.overwrite_skill_id) ?? false;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("install.gitBrowser.search")}
            placeholder={t("install.gitBrowser.search")}
            className="app-input w-full pl-9"
          />
        </label>
        <select
          aria-label={t("install.gitBrowser.status")}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="app-input"
        >
          <option value="all">{t("install.gitBrowser.all")}</option>
          <option value="available">{t("install.gitBrowser.available")}</option>
          <option value="installed">{t("install.installed")}</option>
        </select>
        <button
          type="button"
          disabled={disabled || available.length === 0}
          onClick={() =>
            multi.isMultiSelect
              ? multi.exitMultiSelect()
              : multi.setIsMultiSelect(true)
          }
          className="app-button-secondary"
        >
          <SquareCheck aria-hidden="true" className="h-3.5 w-3.5" />
          {t(
            multi.isMultiSelect ? "common.cancel" : "install.gitBrowser.batch",
          )}
        </button>
      </div>
      {multi.isMultiSelect && (
        <MultiSelectToolbar
          selectedCount={multi.selectedIds.size}
          isAllSelected={multi.isAllSelected}
          labels={{
            hint: t("install.gitBrowser.selectionHint"),
            selected: t("install.gitBrowser.selected", {
              count: multi.selectedIds.size,
            }),
            selectAll: t("install.gitPreview.selectAll"),
            deselectAll: t("install.gitPreview.deselectAll"),
            cancel: t("common.cancel"),
            more: t("install.gitBrowser.more"),
          }}
          actions={[
            {
              key: "install",
              label: t("install.gitPreview.confirm"),
              icon: <DownloadCloud className="h-3.5 w-3.5" />,
              tone: "primary",
              disabled,
              busy: busyPaths.length > 0,
              onSelect: () =>
                requestInstall(
                  selectable.filter((skill) =>
                    multi.selectedIds.has(skill.repo_path),
                  ),
                ),
            },
          ]}
          onSelectAll={() => {
            if (!disabled) multi.handleSelectAll();
          }}
          onCancel={() => {
            if (!disabled) multi.exitMultiSelect();
          }}
        />
      )}
      <p role="status" className="text-[12px] text-muted">
        {t("install.gitBrowser.count", { count: filtered.length })}
      </p>
      {filtered.length === 0 ? (
        <div className="app-panel px-5 py-12 text-center text-[13px] text-muted">
          {t(
            repository.skills.length === 0
              ? "install.gitPreview.empty"
              : "install.gitBrowser.noMatches",
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((skill) => (
            <GitSkillCard
              key={skill.repo_path}
              skill={skill}
              source={repository.name}
              installed={!!installed.get(skill.repo_path)}
              otherSource={
                installed.get(skill.repo_path)?.fromCurrentRepository === false
              }
              busy={busyPaths.includes(skill.repo_path)}
              disabled={disabled}
              selecting={multi.isMultiSelect}
              selected={multi.selectedIds.has(skill.repo_path)}
              onSelect={() => multi.toggleSelect(skill.repo_path)}
              onInstall={() => requestInstall([skill])}
              onDetails={() => setDetail(skill)}
            />
          ))}
        </div>
      )}
      {detail && (
        <GitBrowserDialog title={detail.name} onClose={() => setDetail(null)}>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-secondary">
            {detail.description || t("install.gitBrowser.noDescription")}
          </p>
          <dl className="mt-4 space-y-2 break-all text-[12px] text-muted">
            <div>
              <dt className="font-medium text-tertiary">
                {t("install.repoUrl")}
              </dt>
              <dd>{repository.url}</dd>
            </div>
            <div>
              <dt className="font-medium text-tertiary">
                {t("install.gitBrowser.path")}
              </dt>
              <dd>{detail.repo_path || "/"}</dd>
            </div>
          </dl>
          {detailInstallation && !detailInstallation.fromCurrentRepository && (
            <p className="mt-4 rounded-lg border border-border-subtle bg-background p-3 text-[13px] text-tertiary">
              {t("install.gitBrowser.otherSourceHint")}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {detailInstallation && (
              <button
                type="button"
                className="app-button-secondary"
                onClick={() => {
                  setDetail(null);
                  onOpenInstalled(detailInstallation.skill.id);
                }}
              >
                {t("install.gitBrowser.openInstalled")}
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              className="app-button-primary"
              onClick={() => {
                requestInstall([detail]);
                setDetail(null);
              }}
            >
              <DownloadCloud aria-hidden="true" className="h-3.5 w-3.5" />
              {t(
                detailInstallation
                  ? "install.gitBrowser.overwriteInstall"
                  : "install.oneClickInstall",
              )}
            </button>
          </div>
        </GitBrowserDialog>
      )}
      {plan && (
        <GitBrowserDialog
          title={t(
            overwriting
              ? "install.gitBrowser.overwriteInstall"
              : "install.gitPreview.title",
          )}
          busy={disabled}
          onClose={() => setPlan(null)}
        >
          <p className="mb-4 text-[13px] text-muted">
            {t(
              overwriting
                ? "install.gitBrowser.overwriteConfirmation"
                : "install.gitPreview.description",
            )}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onInstall(plan).then((success) => {
                if (success) {
                  setPlan(null);
                  multi.exitMultiSelect();
                }
              });
            }}
          >
            <div className="space-y-3">
              {plan.map((item, index) => (
                <label
                  key={item.repo_path}
                  className="block text-[12px] text-muted"
                >
                  <span className="block truncate" title={item.repo_path}>
                    {item.repo_path || "/"}
                  </span>
                  <input
                    data-initial-focus={index === 0 ? true : undefined}
                    value={item.name}
                    required
                    disabled={disabled}
                    readOnly={!!item.overwrite_skill_id}
                    aria-label={t("install.gitBrowser.skillName", {
                      path: item.repo_path || "/",
                    })}
                    onChange={(event) =>
                      setPlan(
                        (previous) =>
                          previous?.map((entry) =>
                            entry.repo_path === item.repo_path
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ) ?? null,
                      )
                    }
                    className="app-input mt-1 w-full"
                  />
                  {item.overwrite_skill_id && (
                    <span className="mt-1 block text-tertiary">
                      {t("install.gitBrowser.overwriteTarget", {
                        name: item.name,
                      })}
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setPlan(null)}
                className="app-button-secondary"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={disabled || plan.some((item) => !item.name.trim())}
                className="app-button-primary"
              >
                {t(
                  overwriting
                    ? "install.gitBrowser.confirmOverwrite"
                    : "install.gitPreview.confirm",
                )}
              </button>
            </div>
          </form>
        </GitBrowserDialog>
      )}
    </div>
  );
}
