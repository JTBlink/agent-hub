import { useState } from "react";
import { Columns2, Rows2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ImageSource } from "./api";
import { ImagePreview } from "./ImagePreview";

export function ImageComparison({
  original,
  modified,
  active = true,
}: {
  active?: boolean;
  original: { source: ImageSource; label: string };
  modified: { source: ImageSource; label: string };
}) {
  const { t } = useTranslation();
  const [split, setSplit] = useState(true);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1 text-xs">
        <span
          title={modified.source.path}
          className="min-w-0 flex-1 truncate text-muted"
        >
          {modified.source.path}
        </span>
        <button
          type="button"
          className="app-button-ghost p-1"
          aria-label={t("imagePreview.sideBySide")}
          title={t("imagePreview.sideBySide")}
          aria-pressed={split}
          onClick={() => setSplit(true)}
        >
          <Columns2 size={15} />
        </button>
        <button
          type="button"
          className="app-button-ghost p-1"
          aria-label={t("imagePreview.stacked")}
          title={t("imagePreview.stacked")}
          aria-pressed={!split}
          onClick={() => setSplit(false)}
        >
          <Rows2 size={15} />
        </button>
      </div>
      <div
        className={
          split
            ? "flex min-h-0 min-w-0 flex-1 divide-x divide-border-subtle"
            : "flex min-h-0 flex-1 flex-col divide-y divide-border-subtle overflow-auto"
        }
      >
        <div className={split ? "flex min-w-0 flex-1" : "flex min-h-80 flex-1"}>
          <ImagePreview
            active={active}
            key={JSON.stringify(original.source)}
            {...original}
          />
        </div>
        <div className={split ? "flex min-w-0 flex-1" : "flex min-h-80 flex-1"}>
          <ImagePreview
            active={active}
            key={JSON.stringify(modified.source)}
            {...modified}
          />
        </div>
      </div>
    </div>
  );
}
