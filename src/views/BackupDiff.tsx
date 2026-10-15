import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  RefreshCw,
} from "lucide-react";
import { gitBackupStatus, gitBackupFileDiff } from "../lib/tauri";
import type { GitBackupChange, GitBackupFileDiff } from "../lib/tauri";
import { DocumentDiffViewer } from "../components/DocumentDiffViewer";
import { cn } from "../utils";

const KIND_TONE: Record<string, string> = {
  added: "text-emerald-600 dark:text-emerald-400",
  deleted: "text-red-500 dark:text-red-400",
  modified: "text-sky-600 dark:text-sky-400",
  renamed: "text-amber-600 dark:text-amber-400",
  conflicted: "text-orange-600 dark:text-orange-400",
};

const KIND_LETTER: Record<string, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  conflicted: "C",
};

interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  change?: GitBackupChange;
}

function buildTree(changes: GitBackupChange[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", children: new Map() };
  for (const change of changes) {
    const parts = change.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          fullPath: parts.slice(0, i + 1).join("/"),
          children: new Map(),
        });
      }
      node = node.children.get(part)!;
    }
    node.change = change;
  }
  return root;
}

function collectDirs(changes: GitBackupChange[]): Set<string> {
  const dirs = new Set<string>();
  for (const change of changes) {
    const parts = change.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return dirs;
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  expandedDirs,
  onToggleDir,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const { t } = useTranslation();
  const isDir = node.children.size > 0 && !node.change;
  const isExpanded = expandedDirs.has(node.fullPath);
  const isSelected = node.change && node.change.path === selectedPath;

  if (isDir) {
    const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
      const aIsDir = a.children.size > 0 && !a.change;
      const bIsDir = b.children.size > 0 && !b.change;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return (
      <>
        <button
          type="button"
          className="flex w-full items-center gap-1 px-1 py-0.5 text-left text-[12px] text-secondary hover:bg-surface-hover"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => onToggleDir(node.fullPath)}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded &&
          sortedChildren.map((child) => (
            <FileTreeNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
      </>
    );
  }

  const change = node.change;
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1 px-1 py-0.5 text-left text-[12px] transition-colors",
        isSelected
          ? "bg-accent-bg/60 text-primary"
          : "text-secondary hover:bg-surface-hover",
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      onClick={() => change && onSelect(change.path)}
    >
      <File className="h-3.5 w-3.5 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {change && (
        <span
          className={cn(
            "shrink-0 px-1 text-[11px] font-semibold",
            KIND_TONE[change.kind] ?? "",
          )}
          title={t(`backup.changes.${change.kind}`)}
        >
          {KIND_LETTER[change.kind] ?? "?"}
        </span>
      )}
    </button>
  );
}

