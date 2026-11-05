// @vitest-environment jsdom
import { createInstance } from "i18next";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../../i18n/zh.json";
import { SettingsTabs } from "./SettingsTabs";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.removeItem("agent-hub:settings-sidebar-width");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function Subject({ backup = true }: { backup?: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>Back</button>
      <SettingsTabs agentCount={4}>
        {{
          agents: <input aria-label="Agent name" defaultValue="draft" />,
          skills: <p>Skills</p>,
          appearance: <p>Appearance</p>,
          backup: backup ? <p>Backup</p> : undefined,
          network: <input aria-label="Proxy" />,
          hosts: <p>Hosts editor</p>,
          permissions: "permissions",
          about: <p>About</p>,
        }}
      </SettingsTabs>
    </>
  );
}
async function render(path = "/settings#agents") {
  const i18n = createInstance();
  await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
          <Subject />
        </MemoryRouter>
      </I18nextProvider>,
    ),
  );
}
const tabs = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
];

it("opens the Agent deep link and preserves drafts and scroll across tab switches and back", async () => {
  await render();
  expect(tabs()).toHaveLength(8);
  expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
  const panel = container.querySelector<HTMLElement>('[role="tabpanel"]')!;
  const input = panel.querySelector<HTMLInputElement>("input")!;
  input.value = "unfinished edit";
  panel.scrollTop = 120;
  await act(async () => tabs()[3].click());
  expect(panel.hidden).toBe(true);
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(panel.hidden).toBe(false);
  expect(input.value).toBe("unfinished edit");
  expect(panel.scrollTop).toBe(120);
});

it("supports keyboard navigation and opens the update deep link directly", async () => {
  await render("/settings#about");
  expect(tabs()[7].getAttribute("aria-selected")).toBe("true");
  tabs()[7].focus();
  await act(async () =>
    tabs()[7].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs()[0]);
  await act(async () =>
    tabs()[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(tabs()[7]);
  await act(async () =>
    tabs()[7].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(tabs()[0]);
});

it("opens the network deep link with its own panel independently of backup", async () => {
  await render("/settings#network");
  const tab = tabs().find((item) => item.textContent === "网络")!;
  expect(tab.getAttribute("aria-selected")).toBe("true");
  expect(
    container.querySelector<HTMLElement>("#settings-panel-network")?.hidden,
  ).toBe(false);
  expect(
    container.querySelector<HTMLElement>("#settings-panel-backup")?.hidden,
  ).toBe(true);
});

it("drags the shared sidebar, keeps the selected panel and restores the saved width", async () => {
  await render("/settings#hosts");
  const handle = container.querySelector<HTMLElement>('[role="separator"]')!;
  Object.assign(handle, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  const pointer = async (type: string, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    await act(async () => handle.dispatchEvent(event));
  };
  const initial = Number(handle.getAttribute("aria-valuenow"));
  await pointer("pointerdown", 200);
  await pointer("pointermove", 260);
  await pointer("pointerup", 260);
  expect(Number(handle.getAttribute("aria-valuenow"))).toBe(initial + 60);
  expect(localStorage.getItem("agent-hub:settings-sidebar-width")).toBe(
    String(initial + 60),
  );
  expect(
    container.querySelector<HTMLElement>("#settings-panel-hosts")?.hidden,
  ).toBe(false);
  await act(async () => root.unmount());
  root = createRoot(container);
  await render("/settings#hosts");
  const restored = container.querySelector<HTMLElement>('[role="separator"]')!;
  expect(Number(restored.getAttribute("aria-valuenow"))).toBe(initial + 60);
  await act(async () =>
    restored.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
  );
  expect(restored.getAttribute("aria-valuenow")).toBe(String(initial));
});

it("omits unavailable capability tabs and falls back from an old backup deep link", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/settings#backup"]}>
          <Subject backup={false} />
        </MemoryRouter>
      </I18nextProvider>,
    ),
  );
  expect(container.querySelector("#settings-tab-backup")).toBeNull();
  expect(
    container
      .querySelector("#settings-tab-agents")
      ?.getAttribute("aria-selected"),
  ).toBe("true");
});
