import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useCallback,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../../../../lib/error";
import type { BrowserFrame, PickedElement } from "../../api";
import type { BrowserNavigation } from "../types";
import { nativeApi } from "./api";

interface Props {
  active: boolean;
  address: string;
  picking?: boolean;
  onReady?: (id: string) => void;
  onFrame?: (frame: BrowserFrame) => void;
  onCapture?: (capture: PickedElement) => void;
  onPickingChange?: (picking: boolean) => void;
  onNavigation?: (handler: BrowserNavigation | null) => void;
  onLocation?: (url: string) => void;
  onError: (message: string) => void;
}
/** Native browser rendering has no dependency on Chromium, CDP, or frame images. */
export function NativeSurface(props: Props) {
  const { t } = useTranslation();
  const surface = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const location = useRef(props.address);
  const [inspection, setInspection] = useState(false);
  const [persistent, setPersistent] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const active = useRef(props.active);
  useEffect(() => {
    active.current = props.active;
  }, [props.active]);
  const visible = useCallback(
    () =>
      active.current &&
      !document.hidden &&
      !document.querySelector(
        'dialog[open], [role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]',
      ),
    [],
  );
  const report = useEffectEvent((error: unknown) => {
    const message = getErrorMessage(error, t("common.error"));
    setError(message);
    props.onError(message);
  });
  const notifyReady = useEffectEvent((id: string) => props.onReady?.(id));
  const publish = useEffectEvent(
    (result: Awaited<ReturnType<typeof nativeApi.frame>>) => {
      props.onFrame?.(result.frame);
      setError("");
      setLoading(result.frame.info.ready === "loading");
      if (result.picked) props.onCapture?.(result.picked);
      if (result.cancelled) props.onPickingChange?.(false);
    },
  );
  const notifyLocation = useEffectEvent((url: string) =>
    props.onLocation?.(url),
  );
  const notifyNavigation = useEffectEvent((handler: BrowserNavigation | null) =>
    props.onNavigation?.(handler),
  );
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let mutation: MutationObserver | undefined;
    let unlisten: (() => void) | undefined;
    let previous = "";
    const early = new Map<
      string,
      { id: string; url: string; loading: boolean }
    >();
    const consume = (payload: {
      id: string;
      url: string;
      loading: boolean;
    }) => {
      if (disposed) return;
      if (!id.current) {
        early.set(payload.id, payload);
        return;
      }
      if (payload.id !== id.current) return;
      location.current = payload.url;
      setLoading(payload.loading);
      notifyLocation(payload.url);
    };
    const bounds = () => {
      const rect = surface.current!.getBoundingClientRect();
      return {
        x: Math.max(0, rect.x),
        y: Math.max(0, rect.y),
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      };
    };
    const sync = () => {
      if (!id.current || !surface.current || disposed) return;
      const visible =
        active.current &&
        !document.hidden &&
        !document.querySelector(
          'dialog[open], [role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]',
        );
      const rect = bounds();
      const next = JSON.stringify({ visible, rect });
      if (next === previous) return;
      previous = next;
      void nativeApi.update(id.current, visible, rect).catch(report);
    };
    void (async () => {
      try {
        unlisten = await listen<{ id: string; url: string; loading: boolean }>(
          "preview-native-location",
          ({ payload }) => {
            consume(payload);
          },
        );
        if (disposed) {
          unlisten();
          return;
        }
        const opened = await nativeApi.open(location.current, bounds());
        if (disposed) {
          await nativeApi.action(opened, "close");
          return;
        }
        id.current = opened;
        const info = await nativeApi.info();
        if (disposed) return;
        setInspection(info.inspection ?? true);
        setPersistent(info.persistent ?? false);
        if (info.inspection ?? true) notifyReady(opened);
        setReady(true);
        if (early.has(opened)) consume(early.get(opened)!);
        else setLoading(false);
        early.clear();
        notifyNavigation((action) => nativeApi.action(opened, action));
        sync();
        observer = new ResizeObserver(sync);
        observer.observe(surface.current!);
        mutation = new MutationObserver(sync);
        mutation.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["hidden", "open", "class"],
        });
        window.addEventListener("resize", sync);
        window.addEventListener("scroll", sync, true);
        document.addEventListener("visibilitychange", sync);
      } catch (error) {
        if (!disposed) report(error);
      }
    })();
    return () => {
      disposed = true;
      notifyNavigation(null);
      observer?.disconnect();
      mutation?.disconnect();
      unlisten?.();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      document.removeEventListener("visibilitychange", sync);
      const opened = id.current;
      id.current = null;
      if (opened) void nativeApi.action(opened, "close").catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (id.current) void nativeApi.update(id.current, visible()).catch(report);
  }, [props.active, visible]);
  useEffect(() => {
    if (id.current && props.address !== location.current) {
      location.current = props.address;
      void nativeApi
        .update(id.current, visible(), undefined, props.address)
        .catch(report);
    }
  }, [props.address, props.active, ready, visible]);
  const polling = ready && inspection && props.active && !!props.onFrame;
  useEffect(() => {
    if (!polling) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (id.current && !document.hidden) {
          const result = await nativeApi.frame(id.current);
          if (!disposed) publish(result);
        }
      } catch (error) {
        if (!disposed) report(error);
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), 500);
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [polling]);
  useEffect(() => {
    if (ready && inspection && id.current)
      void nativeApi.picking(id.current, props.picking ?? false).catch(report);
  }, [ready, inspection, props.picking]);
  return (
    <div className="preview-native-surface">
      <div className="preview-native-toolbar">
        <strong>{t("preview.nativeBackend")}</strong>
        {loading && <span role="status">{t("common.loading")}</span>}
      </div>
      <p className="text-xs text-muted">
        {t(
          inspection
            ? "preview.nativeCapabilities"
            : "preview.nativeBasicCapabilities",
        )}{" "}
        {t(persistent ? "preview.nativePersistent" : "preview.nativeTemporary")}
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div ref={surface} className="preview-native-viewport" />
    </div>
  );
}