export default function BackupDiff() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const passedChanges = (location.state as { changes?: GitBackupChange[] })
    ?.changes;

  const [changes, setChanges] = useState<GitBackupChange[]>(
    passedChanges ?? [],
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(
    passedChanges?.[0]?.path ?? null,
  );
  const [diff, setDiff] = useState<GitBackupFileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(!!passedChanges?.[0]?.path);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(!passedChanges);
  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [diffVersion, setDiffVersion] = useState(0);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() =>
    collectDirs(passedChanges ?? []),
  );

  const selectFile = useCallback(
    (path: string) => {
      // Repeated selection preserves the current request or result.
      if (path === selectedPath) return;
      setSelectedPath(path);
      setDiff(null);
      setDiffLoading(true);
      setDiffError(null);
    },
    [selectedPath],
  );

  useEffect(() => {
    if (passedChanges && refreshVersion === 0) return;
    let cancelled = false;
    gitBackupStatus()
      .then((status) => {
        if (cancelled) return;
        setChanges(status.changes);
        setExpandedDirs(collectDirs(status.changes));
        setSelectedPath((current) =>
          status.changes.some((change) => change.path === current)
            ? current
            : (status.changes[0]?.path ?? null),
        );
        setDiff(null);
        setDiffError(null);
        setDiffLoading(status.changes.length > 0);
        // Re-read content even when the selected path has not changed.
        setDiffVersion((version) => version + 1);
      })
      .catch((err) => {
        if (!cancelled) setPageError(String(err));
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [passedChanges, refreshVersion]);

  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    gitBackupFileDiff(selectedPath)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((err) => {
        if (!cancelled) setDiffError(String(err));
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath, diffVersion]);

  const refreshing = pageLoading || diffLoading;
  const refresh = () => {
    if (refreshing) return;
    setPageError(null);
    setPageLoading(true);
    setRefreshVersion((version) => version + 1);
  };

  const tree = useMemo(() => buildTree(changes), [changes]);

  const onToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const sortedRootChildren = useMemo(() => {
    return Array.from(tree.children.values()).sort((a, b) => {
      const aIsDir = a.children.size > 0 && !a.change;
      const bIsDir = b.children.size > 0 && !b.change;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [tree]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border-subtle px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => navigate("/backup")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("backup.changes.backToBackup")}
          </button>
          <h1 className="text-[14px] font-semibold text-primary">
            {t("backup.changes.diffTitle")}
          </h1>
          <span className="rounded-full bg-surface-active px-2 py-0.5 text-[11px] text-muted">
            {changes.length}
          </span>
          <button
            type="button"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1 text-[12px] font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60"
            onClick={refresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
            {t("backup.changes.refresh")}
          </button>
        </div>
      </header>

      {pageError && (
        <div
          role="alert"
          className="shrink-0 bg-danger-bg px-4 py-2 text-[12px] text-danger"
        >
          {pageError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: file tree */}
        <div className="flex w-64 shrink-0 flex-col border-r border-border-subtle bg-bg-secondary">
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {sortedRootChildren.map((child) => (
              <FileTreeNode
                key={child.fullPath}
                node={child}
                depth={0}
                selectedPath={selectedPath}
                onSelect={selectFile}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
              />
            ))}
            {changes.length === 0 && !pageLoading && !pageError && (
              <div className="px-3 py-4 text-center text-[12px] text-muted">
                {t("backup.changes.noContent")}
              </div>
            )}
          </div>
        </div>

        {/* Right: diff viewer */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!selectedPath && !diffLoading && !pageLoading && (
            <div className="flex flex-1 items-center justify-center text-[13px] text-muted">
              {t("backup.changes.selectFile")}
            </div>
          )}

          {(diffLoading || (pageLoading && !selectedPath)) && (
            <div className="flex flex-1 items-center justify-center text-[13px] text-muted">
              Loading…
            </div>
          )}

          {diffError && !diffLoading && (
            <div className="m-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {diffError}
            </div>
          )}

          {selectedPath && diff && !diffLoading && (
            <>
              <div className="grid shrink-0 grid-cols-2 border-b border-border-subtle bg-surface">
                <div className="flex items-center gap-2 border-r border-border-subtle px-3 py-1.5">
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-semibold",
                      KIND_TONE[diff.status] ?? "",
                    )}
                  >
                    {KIND_LETTER[diff.status] ?? "?"}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-muted">
                    {t("backup.changes.originalVersion")}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-secondary"
                    title={diff.path}
                  >
                    {diff.path}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="shrink-0 text-[11px] font-medium text-muted">
                    {t("backup.changes.currentVersion")}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-secondary"
                    title={diff.path}
                  >
                    {diff.path}
                  </span>
                  <span className="shrink-0 rounded bg-surface-active px-1.5 py-0.5 text-[11px] text-muted">
                    {t(`backup.changes.${diff.status}`)}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {diff.content_kind === "text" ? (
                  <DocumentDiffViewer
                    original={diff.original_text ?? ""}
                    updated={diff.updated_text ?? ""}
                    className="!space-y-0 !rounded-none !border-0"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[13px] text-muted">
                    {t(
                      diff.content_kind === "binary"
                        ? "backup.changes.binaryFile"
                        : "backup.changes.tooLarge",
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
