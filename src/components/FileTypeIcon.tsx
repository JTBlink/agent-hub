import {
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileJson2,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Settings2,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../utils";

/** Shared file-type presentation for the explorer, readers, tabs and Git changes. */
function presentation(path: string): { Icon: LucideIcon; color: string } {
  const name = path.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase() ?? "";
  if (
    /^(\.?(gitignore|gitattributes|editorconfig|env)(\..*)?|dockerfile|makefile)$/.test(
      name,
    )
  )
    return { Icon: Settings2, color: "text-muted" };
  const extension = name.split(".").at(-1);
  switch (extension) {
    case "json":
    case "jsonc":
    case "json5":
      return { Icon: FileJson2, color: "text-warning" };
    case "md":
    case "markdown":
    case "txt":
    case "rst":
      return { Icon: FileText, color: "text-accent-light" };
    case "py":
    case "sh":
    case "bash":
    case "zsh":
    case "ps1":
    case "bat":
      return { Icon: Terminal, color: "text-warning" };
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "rs":
    case "go":
    case "c":
    case "h":
    case "cpp":
    case "java":
    case "swift":
      return { Icon: FileCode2, color: "text-accent-light" };
    case "css":
    case "scss":
    case "html":
    case "vue":
    case "svelte":
      return { Icon: FileCode2, color: "text-[var(--color-brand-violet)]" };
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "xml":
      return { Icon: Settings2, color: "text-muted" };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "ico":
      return { Icon: FileImage, color: "text-[var(--color-brand-violet)]" };
    case "zip":
    case "gz":
    case "tar":
    case "7z":
      return { Icon: FileArchive, color: "text-warning" };
    default:
      return { Icon: File, color: "text-muted" };
  }
}

export function FileTypeIcon({
  path,
  directory = false,
  open = false,
  symlink = false,
  size = 14,
  className,
}: {
  path: string;
  directory?: boolean;
  open?: boolean;
  symlink?: boolean;
  size?: number;
  className?: string;
}) {
  const { Icon, color } = symlink
    ? { Icon: Link2, color: "text-muted" }
    : directory
      ? { Icon: open ? FolderOpen : Folder, color: "text-muted" }
      : presentation(path);
  return (
    <Icon
      aria-hidden="true"
      size={size}
      className={cn("shrink-0", color, className)}
    />
  );
}
