import { useEffect, useEffectEvent } from "react";
import type { PreviewDocument } from "../api";
import {
  consumePreviewRequests,
  type PreviewOpenRequest,
} from "./openRequests";

export function usePreviewOpenRequests(
  isolated: boolean,
  handlers: {
    openWeb: (address: string, profile?: string) => void;
    acceptDocument: (document: PreviewDocument) => void;
    report: (error: unknown) => void;
  },
) {
  const receive = useEffectEvent((value: PreviewOpenRequest) => {
    try {
      if (value.kind === "web") handlers.openWeb(value.address, value.profile);
      else handlers.acceptDocument(value.document);
    } catch (error) {
      handlers.report(error);
    }
  });
  useEffect(
    () =>
      isolated ? undefined : consumePreviewRequests((value) => receive(value)),
    [isolated],
  );
}
