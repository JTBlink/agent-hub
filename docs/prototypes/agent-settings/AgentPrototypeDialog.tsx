// Dialog interactions only; this prototype never reads or writes local folders.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Folder, X } from "lucide-react";
export function AgentPrototypeDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="ap-dialog"
      aria-label={title}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <header>
        <h3>{title}</h3>
        <button type="button" aria-label="关闭对话框" onClick={close}>
          <X size={16} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function AgentDirectoryPicker({
  value,
  close,
  choose,
}: {
  value: string;
  close: () => void;
  choose: (path: string) => void;
}) {
  const [selected, setSelected] = useState(value);
  const folders = [
    ...new Set(
      [value, "~/skills", "~/projects/demo/.agents/skills"].filter(Boolean),
    ),
  ];
  return (
    <AgentPrototypeDialog title="选择文件夹" close={close}>
      <p className="ap-dialog-help">演示目录，不访问本机文件。</p>
      <div className="ap-folder-list">
        {folders.map((path) => (
          <button
            type="button"
            key={path}
            className={selected === path ? "selected" : ""}
            onClick={() => setSelected(path)}
          >
            <Folder size={15} />
            {path}
          </button>
        ))}
      </div>
      <label className="ap-dialog-path">
        文件夹路径
        <input
          autoFocus
          aria-label="文件夹路径"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        />
      </label>
      <footer>
        <button type="button" onClick={close}>
          取消
        </button>
        <button
          type="button"
          className="ap-primary"
          disabled={!selected.trim()}
          onClick={() => choose(selected.trim())}
        >
          选择此文件夹
        </button>
      </footer>
    </AgentPrototypeDialog>
  );
}
