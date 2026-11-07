import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDialog } from "../../components/AppDialog";
import type { ImageSource } from "./api";
import { ImageSurface } from "./ImageSurface";
import { useImagePreview } from "./useImagePreview";

interface Props {
  source: ImageSource;
  label?: string;
  active?: boolean;
}

/** Hidden tabs unmount the loader and release image buffers, while their tab metadata survives. */
export function ImagePreview({ active = true, ...props }: Props) {
  return active ? (
    <LoadedImagePreview key={JSON.stringify(props.source)} {...props} />
  ) : null;
}

function LoadedImagePreview({ source, label }: Props) {
  const { t } = useTranslation();
  const { image, error, reload } = useImagePreview(source);
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      aria-label={label ?? source.path}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-secondary px-3 py-1 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate" title={source.path}>
          {label ?? source.path}
        </span>
        <button
          type="button"
          className="app-button-ghost p-1"
          aria-label={t("settings.refresh")}
          title={t("settings.refresh")}
          onClick={reload}
        >
          <RefreshCw size={13} />
        </button>
      </div>
      {error ? (
        <div role="alert" className="break-words p-6 text-xs text-danger">
          {t("imagePreview.failed")}
          <p>{error}</p>
          <button
            type="button"
            className="app-button-ghost mt-2"
            onClick={reload}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : image === undefined ? (
        <p role="status" className="p-6 text-xs text-muted">
          {t("common.loading")}
        </p>
      ) : image === null ? (
        <p role="status" className="p-6 text-xs text-muted">
          {t("imagePreview.absent")}
        </p>
      ) : (
        <ImageSurface
          key={image.url}
          image={image}
          path={source.path}
          onExpand={() => setExpanded(true)}
        />
      )}
      {expanded && image && (
        <AppDialog
          title={source.path}
          onClose={() => setExpanded(false)}
          className="flex h-[calc(80vh/var(--app-scale))] max-w-none flex-col overflow-hidden"
        >
          <ImageSurface key={image.url} image={image} path={source.path} />
        </AppDialog>
      )}
    </section>
  );
}
