import { FileText, MousePointer2, Paperclip, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../../../components/CardActionMenu";
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
}: {
  model: PreviewModel;
  disabled: boolean;
  onAdded: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
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
      if (previous.activeId !== page.id)
        throw new Error("PREVIEW_CONTEXT_CHANGED");
      const next = notes.reduce(addAnnotation, previous);
      if (
        new TextEncoder().encode(
          formatAnnotations(page, annotationsForPage(next, page.id)),
        ).length >
        256 * 1024
      )
        throw new Error("PREVIEW_CONTEXT_FILE_LIMIT");
      return next;
    });
    if (notes.length === 1 && notes[0].contextKind === "text")
      onAdded(notes[0].id);
  };
  return (
    <>
      <CardActionMenu
        label={t("preview.addContext")}
        className="preview-add-context"
        triggerIcon={<Plus size={16} />}
        align="start"
        disabled={
          disabled || loading || !model.active || model.notes.length >= 20
        }
        actions={[
          {
            key: "element",
            label: t("preview.pickContext"),
            icon: <MousePointer2 size={14} />,
            disabled: model.source || (model.native && !model.pageId),
            onSelect: () => model.setPicking(true),
          },
          {
            key: "text",
            label: t("preview.addTextContext"),
            icon: <FileText size={14} />,
            onSelect: () => {
              if (!model.active) return;
              try {
                append(model.active, [
                  {
                    selector: t("preview.textContext"),
                    text: "",
                    contextKind: "text",
                  },
                ]);
              } catch (error) {
                model.report(error);
              }
            },
          },
          {
            key: "files",
            label: t("preview.addFileContext"),
            icon: <Paperclip size={14} />,
            onSelect: () => {
              pendingPage.current = model.active;
              input.current?.click();
            },
          },
        ]}
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
            model.report(new Error("PREVIEW_ANNOTATION_LIMIT"));
            return;
          }
          setLoading(true);
          onBusyChange(true);
          void (async () => {
            try {
              const inputs = await readContextFiles(files);
              if (!mounted.current) return;
              await model.verifyContext(page.id, page.revision);
              append(page, inputs);
            } catch (error) {
              if (mounted.current) model.report(error);
            } finally {
              if (mounted.current) {
                setLoading(false);
                onBusyChange(false);
              }
            }
          })();
        }}
      />
    </>
  );
}
