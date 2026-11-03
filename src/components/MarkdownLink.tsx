import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  invertLinkDestination,
  isWebLink,
  openWebLink,
} from "../lib/openWebLink";
import { cn } from "../utils";
export function MarkdownLink({
  href,
  className,
  title,
  children,
  webOnly = false,
}: {
  href?: string;
  className?: string;
  title?: string;
  children?: ReactNode;
  webOnly?: boolean;
}) {
  const { t } = useTranslation();
  const safeHref =
    href && !/^(javascript|vbscript|data):/i.test(href.trim())
      ? href
      : undefined;
  const classes = cn(
    "text-accent-light underline decoration-accent-border underline-offset-4",
    className,
  );
  if (webOnly && (!safeHref || !isWebLink(safeHref)))
    return <span className={classes}>{children}</span>;
  return (
    <a
      className={classes}
      href={safeHref}
      title={title}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        if (safeHref && isWebLink(safeHref)) {
          event.preventDefault();
          void openWebLink(safeHref, {
            invert: invertLinkDestination(event),
          }).catch(() => toast.error(t("preview.openLinkFailed")));
        }
      }}
    >
      {children}
    </a>
  );
}
