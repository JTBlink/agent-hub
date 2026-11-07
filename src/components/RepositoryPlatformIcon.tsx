import { FolderGit2 } from "lucide-react";
import { taskPlatforms } from "@app/platforms";
import type { TaskProvider } from "../lib/taskBrowserApi";

/** Render registered platform icons, with one default for unidentified repositories. */
export function RepositoryPlatformIcon({
  providers,
  fallbackLabel,
}: {
  providers: readonly TaskProvider[];
  fallbackLabel: string;
}) {
  const platforms = taskPlatforms.filter((platform) =>
    providers.includes(platform.id),
  );
  if (!platforms.length)
    return (
      <FolderGit2
        size={14}
        className="shrink-0 text-muted"
        role="img"
        aria-label={fallbackLabel}
      />
    );
  const label = platforms.map((platform) => platform.label).join(" / ");
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1"
      role="img"
      aria-label={label}
      title={label}
    >
      {platforms.map((platform) => (
        <platform.icon
          key={platform.id}
          className="h-4 w-4"
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
