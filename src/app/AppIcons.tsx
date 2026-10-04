import { useId } from "react";
import { type IconName } from "./shell-presentation";

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h10M18 6h2" />
        <circle cx="16" cy="6" r="2" />
        <path d="M4 12h3M11 12h9" />
        <circle cx="9" cy="12" r="2" />
        <path d="M4 18h10M18 18h2" />
        <circle cx="16" cy="18" r="2" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Z" />
        <path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" />
      </>
    ),
    folder: (
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z" />
    ),
    history: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 5v5h5" />
        <path d="M12 8v4l2.7 1.7" />
      </>
    ),
    settings: (
      <>
        <path d="M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14.9-3L3 11" />
        <path d="M3 5v6h6M4 13a8 8 0 0 0 14.9 3L21 13" />
        <path d="M21 19v-6h-6" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5-3.4 8.1-8 10-4.6-1.9-8-5-8-10V6l8-3Z" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    warning: (
      <>
        <path d="M12 4 21 20H3L12 4Z" />
        <path d="M12 10v4M12 17h.01" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6zM14 3v5h5" />
        <path d="M9 13h6M9 17h6" />
      </>
    ),
    edit: (
      <>
        <path d="m4 16-.8 4.8L8 20l11.5-11.5a2.1 2.1 0 0 0-3-3L4 16Z" />
        <path d="m14.5 7.5 3 3" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6M20 4 11 13M18 13v6H4V5h6" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 5 5" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    link: (
      <>
        <path d="m9 15 6-6" />
        <path d="M7.5 17.5 6 19a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0" />
        <path d="m16.5 6.5 1.5-1.5a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    "eye-off": (
      <>
        <path d="m3 3 18 18" />
        <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3.1 3.8M6.2 6.8C3.9 8.4 2.5 12 2.5 12s3.5 6 9.5 6c1 0 1.9-.2 2.7-.5" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ),
  };
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function BrandGlyph({ size = 28 }: { size?: number }) {
  const gradientId = useId();

  return (
    <svg
      className="brand-glyph"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" y1="8" x2="55" y2="57">
          <stop offset="0" stopColor="#168bff" />
          <stop offset="0.52" stopColor="#4f8dff" />
          <stop offset="1" stopColor="#42d9b1" />
        </linearGradient>
      </defs>
      <path className="brand-glyph-rail" d="M32 12v14M15 48l12-9M49 48l-12-9" />
      <path
        className="brand-glyph-flow"
        d="M32 10v16M13 49l14-10M51 49 37 39"
        stroke={`url(#${gradientId})`}
      />
      <circle className="brand-glyph-node top" cx="32" cy="9" r="6" />
      <circle className="brand-glyph-node left" cx="12" cy="50" r="6" />
      <circle className="brand-glyph-node right" cx="52" cy="50" r="6" />
      <circle className="brand-glyph-hub-ring" cx="32" cy="34" r="11" />
      <circle className="brand-glyph-hub" cx="32" cy="34" r="6" />
      <circle className="brand-glyph-core" cx="32" cy="34" r="2.3" />
    </svg>
  );
}
