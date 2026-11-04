import { useEffect, useEffectEvent, useRef, useState } from "react";
import { previewApi, type BrowserFrame } from "../api";
import { getErrorMessage } from "../../../lib/error";

export interface BrowserTheme {
  background: string;
  dark: boolean;
  system?: boolean;
}

export function readBrowserTheme(): BrowserTheme {
  const root = document.documentElement;
  return {
    background: getComputedStyle(root).getPropertyValue("--color-bg").trim(),
    dark: root.classList.contains("dark"),
    ...(root.dataset.themeMode === "system" ? { system: true } : {}),
  };
}

/** Only the empty default document gets the application background. */
export function blankPageThemeScript({ background, dark }: BrowserTheme) {
  return `(()=>{if(location.href!=="about:blank"||!document.body||document.body.childElementCount||document.body.textContent.trim())return true;const color=${JSON.stringify(background)};document.documentElement.style.backgroundColor=color;document.body.style.backgroundColor=color;document.documentElement.style.colorScheme=${JSON.stringify(dark ? "dark" : "light")};return true;})()`;
}

/** Both renderer adapters accept the same theme operation through previewApi. */
export async function applyBrowserTheme(
  id: string,
  theme: BrowserTheme,
  blank: boolean,
) {
  await previewApi.action(id, {
    kind: "set_theme",
    dark: theme.dark,
    ...(theme.system ? { system: true } : {}),
  });
  if (blank && theme.background)
    await previewApi.action(id, {
      kind: "evaluate",
      expression: blankPageThemeScript(theme),
    });
}

export function useBrowserTheme(
  address: string,
  onError: (message: string) => void,
) {
  const [page, setPage] = useState<{
    id: string;
    url: string;
    revision?: string;
  } | null>(null);
  const queue = useRef(Promise.resolve());
  const report = useEffectEvent((error: unknown) =>
    onError(getErrorMessage(error, "Browser theme unavailable")),
  );
  useEffect(() => {
    if (!page) return;
    let disposed = false;
    const apply = () => {
      const theme = readBrowserTheme();
      queue.current = queue.current
        .then(async () => {
          if (!disposed)
            await applyBrowserTheme(page.id, theme, page.url === "about:blank");
        })
        .catch((error) => {
          if (!disposed) report(error);
        });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme-mode"],
    });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [page]);
  return {
    ready: (id: string) => setPage({ id, url: address }),
    frame: (frame: BrowserFrame) =>
      setPage((previous) =>
        !previous ||
        (previous.url === frame.info.url &&
          previous.revision === frame.info.revision)
          ? previous
          : { ...previous, url: frame.info.url, revision: frame.info.revision },
      ),
    location: (url: string) =>
      setPage((previous) =>
        previous && previous.url !== url ? { ...previous, url } : previous,
      ),
  };
}
