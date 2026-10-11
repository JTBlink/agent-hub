import type { ReactNode } from "react";
import { FileText } from "lucide-react";

/** Reserve heading controls without letting them squeeze the skill name. */
export function ProjectSkillCardHeader({
  leading,
  title,
  fileCount,
  actions,
}: {
  leading: ReactNode;
  title: string;
  fileCount: number;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-2 px-3.5 pt-2.5 pb-1.5">
      <div className="flex h-4 w-4 shrink-0 items-center justify-center">
        {leading}
      </div>
      <h3
        className="min-w-0 flex-1 truncate text-[14px] font-semibold text-primary"
        title={title}
      >
        {title}
      </h3>
      <div className="flex shrink-0 items-center gap-2">
        {fileCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-faint">
            <FileText aria-hidden="true" className="h-3 w-3" />
            {fileCount}
          </span>
        )}
        {actions}
      </div>
    </div>
  );
}
