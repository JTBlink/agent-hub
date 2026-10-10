import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Command,
  ExternalLink,
  FolderTree,
  Globe,
  Keyboard,
  Layers3,
  Map,
  MessageCircle,
  RefreshCw,
  Rocket,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PROJECT_URL, FEEDBACK_URL } from "../lib/distribution";

const GUIDE_ICONS = [
  Map,
  Layers3,
  BookOpen,
  Sparkles,
  Globe,
  FolderTree,
  RefreshCw,
  Settings2,
];

const GUIDE_KEYS = [
  "workflows",
  "skillGroups",
  "install",
  "sync",
  "global",
  "projects",
  "backup",
  "settings",
] as const;

const FEATURE_ICONS = [Layers3, Zap, RefreshCw, FolderTree, Command];

const FEATURE_KEYS = [
  "multiAgent",
  "skillGroupSwitch",
  "gitBackup",
  "projectWorkspace",
  "commandPalette",
] as const;

const SHORTCUT_KEYS = ["commandPalette", "settings", "refresh"] as const;

const FAQ_KEYS = [
  "installFail",
  "multiDevice",
  "customAgent",
  "skillConflict",
] as const;

function FaqItem({
  questionKey,
  answerKey,
}: {
  questionKey: string;
  answerKey: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-accent" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        )}
        <span className="text-[13px] font-semibold text-secondary">
          {t(questionKey)}
        </span>
      </button>
      {open && (
        <div className="border-t border-border-subtle px-4 py-3 pl-11">
          <p className="text-[13px] leading-5 text-muted">{t(answerKey)}</p>
        </div>
      )}
    </div>
  );
}

export function Help() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="app-page app-page-narrow">
      {/* Header */}
      <div className="app-page-header">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("common.back")}
        </button>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-faint">
          {t("help.eyebrow")}
        </p>
        <h1 className="app-page-title mt-1">{t("help.pageTitle")}</h1>
        <p className="app-page-subtitle text-tertiary">
          {t("help.pageDescription")}
        </p>
      </div>

      {/* Quick Start */}
      <section className="space-y-3">
        <h2 className="text-[14px] font-semibold text-primary">
          {t("help.quickStart")}
        </h2>
        <p className="text-[13px] text-muted">{t("help.description")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {GUIDE_KEYS.map((key, index) => {
            const Icon = GUIDE_ICONS[index];
            return (
              <div
                key={key}
                className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background text-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-secondary">
                    {t(`help.items.${key}.title`)}
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-muted">
                    {t(`help.items.${key}.description`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section className="space-y-3">
        <h2 className="text-[14px] font-semibold text-primary">
          {t("help.features")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map((key, index) => {
            const Icon = FEATURE_ICONS[index];
            return (
              <div
                key={key}
                className="rounded-2xl border border-border-subtle bg-surface px-4 py-4"
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-[13px] font-semibold text-secondary">
                  {t(`help.featureItems.${key}.title`)}
                </h3>
                <p className="mt-1 text-[13px] leading-5 text-muted">
                  {t(`help.featureItems.${key}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="space-y-3">
        <h2 className="text-[14px] font-semibold text-primary">
          <Keyboard className="mr-1.5 inline-block h-4 w-4 align-text-bottom" />
          {t("help.shortcuts")}
        </h2>
        <div className="app-panel divide-y divide-border-subtle">
          {SHORTCUT_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-[13px] text-secondary">
                {t(`help.shortcutItems.${key}.label`)}
              </span>
              <kbd className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[12px] text-muted">
                {t(`help.shortcutItems.${key}.keys`)}
              </kbd>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-3">
        <h2 className="text-[14px] font-semibold text-primary">
          {t("help.faq")}
        </h2>
        <div className="space-y-2">
          {FAQ_KEYS.map((key) => (
            <FaqItem
              key={key}
              questionKey={`help.faqItems.${key}.question`}
              answerKey={`help.faqItems.${key}.answer`}
            />
          ))}
        </div>
      </section>

      {/* Feedback & Support */}
      <section className="space-y-3">
        <h2 className="text-[14px] font-semibold text-primary">
          <MessageCircle className="mr-1.5 inline-block h-4 w-4 align-text-bottom" />
          {t("help.feedback")}
        </h2>
        <p className="text-[13px] text-muted">
          {t("help.feedbackDescription")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              openUrl(FEEDBACK_URL).catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-1.5 text-[13px] font-medium text-secondary transition hover:bg-surface-active"
          >
            <Rocket className="h-3.5 w-3.5" />
            {t("help.reportIssue")}
            <ExternalLink className="h-3 w-3 text-muted" />
          </button>
          <button
            type="button"
            onClick={() => {
              openUrl(PROJECT_URL).catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-1.5 text-[13px] font-medium text-secondary transition hover:bg-surface-active"
          >
            <Globe className="h-3.5 w-3.5" />
            GitHub
            <ExternalLink className="h-3 w-3 text-muted" />
          </button>
        </div>
      </section>
    </div>
  );
}
