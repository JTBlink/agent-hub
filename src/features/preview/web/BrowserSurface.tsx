import { previewError } from "../shared/previewError";
import { latestDispatcher } from "../shared/latestDispatcher";
import { PagePrompts } from "./PagePrompts";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  previewApi,
  type BrowserAction,
  type BrowserFrame,
  type PickedElement,
} from "../api";

interface Props {
  tabId: string;
  initialId?: string;
  active: boolean;
  address: string;
  profile: string;
  picking: boolean;
  viewport: { width: number; height: number; mobile: boolean } | null;
  onReady: (id: string) => void;
  onFrame: (frame: BrowserFrame) => void;
  onCapture: (value: PickedElement) => void;
  onError: (message: string) => void;
}
export function BrowserSurface(props: Props) {
  const { t } = useTranslation();
  const [id, setId] = useState<string | null>(props.initialId ?? null);
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [hover, setHover] = useState<PickedElement | null>(null);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState<"reconnect" | "reopen" | null>(
    null,
  );
  const [retry, setRetry] = useState(0);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const container = useRef<HTMLDivElement>(null);
  const keyboard = useRef<HTMLTextAreaElement>(null);
  const ownedId = useRef<string | null>(props.initialId ?? null);
  const queue = useRef(Promise.resolve());

  const motion = useRef<ReturnType<
    typeof latestDispatcher<{
      x: number;
      y: number;
      button: string;
      picking: boolean;
      epoch: number;
    }>
  > | null>(null);
  const pickEpoch = useRef(0);
  useEffect(() => {
    pickEpoch.current += 1;
    motion.current?.clear();
  }, [
    props.active,
    props.picking,
    props.address,
    frame?.info.revision,
    id,
    error,
    recovering,
  ]);
  const refresh = useRef<(() => void) | null>(null);
  const fastUntil = useRef(0);
  const report = useEffectEvent((message: string) => props.onError(message));
  const ready = useEffectEvent((value: string) => props.onReady(value));
  const publish = useEffectEvent((value: BrowserFrame) => props.onFrame(value));
  const send = (action: BrowserAction) => {
    if (!id || error || recovering) return;
    const page = id;
    const epoch = pickEpoch.current;
    queue.current = queue.current
      .then(async () => {
        if (ownedId.current !== page || epoch !== pickEpoch.current) return;
        await previewApi.action(page, action);
        fastUntil.current = Date.now() + 1000;
        refresh.current?.();
      })
      .catch((error: unknown) => {
        if (epoch !== pickEpoch.current) return;
        pickEpoch.current += 1;
        motion.current?.clear();
        setHover(null);
        const message = previewError(error, t);
        const rejected =
          typeof error === "object" &&
          error !== null &&
          "kind" in error &&
          ["invalid_input", "cancelled"].includes(String(error.kind));
        if (!rejected) setError(message);
        props.onError(message);
      });
    return queue.current;
  };
  const deliverMotion = useEffectEvent(
    async (value: {
      x: number;
      y: number;
      button: string;
      picking: boolean;
      epoch: number;
    }) => {
      if (
        !props.active ||
        error ||
        recovering ||
        value.epoch !== pickEpoch.current ||
        !id
      )
        return;
      if (value.picking) {
        try {
          const picked = await previewApi.action<PickedElement>(id, {
            kind: "pick",
            x: value.x,
            y: value.y,
          });
          if (value.epoch === pickEpoch.current) setHover(picked);
        } catch {
          /* Hover errors do not interrupt selection. */
        }
      } else
        await send({
          kind: "mouse",
          event: "mouseMoved",
          x: value.x,
          y: value.y,
          button: value.button,
        });
    },
  );
  useEffect(() => {
    const dispatcher = latestDispatcher(
      (value: {
        x: number;
        y: number;
        button: string;
        picking: boolean;
        epoch: number;
      }) => deliverMotion(value),
    );
    motion.current = dispatcher;
    return () => {
      dispatcher.dispose();
      motion.current = null;
    };
  }, []);
  useEffect(() => {
    if (!props.active || id) return;
    let disposed = false;
    previewApi
      .create(props.profile, props.address, props.tabId)
      .then((value) => {
        if (disposed) {
          void previewApi.close(value).catch(() => {});
          return;
        }
        ownedId.current = value;
        setId(value);
        setError("");
        ready(value);
      })
      .catch((error: unknown) => {
        if (!disposed) setError(previewError(error, t));
      });
    return () => {
      disposed = true;
    };
  }, [props.active, props.address, props.profile, props.tabId, id, retry, t]);
  useEffect(
    () => () => {
      const page = ownedId.current;
      ownedId.current = null;
      if (page) void previewApi.close(page).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (!props.active || !id || recovering) return;
    let disposed = false;
    let timer: number | undefined;
    let since: number | undefined;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        if (!document.hidden) {
          const next = await previewApi.frame(id, since);
          since = next.version;
          if (!disposed) {
            setFrame((previous) => {
              if (!next.image && previous)
                return { ...next, image: previous.image };
              return next;
            });
            setError("");
            publish(next);
          }
        }
      } catch (error: unknown) {
        if (!disposed) setError(previewError(error, t));
      } finally {
        inFlight = false;
        if (!disposed)
          timer = window.setTimeout(
            () => void poll(),
            document.hidden ? 1500 : Date.now() < fastUntil.current ? 100 : 300,
          );
      }
    };
    refresh.current = () => {
      clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      refresh.current = null;
      disposed = true;
      clearTimeout(timer);
    };
  }, [props.active, id, retry, recovering, t]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({
        width: Math.max(240, element.clientWidth - 24),
        height: Math.max(200, element.clientHeight - 24),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width = props.viewport?.width ?? Math.min(3840, Math.round(size.width));
  const height =
    props.viewport?.height ?? Math.min(2160, Math.round(size.height));
  const mobile = props.viewport?.mobile ?? false;
  useEffect(() => {
    if (!props.active || !id) return;
    const timer = window.setTimeout(() => {
      previewApi
        .action(id, { kind: "resize", width, height, mobile })
        .catch((error: unknown) => report(previewError(error, t)));
    }, 180);
    return () => clearTimeout(timer);
  }, [id, width, height, mobile, props.active, t]);
  useEffect(() => {
    if (props.active && props.picking)
      container.current?.focus({ preventScroll: true });
  }, [props.active, props.picking]);
  const currentHover =
    !error &&
    !recovering &&
    hover?.revision === frame?.info.revision &&
    hover?.url === frame?.info.url
      ? hover
      : null;
  const imageWidth = frame?.info.width ?? width,
    imageHeight = frame?.info.height ?? height;
  const scale = Math.min(size.width / imageWidth, size.height / imageHeight);
  const coordinates = (
    event:
      React.PointerEvent<HTMLDivElement> | React.WheelEvent<HTMLDivElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          imageWidth - 1,
          ((event.clientX - bounds.left) * imageWidth) / bounds.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          imageHeight - 1,
          ((event.clientY - bounds.top) * imageHeight) / bounds.height,
        ),
      ),
    };
  };
  const recover = async (mode: "reconnect" | "reopen") => {
    if (!id || recovering) return;
    const page = id;
    pickEpoch.current += 1;
    motion.current?.clear();
    setHover(null);
    setRecovering(mode);
    try {
      await (mode === "reopen"
        ? previewApi.reopen(page)
        : previewApi.reconnect(page));
      if (ownedId.current !== page) return;
      setFrame(null);
      setError("");
      setRetry((value) => value + 1);
    } catch (error: unknown) {
      if (ownedId.current === page) setError(previewError(error, t));
    } finally {
      if (ownedId.current === page) setRecovering(null);
    }
  };
  return (
    <div
      ref={container}
      className="preview-browser-surface"
      aria-label={t("preview.browserSurface")}
      tabIndex={props.picking ? 0 : undefined}
      onKeyDownCapture={(event) => {
        if (
          !props.picking ||
          !props.active ||
          !currentHover ||
          !id ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        const key = event.key.toLowerCase();
        if (key !== "c" && key !== "s") return;
        event.preventDefault();
        event.stopPropagation();
        if (key === "c") {
          const epoch = pickEpoch.current;
          void previewApi
            .action(id, {
              kind: "verify_revision",
              expected_revision: currentHover.revision,
            })
            .then(() => {
              if (epoch === pickEpoch.current)
                return writeText(JSON.stringify(currentHover, null, 2));
            })
            .catch((error: unknown) => {
              setHover(null);
              props.onError(previewError(error, t));
            });
        } else {
          const epoch = pickEpoch.current;
          void previewApi
            .action<{ data: string }>(id, {
              kind: "screenshot",
              full: false,
              clip: currentHover.documentBounds,
              expected_revision: currentHover.revision,
            })
            .then((value) => {
              if (epoch === pickEpoch.current)
                props.onCapture({ ...currentHover, screenshot: value.data });
            })
            .catch((error: unknown) => props.onError(previewError(error, t)));
        }
      }}
    >
      {id && frame && !error && !recovering && (
        <PagePrompts id={id} info={frame.info} onError={props.onError} />
      )}
      {error && (
        <div role="alert" className="preview-browser-error">
          {id && <p>{t("preview.connectionUnverified")}</p>}
          <p>
            {error.includes("PREVIEW_BROWSER_NOT_FOUND")
              ? t("preview.missingBrowser")
              : error}
          </p>
          {id && <p>{t("preview.reconnectHint")}</p>}
          <button
            className="app-button-ghost"
            disabled={recovering !== null}
            onClick={() => {
              if (id) void recover("reconnect");
              else {
                setError("");
                setRetry((value) => value + 1);
              }
            }}
          >
            {t(
              recovering === "reconnect"
                ? "preview.reconnecting"
                : id
                  ? "preview.reconnect"
                  : "common.retry",
            )}
          </button>
          {id && (
            <>
              <p>{t("preview.reopenHint")}</p>
              <button
                className="app-button-ghost"
                disabled={recovering !== null}
                onClick={() => void recover("reopen")}
              >
                {t(
                  recovering === "reopen"
                    ? "preview.reopening"
                    : "preview.reopen",
                )}
              </button>
            </>
          )}
        </div>
      )}
      {!frame && !error && (
        <p role="status" className="text-xs text-muted">
          {t("common.loading")}
        </p>
      )}
      {frame && (
        <div
          className={`preview-browser-image ${props.picking ? "picking" : ""}`}
          style={{ width: imageWidth * scale, height: imageHeight * scale }}
          onPointerDown={(event) => {
            if (error || recovering) return;
            event.preventDefault();
            keyboard.current?.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            if (!props.picking)
              send({
                kind: "mouse",
                event: "mousePressed",
                button: event.button === 2 ? "right" : "left",
                ...coordinates(event),
              });
          }}
          onPointerUp={(event) => {
            if (error || recovering) return;
            const point = coordinates(event);
            if (props.picking && id) {
              const epoch = pickEpoch.current;
              void previewApi
                .action<PickedElement>(id, { kind: "pick", ...point })
                .then((value) => {
                  if (value && epoch === pickEpoch.current)
                    props.onCapture(value);
                })
                .catch((error: unknown) =>
                  props.onError(previewError(error, t)),
                );
            } else
              send({
                kind: "mouse",
                event: "mouseReleased",
                button: event.button === 2 ? "right" : "left",
                ...point,
              });
          }}
          onPointerMove={(event) => {
            if (error || recovering) return;
            motion.current?.submit({
              ...coordinates(event),
              button:
                event.buttons === 2 ? "right" : event.buttons ? "left" : "none",
              picking: props.picking,
              epoch: pickEpoch.current,
            });
          }}
          onPointerLeave={() => {
            motion.current?.clear();
            setHover(null);
          }}
          onContextMenu={(event) => event.preventDefault()}
          onWheel={(event) => {
            if (error || recovering) return;
            event.stopPropagation();
            send({
              kind: "mouse",
              event: "mouseWheel",
              ...coordinates(event),
              delta_x: event.deltaX,
              delta_y: event.deltaY,
            });
            setHover(null);
          }}
        >
          <img
            src={`data:image/jpeg;base64,${frame.image}`}
            alt={frame.info.title || t("preview.browserSurface")}
            draggable={false}
          />
          {props.picking && currentHover && (
            <div
              className="preview-element-outline"
              style={{
                left: (currentHover.bounds.x / imageWidth) * 100 + "%",
                top: (currentHover.bounds.y / imageHeight) * 100 + "%",
                width: (currentHover.bounds.width / imageWidth) * 100 + "%",
                height: (currentHover.bounds.height / imageHeight) * 100 + "%",
              }}
            >
              <span>
                {currentHover.selector} ·{" "}
                {Math.round(currentHover.bounds.width)} ×{" "}
                {Math.round(currentHover.bounds.height)}
              </span>
            </div>
          )}
          <textarea
            ref={keyboard}
            className="preview-browser-keyboard"
            aria-label={t("preview.pageInput")}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (error || recovering) {
                event.preventDefault();
                return;
              }
              if (event.nativeEvent.isComposing) return;
              const modifier = event.ctrlKey || event.metaKey;
              if (modifier && event.key.toLowerCase() === "v") {
                event.preventDefault();
                const epoch = pickEpoch.current;
                void readText()
                  .then((text) => {
                    if (text && epoch === pickEpoch.current)
                      send({ kind: "text", text });
                  })
                  .catch((error: unknown) =>
                    props.onError(previewError(error, t)),
                  );
                return;
              }
              if (modifier && event.key.toLowerCase() === "c" && id) {
                event.preventDefault();
                void previewApi
                  .action<string>(id, {
                    kind: "evaluate",
                    expression: "String(getSelection())",
                  })
                  .then(writeText)
                  .catch((error: unknown) =>
                    props.onError(previewError(error, t)),
                  );
                return;
              }
              if (event.key.length > 1 || modifier) {
                event.preventDefault();
                send({
                  kind: "key",
                  key: event.key,
                  code: event.code,
                  modifiers:
                    (event.altKey ? 1 : 0) |
                    (event.ctrlKey ? 2 : 0) |
                    (event.metaKey ? 4 : 0) |
                    (event.shiftKey ? 8 : 0),
                });
              }
            }}
            onInput={(event) => {
              if (
                event.nativeEvent instanceof InputEvent &&
                event.nativeEvent.isComposing
              )
                return;
              const text = event.currentTarget.value;
              if (text) {
                send({ kind: "text", text });
                event.currentTarget.value = "";
              }
            }}
            onCompositionEnd={(event) => {
              const text = event.currentTarget.value;
              if (text) {
                send({ kind: "text", text });
                event.currentTarget.value = "";
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
