import { Cpu, Chrome, VenetianMask } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../../../components/ThemedSelect";
import type { BrowserProfile } from "../api";
import type { PreviewTab } from "../shared/session";
function profileIcon(value: string) {
  const Icon =
    value === "native" ? Cpu : value === "guest" ? VenetianMask : Chrome;
  return <Icon size={16} className="shrink-0" aria-hidden="true" />;
}

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
      : profile.id === "default" && profile.name === "Default"
        ? t("preview.defaultProfile")
        : profile.name;
  const profileHint = (profile: string) =>
    profile === "native"
      ? t("preview.nativeModeHint")
      : profile === "guest" ||
          availableProfiles.find((item) => item.id === profile)?.ephemeral
        ? t("preview.guestModeHint")
        : t("preview.chromiumModeHint");
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
      aria-label={t("preview.browsingMode")}
      value={active?.profile ?? "default"}
      disabled={!active || active.kind === "markdown"}
      className="preview-profile-select"
      title={`${t("preview.browsingMode")} · ${selectedName}
${profileHint(active?.profile ?? "default")}
${t("preview.profileNewTabHint")}`}
      leadingIcon={profileIcon(active?.profile ?? "default")}
      renderValue={() => selectedName}
      optionIcon={profileIcon}
      fitContent
      singleLineOptions
      onChange={(event) => {
        if (active && event.target.value !== active.profile)
          onOpen(active.address, event.target.value);
      }}
    >
      <option value="native" title={profileHint("native")}>
        {t("preview.nativeBackend")}
      </option>
      {availableProfiles.map((profile) => (
        <option
          key={profile.id}
          value={profile.id}
          disabled={profile.deleting}
          title={profileHint(profile.id)}
        >
          {profileName(profile)}
        </option>
      ))}
    </ThemedSelect>
  );
}
