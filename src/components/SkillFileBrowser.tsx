import { useEffect, useRef, useState } from "react";
import { FileText, FileCode, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import {
  getSkillFiles,
  readSkillFile,
  type SkillDocument,
  type SkillFileContent,
  type SkillFileEntry,
} from "../lib/tauri";
import { SkillMarkdown } from "./SkillMarkdown";

interface SkillFileBrowserProps {
  skillId: string;
  initialDoc: SkillDocument;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isMarkdown(path: string): boolean {
  return /\.md$/i.test(path);
}

function fileIcon(path: string) {
  return isMarkdown(path) ? FileText : FileCode;
}

function makeInitialContent(skillId: string, doc: SkillDocument): SkillFileContent {
  return {
    skill_id: skillId,
    relative_path: doc.filename,
    content_kind: "text",
    content: doc.content,
  };
}

export function SkillFileBrowser({
  skillId,
  initialDoc,
  className,
}: SkillFileBrowserProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<SkillFileEntry[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>(
    initialDoc.filename,
  );
  const [fileContent, setFileContent] = useState<SkillFileContent>(
    () => makeInitialContent(skillId, initialDoc),
  );
  const [loadingContent, setLoadingContent] = useState(false);
  const cacheRef = useRef(new Map<string, SkillFileContent>());
  const requestIdRef = useRef(0);

  useEffect(() => {
    const initial = makeInitialContent(skillId, initialDoc);
    cacheRef.current = new Map();
    cacheRef.current.set(initialDoc.filename, initial);
    setSelectedFile(initialDoc.filename);
    setFileContent(initial);
    setFiles(null);

    getSkillFiles(skillId)
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [skillId, initialDoc]);

  useEffect(() => {
    const cached = cacheRef.current.get(selectedFile);
    if (cached) {
      setFileContent(cached);
      setLoadingContent(false);
      return;
    }

    requestIdRef.current += 1;
    const id = requestIdRef.current;
    setLoadingContent(true);
    readSkillFile(skillId, selectedFile)
      .then((result) => {
        if (id !== requestIdRef.current) return;
        cacheRef.current.set(selectedFile, result);
        setFileContent(result);
      })
      .catch(() => {
        if (id !== requestIdRef.current) return;
        setFileContent({
          skill_id: skillId,
          relative_path: selectedFile,
          content_kind: "text",
          content: null,
        });
      })
      .finally(() => {
        if (id === requestIdRef.current) setLoadingContent(false);
      });
  }, [skillId, selectedFile]);

  const showPicker = files !== null && files.length > 1;

  const groups = showPicker ? groupByDirectory(files!) : [];

  return (
    <div className={className}>
      {showPicker && (
        <div className="mb-4 max-h-32 overflow-y-auto">
          <div className="flex flex-wrap gap-1">
            {groups.map((group) => (
              <div key={group.dir} className="flex flex-wrap items-center gap-1">
                {group.dir && (
                  <span className="ml-1 mr-0.5 text-[11px] text-faint">
                    {group.dir}/
                  </span>
                )}
                {group.files.map((entry) => {
                  const Icon = fileIcon(entry.relative_path);
                  const name = entry.relative_path.split("/").pop() ?? entry.relative_path;
                  return (
                    <button
                      key={entry.relative_path}
                      type="button"
                      onClick={() => setSelectedFile(entry.relative_path)}
                      title={entry.relative_path}
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] transition-colors",
                        selectedFile === entry.relative_path
                          ? "bg-accent text-white"
                          : "bg-surface-hover text-secondary hover:text-primary",
                      )}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      {name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingContent ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : fileContent.content_kind === "binary" ? (
        <div className="rounded-xl border border-border-subtle bg-bg-secondary px-4 py-6 text-center text-[13px] text-muted">
          {t("mySkills.fileBrowser.binary")}
        </div>
      ) : fileContent.content_kind === "too_large" ? (
        <div className="rounded-xl border border-border-subtle bg-bg-secondary px-4 py-6 text-center text-[13px] text-muted">
          {t("mySkills.fileBrowser.tooLarge", {
            size: formatSize(
              files?.find((f) => f.relative_path === selectedFile)?.size ?? 0,
            ),
          })}
        </div>
      ) : fileContent.content != null ? (
        isMarkdown(selectedFile) ? (
          <SkillMarkdown content={fileContent.content} />
        ) : (
          <pre className="overflow-x-auto rounded-xl border border-border-subtle bg-background px-4 py-3 font-mono text-[13px] leading-6 text-secondary">
            {fileContent.content}
          </pre>
        )
      ) : (
        <div className="mt-12 text-center text-[13px] text-muted">
          {t("mySkills.fileBrowser.loadFailed")}
        </div>
      )}
    </div>
  );
}

interface FileGroup {
  dir: string;
  files: SkillFileEntry[];
}

function groupByDirectory(files: SkillFileEntry[]): FileGroup[] {
  const map = new Map<string, SkillFileEntry[]>();
  for (const file of files) {
    const slash = file.relative_path.lastIndexOf("/");
    const dir = slash === -1 ? "" : file.relative_path.slice(0, slash);
    const list = map.get(dir) ?? [];
    list.push(file);
    map.set(dir, list);
  }
  const groups: FileGroup[] = [];
  for (const [dir, dirFiles] of map) {
    groups.push({ dir, files: dirFiles });
  }
  groups.sort((a, b) => {
    if (a.dir === "" && b.dir !== "") return -1;
    if (a.dir !== "" && b.dir === "") return 1;
    return a.dir.localeCompare(b.dir);
  });
  return groups;
}
