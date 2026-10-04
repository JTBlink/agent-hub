import { useEffect, useState } from "react";
import {
  clearUserData,
  getUserDataPaths,
  openDirectoryInEditor,
} from "../lib/backend";
import { compactUserPath } from "../lib/diagnostic-recovery-presentation";
import { useLanguage } from "../lib/i18n";
import { Icon } from "./AppIcons";
import { ConfirmModal } from "./Modal";
import { formatBytes } from "./shell-presentation";
import { SubTabs } from "./SubTabs";

export function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const [tab, setTab] = useState<"privacy" | "scanning" | "data">("privacy");
  const [dataPaths, setDataPaths] =
    useState<Awaited<ReturnType<typeof getUserDataPaths>>>();
  const [pathError, setPathError] = useState<string>();
  const [clearingKind, setClearingKind] = useState<"backups" | "logs">();
  const [pendingClear, setPendingClear] = useState<{
    kind: "backups" | "logs";
    label: string;
  }>();
  useEffect(() => {
    void getUserDataPaths()
      .then(setDataPaths)
      .catch(() => {
        setPathError("无法读取 AgentHub 用户数据目录，请稍后重试。");
      });
  }, []);
  function openDataPath(path: string) {
    setPathError(undefined);
    void openDirectoryInEditor(path)
      .then((opened) => {
        if (!opened) {
          setPathError("无法用 VS Code 或文件管理器打开该目录。");
        }
      })
      .catch(() => setPathError("无法用 VS Code 或文件管理器打开该目录。"));
  }
  const dataLocations = dataPaths
    ? ([
        ["AgentHub 数据目录", dataPaths.root, undefined],
        ["数据库", dataPaths.database, undefined],
        ["备份", dataPaths.backups, "backups"],
        ["日志", dataPaths.logs, "logs"],
      ] as const)
    : [];
  function clearPath(kind: "backups" | "logs", label: string) {
    setPendingClear({ kind, label });
  }
  function confirmClear() {
    if (!pendingClear) return;
    const { kind, label } = pendingClear;
    setPendingClear(undefined);
    setClearingKind(kind);
    setPathError(undefined);
    void clearUserData(kind)
      .then(setDataPaths)
      .catch(() => setPathError(`无法清理${label}，请稍后重试。`))
      .finally(() => setClearingKind(undefined));
  }
  return (
    <div className="page">
      <div className="settings-heading">
        <div>
          <p className="eyebrow">{t("settings")}</p>
          <h1>{t("settings")}</h1>
        </div>
        <p>{t("settingsDescription")}</p>
      </div>
      <SubTabs
        value={tab}
        ariaLabel="设置分类"
        onChange={setTab}
        items={[
          {
            value: "privacy",
            label: t("settingsPrivacy"),
            icon: <Icon name="shield" size={16} />,
          },
          {
            value: "scanning",
            label: t("settingsScanning"),
            icon: <Icon name="refresh" size={16} />,
          },
          {
            value: "data",
            label: t("settingsData"),
            icon: <Icon name="folder" size={16} />,
          },
        ]}
      />
      <div className="settings-panel">
        {tab === "privacy" && (
          <section className="surface-card">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">隐私与安全</p>
                <h2>本地优先</h2>
              </div>
              <Icon name="shield" size={24} />
            </div>
            <div className="setting-row">
              <div>
                <strong>敏感值遮罩</strong>
                <span>Token、密钥和密码在预览与诊断中自动隐藏</span>
              </div>
              <span className="setting-value">强制开启</span>
            </div>
            <div className="setting-row">
              <div>
                <strong>写入前备份</strong>
                <span>每次确认写入都会保留可回滚副本</span>
              </div>
              <span className="setting-value">强制开启</span>
            </div>
          </section>
        )}
        {tab === "scanning" && (
          <section className="surface-card">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">扫描偏好</p>
                <h2>保持信息新鲜</h2>
              </div>
              <Icon name="refresh" size={24} />
            </div>
            <div className="setting-row">
              <div>
                <strong>启动时扫描</strong>
                <span>打开应用后读取三种 Agent 的全局配置</span>
              </div>
              <span className="setting-value">默认开启</span>
            </div>
            <div className="setting-row">
              <div>
                <strong>{t("language")}</strong>
                <span>{t("languageDescription")}</span>
              </div>
              <select
                className="setting-language-select"
                aria-label={t("language")}
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as typeof language)
                }
              >
                <option value="zh-CN">{t("simplifiedChinese")}</option>
                <option value="en-US">{t("english")}</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <strong>目录打开方式</strong>
                <span>优先使用 VS Code；不可用时打开系统文件夹</span>
              </div>
              <span className="setting-value">VS Code 优先</span>
            </div>
          </section>
        )}
        {tab === "data" && (
          <section className="surface-card settings-data-card">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">用户数据</p>
                <h2>数据目录与备份</h2>
              </div>
              <Icon name="folder" size={24} />
            </div>
            <p className="settings-data-description">
              AgentHub 的数据库、备份、Skill
              来源缓存和日志都保存在本机。打开目录不会修改其中的文件。
            </p>
            <div className="settings-data-list">
              {dataLocations.map(([label, location, clearKind]) => (
                <div className="settings-data-row" key={location.path}>
                  <div>
                    <strong>{label}</strong>
                    <code title={location.path}>
                      {compactUserPath(location.path)}
                    </code>
                    <span className="settings-data-size">
                      {formatBytes(location.bytes)}
                    </span>
                  </div>
                  <div className="settings-data-actions">
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={() => openDataPath(location.path)}
                    >
                      <Icon name="external" size={14} />
                      打开目录
                    </button>
                    {clearKind && (
                      <button
                        className="button button-danger-ghost"
                        type="button"
                        disabled={Boolean(clearingKind)}
                        onClick={() => clearPath(clearKind, label)}
                      >
                        {clearingKind === clearKind ? "清理中…" : "清理"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {pathError && (
              <p className="settings-data-error" role="alert">
                {pathError}
              </p>
            )}
          </section>
        )}
        {pendingClear && (
          <ConfirmModal
            open
            tone="danger"
            title={`确定清理${pendingClear.label}？`}
            description={
              <>
                这会删除该目录中的文件，操作完成后无法从 AgentHub 恢复。
                {pendingClear.kind === "backups"
                  ? "数据库、日志和 Skill 来源缓存不会受到影响。"
                  : "数据库和备份不会受到影响。"}
              </>
            }
            confirmLabel="确认清理"
            onCancel={() => setPendingClear(undefined)}
            onConfirm={confirmClear}
          />
        )}
      </div>
    </div>
  );
}
