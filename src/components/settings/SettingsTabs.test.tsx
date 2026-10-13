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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function Subject() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>Back</button>
      <SettingsTabs agentCount={4}>
        {{
          agents: <input aria-label="Agent name" defaultValue="draft" />,
          skills: <p>Skills</p>,
          appearance: <p>Appearance</p>,
          backup: <input aria-label="Proxy" />,
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
  expect(tabs()).toHaveLength(5);
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
  expect(tabs()[4].getAttribute("aria-selected")).toBe("true");
  tabs()[4].focus();
  await act(async () =>
    tabs()[4].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs()[0]);
  await act(async () =>
    tabs()[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(tabs()[4]);
  await act(async () =>
    tabs()[4].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(tabs()[0]);
});
