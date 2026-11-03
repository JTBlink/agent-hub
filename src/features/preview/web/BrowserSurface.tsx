import { useEffect, useEffectEvent, useState } from "react";
import { previewApi } from "../api";
import { ChromiumSurface } from "./chromium/ChromiumSurface";
import { NativeSurface } from "./native/NativeSurface";
import type { BrowserSurfaceProps } from "./types";

/** Backend selection only. Each renderer owns its transport and lifecycle. */
export function BrowserSurface(props: BrowserSurfaceProps) {
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
      onLocation={props.onNativeLocation}
      picking={props.picking}
      onReady={props.onReady}
      onFrame={props.onFrame}
      onCapture={props.onCapture}
      onPickingChange={props.onPickingChange}
      onNavigation={props.onNativeNavigation}
      onError={props.onError}
    />
  ) : (
    <ChromiumSurface {...props} onUnavailable={() => void unavailable()} />
  );
}
