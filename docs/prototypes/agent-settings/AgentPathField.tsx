import { useState } from "react";
import { Check, FolderOpen, Pencil, RotateCcw, X } from "lucide-react";
import { AgentDirectoryPicker } from "./AgentPrototypeDialog";
export function AgentPathField({
  name,
  label,
  value,
  allowEmpty = false,
  save,
  reset,
}: {
  name: string;
  label: string;
  value: string;
  allowEmpty?: boolean;
  save: (value: string) => void;
  reset?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState(false);
  const commit = () => {
    if (allowEmpty || draft.trim()) {
      save(draft.trim());
      setEditing(false);
    }
  };
  return (
    <div className="ap-path-field">
      <span>{label}</span>
      <div>
        {editing ? (
          <>
            <input
              autoFocus
              aria-label={`${name} ${label}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={allowEmpty ? "未配置项目路径" : "~/skills"}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") setEditing(false);
              }}
            />
            {!allowEmpty && (
              <button
                aria-label={`${name} 选择文件夹`}
                title="选择文件夹"
                onClick={() => setPicking(true)}
              >
                <FolderOpen size={13} />
              </button>
            )}
            <button
              aria-label={`${name} 保存${label}`}
              title="保存"
              disabled={!allowEmpty && !draft.trim()}
              onClick={commit}
            >
              <Check size={13} />
            </button>
            <button
              aria-label={`${name} 取消${label}编辑`}
              title="取消"
              onClick={() => setEditing(false)}
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <code title={value || "未配置项目路径"}>
              {value || "未配置项目路径"}
            </code>
            <button
              aria-label={`${name} 编辑${label}`}
              title="编辑"
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
            >
              <Pencil size={13} />
            </button>
            {reset && (
              <button
                aria-label={`${name} 恢复默认${label}`}
                title="恢复默认"
                onClick={reset}
              >
                <RotateCcw size={13} />
              </button>
            )}
          </>
        )}
      </div>
      {picking && (
        <AgentDirectoryPicker
          value={draft}
          close={() => setPicking(false)}
          choose={(path) => {
            setDraft(path);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
