import { useState } from "react";
import { useTranslation } from "react-i18next";
import { previewApi, type BrowserProfile } from "../api";
import type { PreviewModel } from "../usePreviewWorkspace";
import { ThemedSelect } from "../../../components/ThemedSelect";
export function BrowserSettings({ model }: { model: PreviewModel }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<BrowserProfile>({
    id: crypto.randomUUID(),
    name: "",
    executable: "",
    endpoint: "",
    proxy: "",
  });
  const [busy, setBusy] = useState(false);
  const [cookieText, setCookieText] = useState("");
  const [cookiePreview, setCookiePreview] = useState<{
    cookies: unknown[];
    domains: string[];
    pageId?: string;
    revision?: string;
  } | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      await previewApi.profile({
        ...profile,
        executable: profile.executable || null,
        endpoint: profile.endpoint || null,
        proxy: profile.proxy || null,
      });
      model.setInfo(await previewApi.info());
      model.setNotice(t("preview.saved"));
      setProfile({
        id: crypto.randomUUID(),
        name: "",
        executable: "",
        endpoint: "",
        proxy: "",
      });
    } catch (error) {
      model.report(error);
    } finally {
      setBusy(false);
    }
  };
  const inspectCookies = () => {
    try {
      const parsed: unknown = JSON.parse(cookieText);
      if (!Array.isArray(parsed) || parsed.length > 2000)
        throw new Error(t("preview.invalidCookies"));
      const domains = Array.from(
        new Set(
          parsed.map((item: unknown) => {
            if (
              !item ||
              typeof item !== "object" ||
              !("name" in item) ||
              !("value" in item) ||
              !("domain" in item) ||
              typeof item.domain !== "string"
            )
              throw new Error(t("preview.invalidCookies"));
            return item.domain;
          }),
        ),
      );
      setCookiePreview({
        cookies: parsed,
        domains,
        pageId: model.pageId,
        revision: model.active?.revision,
      });
    } catch (error) {
      model.report(error);
    }
  };
  return (
    <aside className="preview-inspector">
      <header>
        <h2>{t("preview.settings")}</h2>
        <button
          onClick={() => model.setPanelOpen(false)}
          aria-label={t("common.close")}
        >
          ×
        </button>
      </header>
      <div className="preview-inspector-scroll">
        <h3>{t("preview.searchEngine")}</h3>
        <ThemedSelect
          value={model.searchEngine}
          onChange={(event) => {
            const value = event.target.value;
            if (
              value === "bing" ||
              value === "google" ||
              value === "duckduckgo"
            )
              model.setSearchEngine(value);
          }}
        >
          <option value="bing">Bing</option>
          <option value="google">Google</option>
          <option value="duckduckgo">DuckDuckGo</option>
        </ThemedSelect>
        <h3>{t("preview.profiles")}</h3>
        <p>{t("preview.profileHint")}</p>
        {model.info?.profiles.map((item) => (
          <button
            className="preview-profile-row"
            key={item.id}
            onClick={() => setProfile(item)}
          >
            <strong>{item.name}</strong>
            <small>
              {item.endpoint
                ? t("preview.remoteStream")
                : item.proxy
                  ? t("preview.proxyNetwork")
                  : t("preview.localBrowser")}
            </small>
          </button>
        ))}
        <label>
          {t("preview.profileName")}
          <input
            value={profile.name}
            onChange={(event) =>
              setProfile({ ...profile, name: event.target.value })
            }
          />
        </label>
        <label>
          {t("preview.runtimePath")}
          <input
            placeholder={model.info?.executable ?? t("preview.autoDetect")}
            value={profile.executable ?? ""}
            onChange={(event) =>
              setProfile({ ...profile, executable: event.target.value })
            }
          />
        </label>
        <label>
          {t("preview.remoteEndpoint")}
          <input
            placeholder="http://127.0.0.1:9222"
            value={profile.endpoint ?? ""}
            onChange={(event) =>
              setProfile({ ...profile, endpoint: event.target.value })
            }
          />
        </label>
        <p>{t("preview.remoteHint")}</p>
        <label>
          {t("preview.proxy")}
          <input
            placeholder="socks5://127.0.0.1:1080"
            value={profile.proxy ?? ""}
            onChange={(event) =>
              setProfile({ ...profile, proxy: event.target.value })
            }
          />
        </label>
        <button
          className="app-button-primary"
          disabled={busy || !profile.name.trim()}
          onClick={() => void save()}
        >
          {t("common.save")}
        </button>
        <p>{t("preview.profileCloseHint")}</p>
        <hr />
        <h3>{t("preview.cookies")}</h3>
        <p>{t("preview.cookieHint")}</p>
        <textarea
          rows={4}
          aria-label={t("preview.cookies")}
          value={cookieText}
          onChange={(event) => {
            setCookieText(event.target.value);
            setCookiePreview(null);
          }}
          maxLength={2 * 1024 * 1024}
        />
        <button
          className="app-button-ghost"
          disabled={!model.pageId || !cookieText.trim()}
          onClick={inspectCookies}
        >
          {t("preview.inspectImport")}
        </button>
        {cookiePreview && (
          <div className="preview-import-confirm">
            <p>{t("preview.importDomains")}</p>
            <pre>{cookiePreview.domains.join("\n")}</pre>
            <button
              className="app-button-primary"
              disabled={
                busy ||
                cookiePreview.pageId !== model.pageId ||
                cookiePreview.revision !== model.active?.revision
              }
              onClick={async () => {
                if (
                  !model.pageId ||
                  cookiePreview.pageId !== model.pageId ||
                  cookiePreview.revision !== model.active?.revision
                )
                  return;
                setBusy(true);
                try {
                  await previewApi.action(model.pageId, {
                    kind: "import_cookies",
                    cookies: cookiePreview.cookies,
                  });
                  setCookiePreview(null);
                  setCookieText("");
                  model.setNotice(t("preview.imported"));
                } catch (error) {
                  model.report(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("preview.importCookies")}
            </button>
          </div>
        )}
        <hr />
        <h3>{t("preview.viewport")}</h3>
        <ThemedSelect
          value={model.viewport ? String(model.viewport.width) : "auto"}
          onChange={(event) => {
            const width = Number(event.target.value);
            model.setViewport(
              width
                ? {
                    width,
                    height: width === 390 ? 844 : 900,
                    mobile: width === 390,
                  }
                : null,
            );
          }}
        >
          <option value="auto">{t("preview.adaptive")}</option>
          <option value="390">390 × 844</option>
          <option value="768">768 × 900</option>
          <option value="1280">1280 × 900</option>
        </ThemedSelect>
        <div className="preview-size-inputs">
          <label>
            {t("preview.width")}
            <input
              type="number"
              min={240}
              max={3840}
              value={model.viewport?.width ?? 1200}
              onChange={(event) =>
                model.setViewport({
                  width: Number(event.target.value),
                  height: model.viewport?.height ?? 800,
                  mobile: false,
                })
              }
            />
          </label>
          <label>
            {t("preview.height")}
            <input
              type="number"
              min={200}
              max={2160}
              value={model.viewport?.height ?? 800}
              onChange={(event) =>
                model.setViewport({
                  width: model.viewport?.width ?? 1200,
                  height: Number(event.target.value),
                  mobile: false,
                })
              }
            />
          </label>
        </div>
      </div>
    </aside>
  );
}
