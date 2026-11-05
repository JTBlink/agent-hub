import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy } from "lucide-react";
import type {
  AgentDeliveryAdapter,
  AgentDeliveryPage,
  AgentDeliveryPlan,
} from "../../../lib/agentDelivery";
import { previewError } from "../shared/previewError";

/** Resolve commands only while expanded; obsolete results never become copyable. */
export function DeliveryCommandPreview({
  adapter,
  workspacePath,
  page,
  agentId,
  text,
  images,
  preparePrompt,
}: {
  adapter: AgentDeliveryAdapter;
  workspacePath: string;
  page: AgentDeliveryPage;
  agentId: string;
  text: string;
  images: string[];
  preparePrompt: () => Promise<string>;
}) {
  const { t } = useTranslation();
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<{
    plan?: AgentDeliveryPlan;
    error?: unknown;
    copied?: boolean;
    text?: string;
    images?: string[];
  }>({});
  const load = useEffectEvent(async () => {
    const prompt = await preparePrompt();
    return adapter.preview!(workspacePath, page, prompt, agentId || undefined);
  });
  const plan =
    state.text === text && state.images === images ? state.plan : undefined;
  useEffect(() => {
    let disposed = false;
    const timer = setTimeout(() => {
      void load().then(
        (plan) => {
          if (!disposed) setState({ plan, text, images });
        },
        (error: unknown) => {
          if (!disposed) setState({ error });
        },
      );
    }, 300);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [
    adapter,
    workspacePath,
    page.id,
    page.path,
    page.projectId,
    page.title,
    agentId,
    text,
    images,
    generation,
  ]);
  const copy = async () => {
    if (!plan) return;
    try {
      await writeText(plan.command);
      setState((current) => ({ ...current, copied: true }));
    } catch (error) {
      setState((current) => ({ ...current, error }));
    }
  };
  return (
    <section className="preview-delivery-command">
      <h3>{t("preview.deliveryCommand")}</h3>
      {plan ? (
        <>
          <p>
            {plan.agent} ·{" "}
            {plan.backend === "herdr" ? "Herdr" : t("preview.nativeTerminal")}
          </p>
          {plan.createsWorkspace && <p>{t("preview.newHerdrCommandHint")}</p>}
          {plan.backend === "native" && <p>{t("preview.nativeCommandHint")}</p>}
          <pre>{plan.command}</pre>
          <button type="button" onClick={() => void copy()}>
            <Copy size={13} />
            {t(state.copied ? "preview.copied" : "preview.copyCommand")}
          </button>
        </>
      ) : (
        !state.error && <p role="status">{t("common.loading")}</p>
      )}
      <button
        type="button"
        onClick={() => {
          setState({});
          setGeneration((value) => value + 1);
        }}
      >
        {t("common.refresh")}
      </button>
      {state.error ? <p role="alert">{previewError(state.error, t)}</p> : null}
    </section>
  );
}
