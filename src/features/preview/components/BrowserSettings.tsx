import { LinkRoutingSettings } from "./LinkRoutingSettings";
import { CookieImportPanel } from "./CookieImportPanel";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import { resetDeletedProfile } from "../shared/session";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { previewApi, type BrowserProfile } from "../api";
import type { PreviewModel } from "../usePreviewWorkspace";
import { ThemedSelect } from "../../../components/ThemedSelect";
const emptyProfile = (): BrowserProfile => ({
  id: crypto.randomUUID(),
  name: "",
  executable: "",
  endpoint: "",
  proxy: "",
  ephemeral: false,
});
export function BrowserSettings({
  model,
}: {
  model: Pick<
    PreviewModel,
    | "active"
    | "info"
    | "pageId"
    | "report"
    | "searchEngine"
    | "setInfo"
    | "setNotice"
    | "setPanelOpen"
    | "setSearchEngine"
    | "setSession"
    | "setViewport"
    | "viewport"
  > & { native?: boolean };
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<BrowserProfile>(emptyProfile);
  const [deleting, setDeleting] = useState<BrowserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await previewApi.profile({
        ...profile,
        executable: profile.executable || null,
        endpoint: profile.endpoint || null,
        proxy: profile.proxy || null,
        remote_transfer_target: profile.endpoint
          ? profile.remote_transfer_target || null
          : null,
        remote_download_directory: profile.endpoint
          ? profile.remote_download_directory || null
          : null,
      });
      model.setInfo(await previewApi.info());
      model.setNotice(t("preview.saved"));
      setProfile(emptyProfile());
    } catch (error) {
      model.report(error);
    } finally {
      setBusy(false);
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
        <LinkRoutingSettings onError={model.report} />
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
        <button disabled={busy} onClick={() => setProfile(emptyProfile())}>
          {t("preview.newProfile")}
        </button>
        <p>{t("preview.profileHint")}</p>
        {model.info?.profiles.map((item) => (
          <button
            className="preview-profile-row"
            key={item.id}
            onClick={() => setProfile(item)}
          >
            <strong>
              {item.id === "guest" && item.name === "Guest"
                ? t("preview.guestProfile")
                : item.name}
              {item.deleting ? ` · ${t("preview.profileDeletionPending")}` : ""}
              {item.ephemeral ? ` · ${t("preview.temporaryProfile")}` : ""}
            </strong>
            <small>
              {item.endpoint
                ? t("preview.remoteStream")
                : item.proxy
                  ? t("preview.proxyNetwork")
                  : t("preview.localBrowser")}
            </small>
          </button>
        ))}
        <fieldset disabled={busy || profile.deleting}>
          <label className="preview-toggle-row">
            <span>{t("preview.temporaryProfile")}</span>
            <ToggleSwitch
              checked={!!profile.ephemeral}
              disabled={busy || profile.id === "guest"}
              title={t("preview.temporaryProfile")}
              onChange={() =>
                setProfile({ ...profile, ephemeral: !profile.ephemeral })
              }
            />
          </label>
          <p>{t("preview.guestHint")}</p>
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
            {t("preview.renderChoice")}
            <ThemedSelect
              value={profile.endpoint ? "server" : "client"}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  endpoint:
                    event.target.value === "server"
                      ? profile.endpoint || "http://127.0.0.1:9222"
                      : "",
                })
              }
            >
              <option value="client">
                {t("preview.renderLocation.client")}
              </option>
              <option value="server">
                {t("preview.renderLocation.server")}
              </option>
            </ThemedSelect>
          </label>
          <p>{t("preview.executionChoiceHint")}</p>
          <label>
            {t("preview.runtimePath")}
            <input
              placeholder={model.info?.executable ?? t("preview.autoDetect")}
              disabled={!!profile.endpoint}
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
          {profile.endpoint && (
            <label>
              {t("preview.remoteDownloadDirectory")}
              <input
                value={profile.remote_download_directory ?? ""}
                placeholder="/srv/downloads"
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    remote_download_directory: event.target.value,
                  })
                }
              />
              <small className="text-xs leading-5 text-muted">
                {t("preview.remoteDownloadDirectoryHint")}
              </small>
            </label>
          )}
          {profile.endpoint && (
            <label>
              {t("preview.remoteTransferTarget")}
              <input
                value={profile.remote_transfer_target ?? ""}
                placeholder="browser-host"
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    remote_transfer_target: event.target.value,
                  })
                }
              />
              <small className="text-xs leading-5 text-muted">
                {t("preview.remoteTransferTargetHint")}
              </small>
            </label>
          )}
          <label>
            {t("preview.networkChoice")}
            <ThemedSelect
              value={profile.proxy ? "proxy" : "host"}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  proxy:
                    event.target.value === "proxy"
                      ? profile.proxy || "socks5://127.0.0.1:1080"
                      : "",
                })
              }
            >
              <option value="host">
                {t(
                  profile.endpoint
                    ? "preview.networkLocation.server_default"
                    : "preview.networkLocation.client_default",
                )}
              </option>
              <option value="proxy">
                {t("preview.networkLocation.proxy")}
              </option>
            </ThemedSelect>
          </label>
          <p>{t("preview.proxyChoiceHint")}</p>
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
        </fieldset>
        {profile.id !== "default" &&
          profile.id !== "guest" &&
          model.info?.profiles.some((item) => item.id === profile.id) && (
            <button
              className="text-danger"
              disabled={busy}
              onClick={() => setDeleting(profile)}
            >
              {t(
                profile.deleting
                  ? "preview.retryProfileDeletion"
                  : "preview.deleteProfile",
              )}
            </button>
          )}
        <p>{t("preview.profileCloseHint")}</p>
        <hr />
        <CookieImportPanel
          pageId={model.pageId}
          address={model.active?.address ?? ""}
          revision={model.active?.revision}
          onError={model.report}
          onImported={(count, profile) =>
            model.setNotice(
              t("preview.cookieImportedCount", { count, profile }),
            )
          }
        />
        <hr />
        <h3>{t("preview.viewport")}</h3>
        {model.native && <p>{t("preview.nativeViewportHint")}</p>}
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
      <ConfirmDialog
        open={deleting !== null}
        title={t("preview.deleteProfile")}
        message={t("preview.deleteProfileMessage", { name: deleting?.name })}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return false;
          try {
            await previewApi.deleteProfile(deleting.id);
            model.setInfo(await previewApi.info());
            model.setSession((previous) =>
              resetDeletedProfile(previous, deleting.id),
            );
            setProfile(emptyProfile());
            setDeleting(null);
            model.setNotice(t("preview.profileDeleted"));
          } catch (error) {
            model.report(error);
            try {
              const info = await previewApi.info();
              model.setInfo(info);
              setProfile(
                info.profiles.find((profile) => profile.id === deleting.id) ??
                  emptyProfile(),
              );
            } catch {
              /* Preserve the selected configuration when status cannot be verified. */
            }
            return false;
          }
        }}
      />
    </aside>
  );
}
