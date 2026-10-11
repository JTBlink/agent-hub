import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import type { ManagedSkill, ProjectSkill, SkillGroup } from "../lib/tauri";
import { cn } from "../utils";
import { DocumentDiffViewer } from "./DocumentDiffViewer";
import { ProjectSkillUploadTarget } from "./ProjectSkillUploadTarget";

export function ProjectSkillConflictPreview({
  projectId,
  variants,
  selectedAgent,
  managedSkills,
  skillGroups,
  selectedGroup,
  onSelectGroup,
  onSelectAgent,
}: {
  projectId: string;
  variants: ProjectSkill[];
  selectedAgent: string | null;
  managedSkills: ManagedSkill[];
  skillGroups: SkillGroup[];
  selectedGroup?: string;
  onSelectGroup: (groupId: string) => void;
  onSelectAgent: (agent: string) => void;
}) {
  const { t } = useTranslation();
  const [compareAgent, setCompareAgent] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const requestKey = [
    projectId,
    ...variants.map((variant) => `${variant.agent}:${variant.relative_path}`),
  ].join("\u0000");
  const [fileState, setFileState] = useState<{
    key: string;
    files: Record<string, Record<string, string>>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      variants.map(async (variant) => {
        try {
          const files = await api.getProjectSkillFiles(
            projectId,
            variant.relative_path,
            variant.agent,
          );
          return [
            variant.agent,
            Object.fromEntries(
              files.map((file) => [file.filename, file.content]),
            ),
          ] as const;
        } catch {
          return [variant.agent, {}] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setFileState({ key: requestKey, files: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, requestKey, variants]);

  const loading = fileState?.key !== requestKey;
  const filesByAgent = fileState?.key === requestKey ? fileState.files : {};
  const fallbackCompareAgent =
    variants.find((variant) => variant.agent !== selectedAgent)?.agent ?? null;
  const effectiveCompareAgent =
    compareAgent && variants.some((variant) => variant.agent === compareAgent)
      ? compareAgent
      : fallbackCompareAgent;

  const selectedVariant = variants.find(
    (variant) => variant.agent === selectedAgent,
  );
  const compareVariant = variants.find(
    (variant) => variant.agent === effectiveCompareAgent,
  );
  const selectedFiles = selectedVariant
    ? (filesByAgent[selectedVariant.agent] ?? {})
    : {};
  const compareFiles = compareVariant
    ? (filesByAgent[compareVariant.agent] ?? {})
    : {};
  const filenames = Array.from(
    new Set([...Object.keys(selectedFiles), ...Object.keys(compareFiles)]),
  ).sort();
  const changedFiles = filenames.filter(
    (filename) => selectedFiles[filename] !== compareFiles[filename],
  );
  const file =
    activeFile && filenames.includes(activeFile)
      ? activeFile
      : (changedFiles[0] ?? filenames[0] ?? null);

  return (
    <div className="space-y-3">
      {selectedVariant && (
        <ProjectSkillUploadTarget
          variant={selectedVariant}
          managedSkills={managedSkills}
          skillGroups={skillGroups}
          selectedGroup={selectedGroup}
          onSelectGroup={onSelectGroup}
        />
      )}
      <p className="text-[12px] leading-5 text-muted">
        {t("project.updateCenterConflictHint")}
      </p>
      <div className="space-y-1.5">
        {variants.map((variant) => (
          <label
            key={variant.agent}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[12px] text-secondary hover:bg-surface-hover"
          >
            <input
              type="radio"
              name="center-conflict-source"
              checked={selectedAgent === variant.agent}
              onChange={() => onSelectAgent(variant.agent)}
            />
            <span className="font-medium">{variant.agent_display_name}</span>
            <span className="ml-auto text-muted">
              {variant.sync_status === "project_only"
                ? t("project.syncStatus.projectOnly")
                : t("project.syncStatus.diverged")}
            </span>
          </label>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("common.loading")}
        </div>
      ) : selectedVariant && compareVariant ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="rounded bg-accent/10 px-2 py-1 text-accent">
              {t("project.updateCenterSelectedVersion", {
                agent: selectedVariant.agent_display_name,
              })}
            </span>
            <span>{t("project.updateCenterDiffLabel")}</span>
            {variants
              .filter((variant) => variant.agent !== selectedAgent)
              .map((variant) => (
                <button
                  key={variant.agent}
                  type="button"
                  onClick={() => setCompareAgent(variant.agent)}
                  className={cn(
                    "rounded-full px-2 py-0.5",
                    compareAgent === variant.agent
                      ? "bg-accent text-white"
                      : "bg-surface-hover text-secondary",
                  )}
                >
                  {variant.agent_display_name}
                </button>
              ))}
          </div>
          {changedFiles.length > 0 ? (
            <>
              <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                {changedFiles.map((filename) => (
                  <button
                    key={filename}
                    type="button"
                    onClick={() => setActiveFile(filename)}
                    className={cn(
                      "rounded px-2 py-1 font-mono text-[11px]",
                      file === filename
                        ? "bg-accent text-white"
                        : "bg-surface-hover text-secondary",
                    )}
                  >
                    {filename}
                  </button>
                ))}
              </div>
              {file ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
                    <span className="font-mono">{file}</span>
                    <span>{t("project.updateCenterDiffLegend")}</span>
                  </div>
                  <DocumentDiffViewer
                    original={compareFiles[file] ?? ""}
                    updated={selectedFiles[file] ?? ""}
                    className="max-h-64 overflow-y-auto"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-border-subtle px-3 py-4 text-center text-[12px] text-muted">
              {t("project.updateCenterNoDiff")}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
