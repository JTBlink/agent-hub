import { useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import { cn } from "../utils";

interface Props {
  included: boolean;
  groupName?: string;
  skillName: string;
  onChange: () => Promise<void>;
}

export function SkillGroupMembershipButton({
  included,
  groupName,
  skillName,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const label = t(
    included ? "mySkills.membership.remove" : "mySkills.membership.add",
  );
  const description = groupName
    ? t(
        included
          ? "mySkills.membership.removeNamed"
          : "mySkills.membership.addNamed",
        { group: groupName, skill: skillName },
      )
    : t("mySkills.membership.chooseGroup");
  const Icon = saving ? Loader2 : included ? Minus : Plus;

  return (
    <button
      type="button"
      disabled={!groupName || saving}
      aria-label={description}
      aria-busy={saving || undefined}
      title={description}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50",
        included
          ? "border-border-subtle text-muted hover:border-border hover:bg-surface-hover hover:text-secondary"
          : "border-accent/25 bg-accent/10 text-accent hover:bg-accent/15",
      )}
      onClick={async (event) => {
        event.stopPropagation();
        if (pending.current || !groupName) return;
        pending.current = true;
        setSaving(true);
        try {
          await onChange();
        } catch (error) {
          toast.error(getErrorMessage(error, t("common.error")));
        } finally {
          pending.current = false;
          setSaving(false);
        }
      }}
    >
      <Icon className={cn("h-3 w-3", saving && "animate-spin")} />
      {label}
    </button>
  );
}
