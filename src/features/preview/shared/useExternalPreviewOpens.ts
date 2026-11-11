import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { previewApi } from "../api";
import { getErrorMessage } from "../../../lib/error";
import {
  listenWorkspaceEvent,
  workspaceWindowLabel,
} from "../../../lib/workspaceWindow";
import { queuePreviewDocument } from "./openRequests";

/** Subscribe before draining so CLI requests survive desktop initialization. */
export function useExternalPreviewOpens() {
  const { t } = useTranslation();
  useEffect(() => {
    if (!isTauri() || workspaceWindowLabel() !== "main") return;
    let disposed = false;
    let running = false;
    let again = false;
    const report = (error: unknown) => {
      if (!disposed) toast.error(getErrorMessage(error, t("common.error")));
    };
    const drain = async () => {
      if (disposed) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const documents = await previewApi.takeExternalDocuments();
          for (const document of documents) {
            if (disposed)
              await previewApi.closeDocument(document.id).catch(() => {});
            else queuePreviewDocument(document);
          }
        } while (again && !disposed);
      } catch (error) {
        report(error);
      } finally {
        running = false;
      }
    };
    const subscription = listenWorkspaceEvent("preview-open-file", () => {
      void drain();
    });
    void subscription
      .then(() => {
        if (!disposed) return drain();
      })
      .catch(report);
    return () => {
      disposed = true;
      void subscription.then((unlisten) => unlisten()).catch(report);
    };
  }, [t]);
}
