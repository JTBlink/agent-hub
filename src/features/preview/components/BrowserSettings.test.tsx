// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserSettings } from "./BrowserSettings";
import { previewApi } from "../api";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../api", () => ({
  previewApi: { profile: vi.fn(), info: vi.fn(), deleteProfile: vi.fn() },
}));
let container: HTMLDivElement, root: Root;
const info = {
  executable: null,
  profiles: [
    { id: "default", name: "Default" },
    { id: "guest", name: "Guest", ephemeral: true },
    { id: "custom", name: "Custom" },
  ],
};
const model: ComponentProps<typeof BrowserSettings>["model"] = {
  active: undefined,
  pageId: undefined,
  info,
  viewport: null,
  searchEngine: "bing",
  setInfo: vi.fn(),
  setNotice: vi.fn(),
  setPanelOpen: vi.fn(),
  setSearchEngine: vi.fn(),
  setSession: vi.fn(),
  setViewport: vi.fn(),
  report: vi.fn(),
};
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(previewApi.info).mockResolvedValue(info);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<BrowserSettings model={model} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const click = async (element: Element) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const button = (text: string) => {
  const element = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  );
  if (!element) throw Error(`Missing ${text}`);
  return element;
};
it("keeps cancellation from deleting and confirms only the selected custom profile", async () => {
  await click([...container.querySelectorAll(".preview-profile-row")][2]);
  await click(button("preview.deleteProfile"));
  expect(previewApi.deleteProfile).not.toHaveBeenCalled();
  await click(button("common.cancel"));
  expect(previewApi.deleteProfile).not.toHaveBeenCalled();
  await click(button("preview.deleteProfile"));
  const dialog = document.querySelector('[role="alertdialog"]');
  expect(dialog).not.toBeNull();
  const confirm = [...dialog!.querySelectorAll("button")].find(
    (button) => button.textContent === "common.delete",
  )!;
  await click(confirm);
  expect(previewApi.deleteProfile).toHaveBeenCalledExactlyOnceWith("custom");
});
it("marks an existing custom configuration as temporary and protects the built-in guest", async () => {
  await click([...container.querySelectorAll(".preview-profile-row")][2]);
  await click(container.querySelector('[role="switch"]')!);
  await click(button("common.save"));
  expect(previewApi.profile).toHaveBeenCalledWith(
    expect.objectContaining({ id: "custom", ephemeral: true }),
  );
  await click([...container.querySelectorAll(".preview-profile-row")][1]);
  expect(
    container.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled,
  ).toBe(true);
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "preview.deleteProfile",
    ),
  ).toBe(false);
});

it("keeps failed cleanup visible and permits retrying the same profile deletion", async () => {
  vi.mocked(previewApi.deleteProfile).mockRejectedValueOnce(
    new Error("file is locked"),
  );
  vi.mocked(previewApi.info).mockResolvedValueOnce({
    ...info,
    profiles: info.profiles.map((profile) =>
      profile.id === "custom" ? { ...profile, deleting: true } : profile,
    ),
  });
  await click([...container.querySelectorAll(".preview-profile-row")][2]);
  await click(button("preview.deleteProfile"));
  await click(button("common.delete"));
  expect(model.report).toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await click(button("common.cancel"));
  expect(button("common.save").matches(":disabled")).toBe(true);
  await click(button("preview.retryProfileDeletion"));
  await click(button("common.delete"));
  expect(
    vi.mocked(previewApi.deleteProfile).mock.calls.map((call) => call[0]),
  ).toEqual(["custom", "custom"]);
});

it("saves the remote download base only for a remote profile", async () => {
  const remote = {
    id: "remote",
    name: "Remote",
    endpoint: "http://127.0.0.1:9222",
    remote_download_directory: "/srv/downloads",
  };
  await act(async () =>
    root.render(
      <BrowserSettings
        model={{ ...model, info: { ...info, profiles: [remote] } }}
      />,
    ),
  );
  await click(container.querySelector(".preview-profile-row")!);
  expect(
    [...container.querySelectorAll("input")].some(
      (input) => input.value === "/srv/downloads",
    ),
  ).toBe(true);
  await click(button("common.save"));
  expect(previewApi.profile).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "remote",
      remote_download_directory: "/srv/downloads",
    }),
  );
});
