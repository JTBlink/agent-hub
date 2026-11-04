import { useBrowserTheme } from "./useBrowserTheme";
import { useEffect, useEffectEvent, useState } from "react";
import { previewApi } from "../api";
import { ChromiumSurface } from "./chromium/ChromiumSurface";
import { NativeSurface } from "./native/NativeSurface";
import type { BrowserSurfaceProps } from "./types";

/** Backend selection only. Each renderer owns its transport and lifecycle. */
export function BrowserSurface(props: BrowserSurfaceProps) {
  const theme = useBrowserTheme(props.address, props.onError);
  const ready = (id: string) => {
    theme.ready(id);
    props.onReady(id);
  };
  const frame = (value: import("../api").BrowserFrame) => {
    theme.frame(value);
    props.onFrame(value);
  };
  const location = (url: string) => {
    theme.location(url);
    props.onNativeLocation?.(url);
  };
  const [fallback, setFallback] = useState(false);
  const native = props.profile === "native" || fallback;
  const reportBackend = useEffectEvent(() =>
    props.onBackend?.(native ? "native" : "chromium"),
  );
  useEffect(() => {
    reportBackend();
  }, [native]);
  const unavailable = async () => {
    // A native fallback must not bypass an explicit proxy or remote execution policy.
    try {
      const info = await previewApi.info();
      const profile = info.profiles.find((item) => item.id === props.profile);
      if (
        profile &&
        !profile.proxy &&
        !profile.endpoint &&
        !profile.remote_transfer_target
      )
        setFallback(true);
    } catch {
      /* Keep the original actionable error when discovery cannot be verified. */
    }
  };
  return native ? (
    <NativeSurface
      active={props.active}
      address={props.address}
      onLocation={location}
      onNewTab={props.onNewTab}
      viewport={props.viewport}
      picking={props.picking}
      onReady={props.onReady}
      onThemeReady={theme.ready}
      onFrame={frame}
      onCapture={props.onCapture}
      onPickingChange={props.onPickingChange}
      onNavigation={props.onNativeNavigation}
      onError={props.onError}
    />
  ) : (
    <ChromiumSurface
      {...props}
      onReady={ready}
      onFrame={frame}
      onUnavailable={() => void unavailable()}
    />
  );
}
