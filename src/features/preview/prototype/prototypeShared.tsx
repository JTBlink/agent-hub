import type { ReactNode } from "react";
import type { PreviewTab } from "./fixtures";
import { FileText, FileCode2, Globe } from "lucide-react";
export function Button({
  children,
  label,
  active,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`pv-icon ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function KindIcon({ kind }: { kind: PreviewTab["kind"] }) {
  return kind === "markdown" ? (
    <FileText size={15} />
  ) : kind === "html" ? (
    <FileCode2 size={15} />
  ) : (
    <Globe size={15} />
  );
}
