import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ContextSourceMenu, type ContextSource } from "./ContextSourceMenu";
import type { PreviewModel } from "../usePreviewWorkspace";
import {
  addAnnotation,
  formatAnnotations,
  annotationsForPage,
  type PreviewTab,
} from "../shared/session";
import { readContextFiles, type ContextInput } from "../shared/contextFiles";

export function ContextAdder({
  model,
  disabled,
  onAdded,
  onBusyChange,
  workspacePath,
}: {
  model: PreviewModel;
  disabled: boolean;
  onAdded: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
  workspacePath?: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const pendingPage = useRef<PreviewTab | undefined>(undefined);
  const mounted = useRef(true);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const append = (page: PreviewTab, inputs: ContextInput[]) => {
    if (!mounted.current) return;
    const notes = inputs.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      tabId: page.id,
      revision: page.revision,
      note: "",
    }));
    model.setSession((previous) => {
      if (previous.activeId !== page.id) throw Error("PREVIEW_CONTEXT_CHANGED");
      const next = notes.reduce(addAnnotation, previous);
      if (
        new TextEncoder().encode(
          formatAnnotations(page, annotationsForPage(next, page.id)),
        ).length >
        256 * 1024
      )
        throw Error("PREVIEW_CONTEXT_FILE_LIMIT");
      return next;
    });
    if (notes.length) onAdded(notes.at(-1)!.id);
  };
  const load = async (
    page: PreviewTab,
    read: () => Promise<ContextInput[]>,
  ) => {
    setLoading(true);
    onBusyChange(true);
    try {
      const values = await read();
      if (!mounted.current) return;
      await model.verifyContext(page.id, page.revision);
      append(page, values);
    } catch (error) {
      if (mounted.current) model.report(error);
    } finally {
      if (mounted.current) {
        setLoading(false);
        onBusyChange(false);
      }
    }
  };
  const sources: ContextSource[] = model.session.tabs.flatMap((tab) => {
    const doc = model.documents[tab.id];
    if (tab.id === model.active?.id && !doc) return [];
    const source: ContextSource = {
      id: tab.id,
      title: tab.title,
      description: doc?.path ?? tab.address,
      kind: doc ? "file" : "page",
      load: async () => {
        const metadata = `Source: ${doc?.path ?? tab.address}\nRevision: ${tab.revision}`;
        const content = doc?.content ?? "";
        return {
          selector: tab.title,
          text:
            new TextEncoder().encode(content).length <= 64 * 1024
              ? `${metadata}\n\n${content}`
              : metadata,
          contextKind: "file",
        };
      },
    };
    return [source];
  });
  if (workspacePath)
    sources.unshift({
      id: "workspace",
      title: t("preview.workspaceFolder"),
      description: workspacePath,
      kind: "folder",
      load: async () => ({
        selector: t("preview.workspaceFolder"),
        text: `Folder: ${workspacePath}`,
        contextKind: "file",
      }),
    });
  return (
    <>
      <ContextSourceMenu
        disabled={
          disabled || loading || !model.active || model.notes.length >= 20
        }
        sources={sources}
        onChoose={(source) => {
          if (model.active)
            void load(model.active, async () => [await source.load()]);
        }}
        onFiles={() => {
          pendingPage.current = model.active;
          input.current?.click();
        }}
      />
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/png,image/jpeg,image/webp,text/*,.md,.mdx,.json,.jsonl,.log,.csv,.yaml,.yml,.toml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.rs,.py,.sh,.sql,.ini,.conf"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          const page = pendingPage.current;
          if (!page || !files.length) return;
          if (model.notes.length + files.length > 20) {
            model.report(Error("PREVIEW_ANNOTATION_LIMIT"));
            return;
          }
          void load(page, () => readContextFiles(files));
        }}
      />
    </>
  );
}
