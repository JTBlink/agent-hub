import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../../../components/ThemedSelect";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import { previewApi, type CookieImportSummary } from "../api";
type Source = "paste" | "json" | "netscape" | "firefox" | "browser";
export function CookieImportPanel({
  pageId,
  revision,
  address,
  onError,
  onImported,
}: {
  pageId?: string;
  revision?: string;
  address: string;
  onError: (error: unknown) => void;
  onImported: (count: number, profile: string) => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>("paste");
  const [text, setText] = useState("");
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:9222");
  const [preview, setPreview] = useState<CookieImportSummary | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [syncUA, setSyncUA] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const previewId = preview?.id;
  useEffect(
    () => () => {
      if (previewId)
        void previewApi.cancelCookieImport(previewId).catch(() => {});
    },
    [previewId],
  );
  useEffect(() => {
    generation.current += 1;
    return () => {
      generation.current += 1;
    };
  }, [pageId, revision, address]);
  const reset = () => {
    generation.current += 1;
    setPreview(null);
    setSelected([]);
  };
  const inspect = async () => {
    if (!pageId || !revision) return;
    setBusy(true);
    const epoch = generation.current;
    try {
      const result =
        source === "paste"
          ? await previewApi.prepareCookies(pageId, revision, text)
          : source === "browser"
            ? await previewApi.browserCookies(pageId, revision, endpoint)
            : await previewApi.cookieFile(pageId, revision, source);
      if (!result) return;
      if (epoch !== generation.current) {
        void previewApi.cancelCookieImport(result.id).catch(() => {});
        return;
      }
      setPreview(result);
      setSyncUA(false);
      if (result.replace_supported === false) setReplace(false);
      setSelected(Object.keys(result.domains));
    } catch (error) {
      if (epoch === generation.current) onError(error);
    } finally {
      setBusy(false);
    }
  };
  const stale =
    !!preview &&
    (preview.target.id !== pageId ||
      preview.target.revision !== revision ||
      preview.target.url !== address);
  const apply = async () => {
    if (!preview || stale || busy) return;
    setBusy(true);
    try {
      const result = preview.source_user_agent
        ? await previewApi.applyCookies(preview.id, selected, replace, syncUA)
        : await previewApi.applyCookies(preview.id, selected, replace);
      onImported(result.imported, preview.target.profile_name);
      setText("");
      setPreview(null);
    } catch (error) {
      setPreview(null);
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label={t("preview.cookies")}>
      <h3>{t("preview.cookies")}</h3>
      <p>{t("preview.cookieImportHint")}</p>
      {(!pageId || !revision) && (
        <p role="status">{t("preview.cookieNeedsPage")}</p>
      )}
      <ThemedSelect
        aria-label={t("preview.cookieSource")}
        value={source}
        disabled={busy}
        onChange={(event) => {
          const value = event.target.value;
          if (
            value === "paste" ||
            value === "json" ||
            value === "netscape" ||
            value === "firefox" ||
            value === "browser"
          ) {
            reset();
            setSource(value);
          }
        }}
      >
        <option value="paste">{t("preview.cookiePaste")}</option>
        <option value="json">{t("preview.cookieJsonFile")}</option>
        <option value="netscape">{t("preview.cookieNetscape")}</option>
        <option value="firefox">{t("preview.cookieFirefox")}</option>
        <option value="browser">{t("preview.cookieBrowser")}</option>
      </ThemedSelect>
      {source === "paste" ? (
        <textarea
          disabled={busy}
          aria-label={t("preview.cookieJson")}
          rows={4}
          value={text}
          maxLength={2 * 1024 * 1024}
          onChange={(event) => {
            reset();
            setText(event.target.value);
          }}
        />
      ) : source === "browser" ? (
        <label>
          {t("preview.cookieBrowserEndpoint")}
          <input
            disabled={busy}
            value={endpoint}
            onChange={(event) => {
              reset();
              setEndpoint(event.target.value);
            }}
          />
          <span className="text-muted">{t("preview.cookieBrowserHint")}</span>
        </label>
      ) : source === "firefox" ? (
        <p>{t("preview.cookieFirefoxHint")}</p>
      ) : null}
      <button
        className="app-button-ghost"
        disabled={
          busy || !pageId || !revision || (source === "paste" && !text.trim())
        }
        onClick={() => void inspect()}
      >
        {busy
          ? t("common.loading")
          : source === "paste" || source === "browser"
            ? t("preview.inspectImport")
            : t("preview.chooseCookieFile")}
      </button>
      {preview && (
        <div className="preview-import-confirm">
          <p>
            {t("preview.cookieTarget", {
              profile: preview.target.profile_name,
              title: preview.target.title,
            })}
          </p>
          <p className="break-all">{preview.target.url}</p>
          <p>
            {t("preview.cookieCounts", {
              total: preview.total,
              count: preview.importable,
            })}
          </p>
          {!!(
            preview.skipped.invalid +
            preview.skipped.expired +
            preview.skipped.partitioned +
            preview.skipped.bound
          ) && <p>{t("preview.cookieSkipped", preview.skipped)}</p>}
          <p>{t("preview.importDomains")}</p>
          <button
            disabled={busy}
            onClick={() => setSelected(Object.keys(preview.domains))}
          >
            {t("preview.selectAllSites")}
          </button>
          <button disabled={busy} onClick={() => setSelected([])}>
            {t("preview.clearSites")}
          </button>
          <div className="max-h-52 overflow-y-auto">
            {Object.entries(preview.domains).map(([domain, count]) => (
              <label key={domain} className="preview-toggle-row">
                <span className="min-w-0 break-all">
                  {domain} ({count})
                </span>
                <ToggleSwitch
                  title={domain}
                  checked={selected.includes(domain)}
                  disabled={busy}
                  onChange={() =>
                    setSelected((previous) =>
                      previous.includes(domain)
                        ? previous.filter((value) => value !== domain)
                        : [...previous, domain],
                    )
                  }
                />
              </label>
            ))}
          </div>
          <ThemedSelect
            aria-label={t("preview.cookieImportMode")}
            disabled={busy}
            value={replace ? "replace" : "merge"}
            onChange={(event) => setReplace(event.target.value === "replace")}
          >
            <option value="merge">{t("preview.cookieMerge")}</option>
            <option
              value="replace"
              disabled={preview.replace_supported === false}
            >
              {t("preview.cookieReplace")}
            </option>
          </ThemedSelect>
          <p>
            {t(
              replace ? "preview.cookieReplaceHint" : "preview.cookieMergeHint",
            )}
          </p>
          {preview.source_user_agent && (
            <label>
              <ToggleSwitch
                checked={syncUA}
                onChange={() => setSyncUA((value) => !value)}
                disabled={busy}
              />
              <span>{t("preview.syncSourceUA")}</span>
              <code className="break-all">{preview.source_user_agent}</code>
            </label>
          )}
          {stale && <p role="status">{t("preview.pageChanged")}</p>}
          <button
            className="app-button-primary"
            disabled={busy || stale || !selected.length}
            onClick={() => void apply()}
          >
            {busy ? t("common.loading") : t("preview.importCookies")}
          </button>
          <button disabled={busy} onClick={reset}>
            {t("common.cancel")}
          </button>
        </div>
      )}
    </section>
  );
}
