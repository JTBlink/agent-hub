/** Text supplied by the host. Paths identify files within this reader. */
export interface ReaderFile {
  path: string;
  content: string;
}

export interface FileReaderProps {
  files: readonly ReaderFile[];
  initialPath?: string;
  /** Omit for read-only access. The host owns drafts and persistence. */
  onContentChange?: (path: string, content: string) => void;
  /** Open the selected file's local version. Hosts resolve paths and own I/O. */
  onOpenInVscode?: (path: string) => Promise<void>;
  /** Optional explanation when the external editor opens a preview copy. */
  openInVscodeHint?: string;
  /** Optional constraint supplied by the host's storage contract. */
  maxLength?: number;
}
