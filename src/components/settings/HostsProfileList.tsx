import { FolderOpen, Search } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HostsProfile, HostsSnapshot } from "../../lib/hostsApi";
import { SidebarActivationControl } from "../SidebarActivationControl";
import { SidebarItemName } from "../SidebarItemName";
import { SidebarListItem } from "../SidebarListItem";
import { SidebarListPanel } from "../SidebarListPanel";
import { appliedHostsProfile } from "./hostsPresentation";
import { fieldClass } from "./settingsStyles";

interface Props {
  profiles: HostsProfile[];
  system: HostsSnapshot | null;
  selected: string | null;
  busy: boolean;
  applyDisabled: boolean;
  onApply: (profile: HostsProfile) => void;
  onSelect: (profile: HostsProfile) => void;
  onRename: (profile: HostsProfile, name: string) => Promise<boolean>;
  onCopy: (profile: HostsProfile) => void;
  onRemove: (profile: HostsProfile) => void;
}
export function HostsProfileList({
  profiles,
  system,
  selected,
  busy,
  applyDisabled,
  onApply,
  onSelect,
  onRename,
  onCopy,
  onRemove,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const appliedId = appliedHostsProfile(profiles, system)?.id;
  const visible = profiles.filter((p) =>
    p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <SidebarListPanel
      title={t("hosts.profiles")}
      count={profiles.length}
      toolbar={
        <label className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted"
          />
          <input
            aria-label={t("hosts.search")}
            placeholder={t("hosts.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${fieldClass} w-full py-1.5 pl-7 text-xs`}
          />
        </label>
      }
      footer={
        <p className="flex items-start gap-1.5">
          <FolderOpen className="mt-0.5 h-3 w-3 shrink-0" />
          {t("hosts.libraryHint")}
        </p>
      }
    >
      {visible.map((profile) => (
        <HostsProfileRow
          key={profile.id}
          profile={profile}
          selected={selected === profile.id}
          applied={profile.id === appliedId}
          busy={busy}
          applyDisabled={applyDisabled}
          onApply={onApply}
          onSelect={onSelect}
          onRename={onRename}
          onCopy={onCopy}
          onRemove={onRemove}
        />
      ))}
      {!visible.length && (
        <p className="py-5 text-xs leading-relaxed text-muted">
          {t(profiles.length ? "hosts.noMatches" : "hosts.emptyProfiles")}
        </p>
      )}
    </SidebarListPanel>
  );
}

function HostsProfileRow({
  profile,
  selected,
  applied,
  busy,
  applyDisabled,
  onApply,
  onSelect,
  onRename,
  onCopy,
  onRemove,
}: Pick<
  Props,
  | "busy"
  | "applyDisabled"
  | "onApply"
  | "onSelect"
  | "onRename"
  | "onCopy"
  | "onRemove"
> & {
  profile: HostsProfile;
  selected: boolean;
  applied: boolean;
}) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  return (
    <SidebarListItem
      ref={row}
      label={profile.name}
      selected={selected}
      actions={
        <SidebarActivationControl
          active={applied}
          disabled={applyDisabled}
          label={t("hosts.useProfile", { name: profile.name })}
          activeLabel={t("hosts.currentlyApplied")}
          onActivate={() => onApply(profile)}
        />
      }
    >
      <SidebarItemName
        name={profile.name}
        inputLabel={t("hosts.profileName")}
        selected={selected}
        disabled={busy}
        contextTarget={row}
        onSelect={() => onSelect(profile)}
        onRename={(name) => onRename(profile, name)}
        copy={{ onSelect: () => onCopy(profile) }}
        remove={{ onSelect: () => onRemove(profile) }}
      />
    </SidebarListItem>
  );
}
