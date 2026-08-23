import type { ReactNode } from "react";

type PageNavigationProps = {
  title: ReactNode;
  backLabel: string;
  onBack: () => void;
  eyebrow?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  titleId?: string;
  titleTabIndex?: number;
  className?: string;
};

function BackIcon() {
  return (
    <svg
      className="page-navigation-back-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function PageNavigation({
  title,
  backLabel,
  onBack,
  eyebrow,
  description,
  leading,
  actions,
  titleId,
  titleTabIndex,
  className,
}: PageNavigationProps) {
  return (
    <header className={`page-navigation${className ? ` ${className}` : ""}`}>
      <button
        className="button button-ghost page-navigation-back"
        type="button"
        onClick={onBack}
      >
        <BackIcon />
        {backLabel}
      </button>
      <div className="page-navigation-main">
        {leading && <div className="page-navigation-leading">{leading}</div>}
        <div className="page-navigation-copy">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 id={titleId} tabIndex={titleTabIndex}>
            {title}
          </h1>
          {description && (
            <p className="page-navigation-description">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="page-navigation-actions">{actions}</div>}
    </header>
  );
}
