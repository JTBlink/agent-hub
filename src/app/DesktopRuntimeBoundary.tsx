import type { ReactNode } from "react";
import { Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Browser previews must not mount providers that require the desktop IPC bridge. */
export function DesktopRuntimeBoundary({
  desktop,
  children,
}: {
  desktop: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (desktop) return children;
  return (
    <main className="flex h-full items-center justify-center overflow-auto bg-background p-6 text-primary">
      <section
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-card"
        aria-labelledby="desktop-runtime-title"
      >
        <Monitor
          size={28}
          className="mb-4 text-accent-light"
          aria-hidden="true"
        />
        <h1 id="desktop-runtime-title" className="text-xl font-semibold">
          {t("desktopRuntime.title")}
        </h1>
        <p className="mt-3 leading-relaxed text-secondary">
          {t("desktopRuntime.description")}
        </p>
        <p className="mt-2 leading-relaxed text-muted">
          {t("desktopRuntime.hint")}
        </p>
        {import.meta.env.DEV && (
          <a
            className="app-button-secondary mt-5 inline-flex"
            href="/docs/prototypes/"
          >
            {t("desktopRuntime.prototypes")}
          </a>
        )}
      </section>
    </main>
  );
}
