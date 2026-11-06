import { Check, FolderOpen, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { HostsProfile, HostsSnapshot } from "../../lib/hostsApi";
import { appliedHostsProfile } from "./hostsPresentation";
import { actionButtonClass, fieldClass } from "./settingsStyles";

interface Props {
  profiles: HostsProfile[];
  system: HostsSnapshot | null;
  selected: string | null;
  busy: boolean;
  onSelect: (profile: HostsProfile) => void;
  onCreate: () => void;
}
export function HostsProfileList({
  profiles,
  system,
  selected,
  busy,
  onSelect,
  onCreate,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const appliedId = appliedHostsProfile(profiles, system)?.id;
  const visible = profiles.filter((p) =>
    p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <aside
      aria-label={t("hosts.profiles")}
      className="flex min-w-0 flex-col gap-2 border-b border-border-subtle bg-bg-secondary p-3 md:border-b-0 md:border-r"
    >
      <div className="flex items-center justify-between text-xs">
        <h3 className="font-semibold">{t("hosts.profiles")}</h3>
        <span className="text-muted">{profiles.length}</span>
      </div>
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
      <div className="max-h-72 overflow-y-auto md:max-h-[28rem]">
        {visible.map((profile) => {
          const applied = profile.id === appliedId;
          return (
            <div
              key={profile.id}
              className="border-b border-border-faint py-0.5 last:border-b-0"
            >
              <button
                type="button"
                disabled={busy}
                aria-pressed={selected === profile.id}
                onClick={() => onSelect(profile)}
                className={`flex w-full min-w-0 items-center gap-2 rounded border px-2 py-2.5 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-50 ${selected === profile.id ? "border-accent-border bg-accent-bg" : "border-transparent"}`}
              >
                <span
                  title={profile.name}
                  className="min-w-0 flex-1 truncate text-xs font-medium"
                >
                  {profile.name}
                </span>
                {applied && (
                  <span
                    role="img"
                    aria-label={t("hosts.currentlyApplied")}
                    title={t("hosts.currentlyApplied")}
                    className="shrink-0 text-success"
                  >
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            </div>
          );
        })}
        {!visible.length && (
          <p className="py-5 text-xs leading-relaxed text-muted">
            {t(profiles.length ? "hosts.noMatches" : "hosts.emptyProfiles")}
          </p>
        )}
      </div>
      <div className="border-t border-border-faint pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCreate}
          className={`${actionButtonClass} w-full justify-start text-xs`}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("hosts.newProfile")}
        </button>
      </div>
      <p className="mt-auto flex items-start gap-1.5 border-t border-border-faint pt-3 text-[10px] leading-relaxed text-muted">
        <FolderOpen className="mt-0.5 h-3 w-3 shrink-0" />
        {t("hosts.libraryHint")}
      </p>
    </aside>
  );
}
