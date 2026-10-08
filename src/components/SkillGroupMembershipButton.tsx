import { useRef, useState } from "react";
import { Check, Loader2, Minus, Plus } from "lucide-react";
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

  return (
    <button
      type="button"
      disabled={!groupName || saving}
      aria-label={description}
      aria-pressed={included}
      aria-busy={saving || undefined}
      title={description}
      className="group/membership inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40"
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
      <span
        className={cn(
          "relative flex h-5 w-5 items-center justify-center rounded-md transition-[color,background-color,transform] duration-150 motion-reduce:transition-none group-enabled/membership:group-active/membership:scale-95",
          included
            ? "bg-accent-bg text-accent-light group-enabled/membership:group-hover/membership:bg-surface-active"
            : "text-faint group-enabled/membership:group-hover/membership:bg-accent-bg group-enabled/membership:group-hover/membership:text-accent-light",
        )}
        aria-hidden="true"
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
        ) : included ? (
          <>
            <Check
              strokeWidth={2.25}
              className="h-3 w-3 transition-opacity duration-150 motion-reduce:transition-none group-enabled/membership:group-hover/membership:opacity-0 group-enabled/membership:group-focus-visible/membership:opacity-0"
            />
            <Minus
              strokeWidth={2}
              className="absolute h-3 w-3 opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-enabled/membership:group-hover/membership:opacity-100 group-enabled/membership:group-focus-visible/membership:opacity-100"
            />
          </>
        ) : (
          <Plus strokeWidth={1.75} className="h-3 w-3" />
        )}
      </span>
    </button>
  );
}
