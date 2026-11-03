import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../../../components/ThemedSelect";
import type { BrowserProfile } from "../api";
import type { PreviewTab } from "../shared/session";
/** Choosing another execution profile creates a tab and preserves the existing page. */
export function ProfileSelector({
  active,
  profiles,
  onOpen,
}: {
  active?: PreviewTab;
  profiles?: BrowserProfile[];
  onOpen: (address: string, profile: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ThemedSelect
      aria-label={t("preview.profiles")}
      value={active?.profile ?? "default"}
      disabled={!active || active.kind === "markdown"}
      title={t("preview.profileNewTabHint")}
      onChange={(event) => {
        if (active && event.target.value !== active.profile)
          onOpen(active.address, event.target.value);
      }}
    >
      {(profiles ?? [{ id: "default", name: t("preview.defaultProfile") }]).map(
        (profile) => (
          <option
            key={profile.id}
            value={profile.id}
            disabled={profile.deleting}
          >
            {profile.id === "guest" && profile.name === "Guest"
              ? t("preview.guestProfile")
              : profile.name}
          </option>
        ),
      )}
    </ThemedSelect>
  );
}
