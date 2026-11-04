// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { previewApi } from "../api";
import {
  applyBrowserTheme,
  blankPageThemeScript,
  useBrowserTheme,
} from "./useBrowserTheme";
vi.mock("../api", () => ({
  previewApi: { action: vi.fn().mockResolvedValue(null) },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("style");
});

it("sends the same theme operation to Chromium and native pages and applies background only to blank documents", async () => {
  for (const id of ["chromium-page", "preview-native-page"]) {
    await applyBrowserTheme(id, { dark: true, background: "#1e1e2e" }, true);
    expect(previewApi.action).toHaveBeenCalledWith(id, {
      kind: "set_theme",
      dark: true,
    });
    expect(previewApi.action).toHaveBeenCalledWith(id, {
      kind: "evaluate",
      expression: blankPageThemeScript({ dark: true, background: "#1e1e2e" }),
    });
  }
  vi.mocked(previewApi.action).mockClear();
  await applyBrowserTheme(
    "website",
    { dark: false, background: "#eff1f5" },
    false,
  );
  expect(previewApi.action).toHaveBeenCalledExactlyOnceWith("website", {
    kind: "set_theme",
    dark: false,
  });
});

it("updates an open webpage when the app switches theme and stops after unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.documentElement.classList.add("dark");
  document.documentElement.style.setProperty("--color-bg", "#1e1e2e");
  function Host() {
    const theme = useBrowserTheme("https://example.invalid/", vi.fn());
    return <button onClick={() => theme.ready("page")}>Ready</button>;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<Host />));
  await act(async () => host.querySelector("button")!.click());
  expect(previewApi.action).toHaveBeenLastCalledWith("page", {
    kind: "set_theme",
    dark: true,
  });
  await act(async () => {
    document.documentElement.classList.remove("dark");
  });
  expect(previewApi.action).toHaveBeenLastCalledWith("page", {
    kind: "set_theme",
    dark: false,
  });
  await act(async () => root.unmount());
  vi.mocked(previewApi.action).mockClear();
  document.documentElement.classList.add("dark");
  await Promise.resolve();
  expect(previewApi.action).not.toHaveBeenCalled();
});

it("uses app colors on the blank page and preserves authored webpage colors", () => {
  for (const dark of [true, false]) {
    const page = new JSDOM("", {
      url: "about:blank",
      runScripts: "outside-only",
    });
    const background = dark ? "#1e1e2e" : "#eff1f5";
    page.window.eval(blankPageThemeScript({ dark, background }));
    expect(page.window.document.documentElement.style.colorScheme).toBe(
      dark ? "dark" : "light",
    );
    expect(
      page.window.getComputedStyle(page.window.document.body).backgroundColor,
    ).toBe(dark ? "rgb(30, 30, 46)" : "rgb(239, 241, 245)");
    page.window.document.body.innerHTML = "<p>Authored content</p>";
    page.window.document.body.style.backgroundColor = "red";
    page.window.eval(blankPageThemeScript({ dark: !dark, background: "blue" }));
    expect(page.window.document.body.style.backgroundColor).toBe("red");
    page.window.close();
  }
  const website = new JSDOM("", {
    url: "https://example.invalid/",
    runScripts: "outside-only",
  });
  website.window.eval(blankPageThemeScript({ dark: true, background: "red" }));
  expect(website.window.document.body.style.backgroundColor).toBe("");
  website.window.close();
});
