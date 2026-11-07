import { useEffect, useState } from "react";
import { getErrorMessage } from "../../lib/error";
import { readProjectImage, type ImageData, type ImageSource } from "./api";

/** Each mounted source owns one Blob URL, shared with its popup and revoked on replacement. */
export function useImagePreview(source: ImageSource) {
  const key = JSON.stringify(source);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    image?: ImageData | null;
    error?: string;
  }>();
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    const load = async () => {
      try {
        const blob = await readProjectImage(JSON.parse(key));
        if (cancelled) return;
        const image = blob
          ? { url: URL.createObjectURL(blob), bytes: blob.size }
          : null;
        url = image?.url;
        setResult({ key, image });
      } catch (cause) {
        if (!cancelled) setResult({ key, error: getErrorMessage(cause, "") });
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, attempt]);
  useEffect(() => {
    if (source.revision === "commit" || source.revision === "parent") return;
    // Coalesce the Git + saved events emitted by a single operation.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setResult(undefined);
        setAttempt((value) => value + 1);
      }, 100);
    };
    window.addEventListener("project-git-changed", refresh);
    window.addEventListener("worktree-file-saved", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("project-git-changed", refresh);
      window.removeEventListener("worktree-file-saved", refresh);
    };
  }, [source.revision]);
  return {
    ...(result?.key === key ? result : {}),
    reload: () => {
      setResult(undefined);
      setAttempt((value) => value + 1);
    },
  };
}
