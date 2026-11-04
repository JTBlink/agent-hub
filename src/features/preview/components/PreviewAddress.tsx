import { FileText, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PreviewAddress({
  value,
  sourcePath,
  showingSource,
  onToggle,
  onChange,
  onNavigate,
}: {
  value: string;
  sourcePath?: string;
  showingSource: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const toggleLabel = t(
    showingSource ? "preview.showPreviewUrl" : "preview.showSourcePath",
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!showingSource) onNavigate();
      }}
    >
      {sourcePath ? (
        <button
          type="button"
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-pressed={showingSource}
          onClick={onToggle}
        >
          {showingSource ? <FileText size={14} /> : <Globe size={14} />}
        </button>
      ) : (
        <Globe size={14} />
      )}
      <input
        data-preview-address
        aria-label={t("preview.address")}
        title={value}
        value={value}
        readOnly={showingSource}
        placeholder={t("preview.addressPlaceholder")}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
      />
    </form>
  );
}
