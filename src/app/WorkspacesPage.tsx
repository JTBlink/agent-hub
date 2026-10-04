import { useEffect, useState } from "react";
import {
  addWorkspace,
  removeWorkspace,
  scanWorkspace,
  type WorkspaceRecord,
  type WorkspaceScanResult,
} from "../lib/backend";
import { selectWorkspaceDirectory } from "../lib/workspace-dialog";
import { Icon } from "./AppIcons";
import { useConfirm } from "./Modal";

export function WorkspacesPage({
  workspaces,
  selectedWorkspacePath,
  onSelectWorkspace,
  onChanged,
  onScanned,
  searchQuery,
}: {
  workspaces: WorkspaceRecord[];
  selectedWorkspacePath: string;
  onSelectWorkspace: (workspacePath: string) => void;
  onChanged: () => void;
  onScanned: (result: WorkspaceScanResult, navigateToConfigs?: boolean) => void;
  searchQuery: string;
}) {
  const [path, setPath] = useState("");
  const [message, setMessage] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selectingWorkspace, setSelectingWorkspace] = useState(false);
  const { confirm, ConfirmPortal } = useConfirm();
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleWorkspaces = normalizedQuery
    ? workspaces.filter((workspace) =>
        [workspace.displayName, workspace.normalizedPath]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : workspaces;
  async function addAndScan() {
    if (busy) return;
    setBusy(true);
    try {
      let targetPath = path.trim();
      if (!targetPath) {
        const selection = await selectWorkspaceDirectory();
        if (!selection) return;
        targetPath = selection;
        setPath(selection);
      }
      await addWorkspace(targetPath);
      const result = await scanWorkspace(targetPath);
      setMessage("工作空间已添加并完成扫描。");
      setPath("");
      onChanged();
      onScanned(result);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "工作空间添加失败，请检查目录后重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) return;
    const confirmed = await confirm({
      tone: "danger",
      title: "清理工作空间路径？",
      description: (
        <p>
          将移除“{workspace.displayName}
          ”的登记记录。磁盘上的工作空间文件不会被删除。
        </p>
      ),
      confirmLabel: "确认清理",
      cancelLabel: "保留",
    });
    if (!confirmed) return;
    try {
      await removeWorkspace(id);
      setToast("工作空间路径已清理，磁盘目录没有被删除。");
      onChanged();
    } catch {
      setMessage("移除失败，请重新扫描后重试。");
    }
  }
  async function selectWorkspace(workspacePath: string) {
    if (busy || selectingWorkspace || workspacePath === selectedWorkspacePath) {
      return;
    }
    setSelectingWorkspace(true);
    setMessage(undefined);
    onSelectWorkspace(workspacePath);
    try {
      const result = await scanWorkspace(workspacePath);
      onChanged();
      onScanned(result, false);
    } catch {
      setMessage("切换工作空间失败，请重新扫描后重试。");
    } finally {
      setSelectingWorkspace(false);
    }
  }
  return (
    <div className="page">
      <h1 className="sr-only">工作空间</h1>
      <section className="workspace-add surface-card">
        <div>
          <p className="eyebrow">添加本地目录</p>
          <h2>添加工作空间路径</h2>
        </div>
        <div className="workspace-form">
          <label htmlFor="workspace-path">工作空间路径</label>
          <div className="workspace-path-row">
            <input
              id="workspace-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="例如 ~/projects/demo"
            />
            <button
              className="button button-primary"
              type="button"
              disabled={busy}
              onClick={addAndScan}
            >
              <Icon name="plus" size={16} />
              {busy ? "扫描中…" : "添加并扫描"}
            </button>
          </div>
          <small>路径会先规范化并拒绝符号链接，避免重复登记和越权扫描。</small>
        </div>
        {message && (
          <p className="inline-message" role="status" aria-live="polite">
            {message}
          </p>
        )}
      </section>
      <section className="workspace-list surface-card">
        <div className="section-title-row workspace-list-heading">
          <p className="eyebrow">已登记目录</p>
          <h2>
            {workspaces.length
              ? `${workspaces.length} 个工作空间`
              : "还没有工作空间"}
          </h2>
        </div>
        {visibleWorkspaces.length ? (
          <div className="workspace-rows">
            {visibleWorkspaces.map((workspace) => (
              <article className="workspace-row" key={workspace.id}>
                <div className="quick-icon teal">
                  <Icon name="folder" size={17} />
                </div>
                <div>
                  <strong>{workspace.displayName}</strong>
                  <span>{workspace.normalizedPath}</span>
                </div>
                <div className="workspace-row-actions">
                  {selectedWorkspacePath === workspace.normalizedPath ? (
                    <span className="workspace-current-pill">当前工作空间</span>
                  ) : (
                    <button
                      className="button button-secondary workspace-select-button"
                      type="button"
                      disabled={selectingWorkspace}
                      onClick={() =>
                        void selectWorkspace(workspace.normalizedPath)
                      }
                    >
                      设为当前
                    </button>
                  )}
                  <button
                    className="button button-ghost"
                    onClick={() =>
                      void scanWorkspace(workspace.normalizedPath)
                        .then((result) => {
                          onChanged();
                          onScanned(result, false);
                        })
                        .catch(() =>
                          setMessage("重新扫描失败，请确认目录仍然存在。"),
                        )
                    }
                  >
                    <Icon name="refresh" size={15} />
                    重扫
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`移除 ${workspace.displayName}`}
                    onClick={() => void remove(workspace.id)}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : normalizedQuery ? (
          <div className="workspace-empty">
            <div className="empty-icon">
              <Icon name="search" size={23} />
            </div>
            <h3>没有匹配的工作空间</h3>
            <p>试试工作空间名称或目录路径中的其他关键词。</p>
          </div>
        ) : (
          <div className="workspace-empty">
            <div className="empty-icon">
              <Icon name="folder" size={23} />
            </div>
            <h3>从一个工作空间目录开始</h3>
            <p>
              配置按全局与工作空间作用域分别管理。Skills 由独立模块统一管理。
            </p>
          </div>
        )}
      </section>
      {toast && (
        <div className="workspace-toast" role="status" aria-live="polite">
          <Icon name="check" size={16} />
          <span>{toast}</span>
        </div>
      )}
      {ConfirmPortal}
    </div>
  );
}
