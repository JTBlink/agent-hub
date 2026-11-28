// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";
import { getSettings, setSettings } from "../lib/tauri";

const product = vi.hoisted(() => ({ id: "standard", dataId: "standard" }));
vi.mock("@app/product", () => ({ productConfig: product }));
vi.mock("../app/product/workbench", () => ({
  useWorkbench: () => ({ appearance: { theme: "dark" } }),
}));
vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn().mockResolvedValue(null),
  setSettings: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => {
  product.id = "standard";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.themeMode;
});

it("keeps the default and saved appearance independent when products share data", async () => {
  product.id = "agent-flow";
  localStorage.setItem("theme", "light");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function Host() {
    const { setTheme } = useTheme();
    return <button onClick={() => setTheme("light")}>Light</button>;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Host />));
    expect(getSettings).toHaveBeenCalledWith("theme:agent-flow");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await act(async () => host.querySelector("button")!.click());
    expect(setSettings).toHaveBeenCalledWith("theme:agent-flow", "light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});
it("publishes system mode at the same color and updates resolved context on OS changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("theme", "dark");
  let dark = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return dark;
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  function Host() {
    const model = useTheme();
    return (
      <button
        data-resolved={model.resolvedTheme}
        onClick={() => model.setTheme("system")}
      >
        System
      </button>
    );
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Host />));
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    await act(async () => host.querySelector("button")!.click());
    expect(document.documentElement.dataset.themeMode).toBe("system");
    expect(host.querySelector("button")!.dataset.resolved).toBe("dark");
    await act(async () => {
      dark = false;
      listeners.forEach((listener) => listener());
    });
    expect(host.querySelector("button")!.dataset.resolved).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});
