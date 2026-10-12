import { Bot, Braces, FolderCode, Layers } from "lucide-react";

/** Decorative skill-to-workspace illustration; it does not represent live state. */
export function DashboardLibraryArt() {
  return (
    <span className="dashboard-library-art" aria-hidden="true">
      <svg
        className="dashboard-art-connections"
        viewBox="0 0 240 180"
        fill="none"
      >
        <circle
          cx="120"
          cy="90"
          r="67"
          stroke="currentColor"
          strokeDasharray="3 7"
          opacity=".25"
        />
        <path
          d="M118 91 48 39M118 91 195 42M118 91 198 143"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity=".4"
        />
        <circle cx="80" cy="64" r="3" fill="currentColor" />
        <circle cx="164" cy="63" r="3" fill="currentColor" />
        <circle cx="162" cy="120" r="3" fill="currentColor" />
      </svg>
      <span className="dashboard-art-stack dashboard-art-stack-back" />
      <span className="dashboard-art-stack dashboard-art-stack-middle" />
      <span className="dashboard-art-stack dashboard-art-stack-front">
        <Layers strokeWidth={1.4} />
      </span>
      <span className="dashboard-art-node dashboard-art-code">
        <Braces strokeWidth={1.6} />
      </span>
      <span className="dashboard-art-node dashboard-art-agent">
        <Bot strokeWidth={1.6} />
      </span>
      <span className="dashboard-art-node dashboard-art-project">
        <FolderCode strokeWidth={1.6} />
      </span>
    </span>
  );
}
