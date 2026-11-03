import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewModel } from "../usePreviewWorkspace";
export function BrowserTools({ model }: { model: PreviewModel }) {
  const { t } = useTranslation();
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const result = await model.action({
      kind: "evaluate",
      expression: command,
    });
    if (result !== undefined) setOutput(JSON.stringify(result, null, 2));
    setBusy(false);
  };
  return (
    <aside className="preview-inspector">
      <header>
        <h2>{t("preview.developerTools")}</h2>
        <button
          aria-label={t("common.close")}
          onClick={() => model.setPanelOpen(false)}
        >
          ×
        </button>
      </header>
      <div className="preview-inspector-scroll">
        <h3>{t("preview.pageConsole")}</h3>
        <textarea
          rows={4}
          aria-label={t("preview.pageConsole")}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="document.title"
        />
        <button
          className="app-button-primary"
          disabled={!model.pageId || busy || !command.trim()}
          onClick={() => void run()}
        >
          {t("preview.evaluate")}
        </button>
        <pre className="preview-tool-output">{output}</pre>
        <div className="preview-tool-actions">
          <button
            disabled={!model.pageId || busy}
            onClick={async () => {
              const result = await model.action({ kind: "snapshot" });
              setOutput(JSON.stringify(result, null, 2));
            }}
          >
            {t("preview.snapshot")}
          </button>
          <button
            disabled={!model.pageId || busy}
            onClick={async () => {
              const result = await model.action({ kind: "cookies" });
              setOutput(JSON.stringify(result, null, 2));
            }}
          >
            {t("preview.cookies")}
          </button>
          <button
            disabled={!model.pageId || busy}
            onClick={async () => {
              const result = await model.action({ kind: "storage" });
              setOutput(JSON.stringify(result, null, 2));
            }}
          >
            {t("preview.storage")}
          </button>
        </div>
        <h3>{t("preview.pageEvents")}</h3>
        <div className="preview-event-list">
          {(model.active ? (model.events[model.active.id] ?? []) : [])
            .filter(
              (event) =>
                event.method.startsWith("Network.request") ||
                event.method.startsWith("Runtime.console") ||
                event.method === "Runtime.exceptionThrown",
            )
            .slice(-50)
            .reverse()
            .map((event, index) => (
              <details key={index}>
                <summary>{event.method}</summary>
                <pre>{JSON.stringify(event.params, null, 2)}</pre>
              </details>
            ))}
        </div>
      </div>
    </aside>
  );
}
