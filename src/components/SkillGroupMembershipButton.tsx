import { useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
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
  const description = groupName
    ? t(
        included
          ? "mySkills.membership.removeNamed"
          : "mySkills.membership.addNamed",
        { group: groupName, skill: skillName },
      )
    : t("mySkills.membership.chooseGroup");
  const Icon = saving ? Loader2 : included ? Check : Plus;

  return (
    <button
      type="button"
      disabled={!groupName || saving}
      aria-label={description}
      aria-pressed={included}
      aria-busy={saving || undefined}
      title={description}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50",
        included
          ? "border-accent/25 bg-accent/10 text-accent hover:bg-accent/15"
          : "border-border-subtle text-muted hover:border-border hover:bg-surface-hover hover:text-secondary",
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
      <Icon
        aria-hidden="true"
        className={cn("h-4 w-4", saving && "animate-spin")}
      />
    </button>
  );
}
