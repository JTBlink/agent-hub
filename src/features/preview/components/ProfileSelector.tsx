import { UserRound } from "lucide-react";
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
  const availableProfiles = profiles ?? [
    { id: "default", name: t("preview.defaultProfile") },
  ];
  const profileName = (profile: { id: string; name: string }) =>
    profile.id === "guest" && profile.name === "Guest"
      ? t("preview.guestProfile")
      : profile.name;
  const selected = availableProfiles.find(
    (profile) => profile.id === (active?.profile ?? "default"),
  );
  const selectedName =
    active?.profile === "native"
      ? t("preview.nativeBackend")
      : selected
        ? profileName(selected)
        : t("preview.defaultProfile");
  return (
    <ThemedSelect
      aria-label={t("preview.profiles")}
      value={active?.profile ?? "default"}
      disabled={!active || active.kind === "markdown"}
      className="preview-profile-select"
      title={`${t("preview.profiles")} · ${selectedName}
${t("preview.profileNewTabHint")}`}
      renderValue={() => <UserRound size={16} aria-hidden="true" />}
      onChange={(event) => {
        if (active && event.target.value !== active.profile)
          onOpen(active.address, event.target.value);
      }}
    >
      <option value="native">{t("preview.nativeBackend")}</option>
      {availableProfiles.map((profile) => (
        <option key={profile.id} value={profile.id} disabled={profile.deleting}>
          {profileName(profile)}
        </option>
      ))}
    </ThemedSelect>
  );
}
