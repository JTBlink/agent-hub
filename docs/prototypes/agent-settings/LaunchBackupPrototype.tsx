import { useState } from "react";
import { Cloud, RotateCcw } from "lucide-react";
import { ToggleSwitch } from "../../../src/components/ToggleSwitch";
import { AppDialog } from "../../../src/components/AppDialog";
import type { LaunchSettingsPrototype } from "./useLaunchSettingsPrototype";

export function LaunchBackupPrototype({
  settings,
}: {
  settings: LaunchSettingsPrototype;
}) {
  const [restore, setRestore] = useState(false);
  const [notice, setNotice] = useState("");
  const count = Object.values(settings.groups).reduce(
    (sum, item) => sum + item.groups.length,
    0,
  );
  return (
    <section className="app-page max-w-3xl space-y-5">
      <header>
        <h2 className="text-base font-semibold">Agent 启动配置备份</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          启动方案、默认方案与默认 Agent 纳入统一备份，恢复后对后续启动生效。
        </p>
      </header>
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 h-4 w-4 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">包含 Agent 启动配置</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              沿用已有同步与备份设置。
            </p>
          </div>
          <ToggleSwitch
            checked={settings.backupEnabled}
            title="包含 Agent 启动配置"
            onChange={() => settings.setBackupEnabled(!settings.backupEnabled)}
          />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-xs">
          <div>
            <dt className="text-muted">当前方案</dt>
            <dd className="mt-1 text-secondary">{count} 套</dd>
          </div>
          <div>
            <dt className="text-muted">状态</dt>
            <dd className="mt-1 text-secondary">
              {!settings.backupEnabled
                ? "未加入备份"
                : !settings.backup
                  ? "尚未创建演示备份"
                  : settings.changed
                    ? "有待备份的更改"
                    : "与演示备份一致"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">最近备份</dt>
            <dd className="mt-1 text-secondary">
              {settings.backup?.time ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">备份内容</dt>
            <dd className="mt-1 text-secondary">
              方案名称、启动指令和默认选择
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!settings.backupEnabled || !settings.changed}
            className="app-button-primary"
            onClick={() => {
              settings.createBackup();
              setNotice("已创建演示备份，仅保存在本页内存中。");
            }}
          >
            备份预览
          </button>
          <button
            type="button"
            disabled={!settings.backup}
            className="app-button-secondary"
            onClick={() => setRestore(true)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复预览
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4 text-xs leading-6 text-muted">
        <p>方案恢复时保留原有标识，自动化、终端和 Herdr 继续使用同一份配置。</p>
        <p>原型不访问真实备份仓库，不上传文件；刷新页面会重置演示备份。</p>
      </div>
      {notice && (
        <p role="status" className="text-sm text-secondary">
          {notice}
        </p>
      )}
      {restore && (
        <AppDialog
          title="恢复 Agent 启动配置"
          onClose={() => setRestore(false)}
        >
          <p className="text-sm leading-6 text-secondary">
            将恢复到 {settings.backup?.time}{" "}
            的演示备份，替换当前方案和默认选择。已运行的会话不受影响。
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="app-button-secondary"
              onClick={() => setRestore(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="app-button-primary"
              onClick={() => {
                settings.restoreBackup();
                setRestore(false);
                setNotice("已恢复演示备份，所有入口已更新。");
              }}
            >
              恢复配置
            </button>
          </div>
        </AppDialog>
      )}
    </section>
  );
}
