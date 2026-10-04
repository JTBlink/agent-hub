import { useCallback, useEffect, useRef, useState } from "react";
import { openSkillsManager } from "../lib/skills-module";
import { useLanguage } from "../lib/i18n";

/** The independent Skills module is the only Skill management UI. */
export function SkillsModulePage() {
  const { t } = useLanguage();
  const started = useRef(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);
  const open = useCallback(async () => {
    setOpening(true);
    setError(false);
    try {
      await openSkillsManager();
    } catch {
      setError(true);
    } finally {
      setOpening(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
  }, [open]);

  return (
    <section className="page" aria-labelledby="skills-module-title">
      <div className="surface-card">
        <p className="eyebrow">Skills Manager</p>
        <h1 id="skills-module-title">{t("skills")}</h1>
        <p>{t("skillsModuleDescription")}</p>
        {error && <p role="alert">{t("skillsModuleLaunchFailed")}</p>}
        <button
          className="button button-primary"
          disabled={opening}
          onClick={() => void open()}
        >
          {opening ? t("openingSkillsManager") : t("openSkillsManager")}
        </button>
      </div>
    </section>
  );
}
