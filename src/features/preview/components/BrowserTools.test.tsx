// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BrowserTools } from "./BrowserTools";
import { createSession, openPreview } from "../shared/session";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it("lists native snapshot elements and routes inspect and annotate actions through their live references", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"),
    root = createRoot(host);
  const active = openPreview(createSession(), {
    kind: "web",
    title: "Fixture",
    address: "https://example.invalid/",
    profile: "native",
  }).tabs[0];
  const action = vi.fn(),
    captureWeb = vi.fn();
  action.mockResolvedValueOnce({
    elements: [
      {
        ref: "snapshot:0",
        tag: "button",
        role: "button",
        label: "Save record",
        selector: "button#save",
        disabled: false,
      },
      { ref: { invalid: true }, tag: "input" },
    ],
  });
  const picked = {
    selector: "button#save",
    role: "button",
    label: "Save record",
    text: "Save",
    html: "<button>Save</button>",
    styles: {},
    bounds: { x: 0, y: 0, width: 100, height: 20 },
    documentBounds: { x: 0, y: 0, width: 100, height: 20 },
    revision: active.revision,
    url: active.address,
  };
  const click = async (text: string) => {
    const button = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === text,
    );
    if (!button) throw Error("Missing " + text);
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(
        <BrowserTools
          model={{
            active,
            pageId: "preview-native-fixture",
            events: {},
            action,
            captureWeb,
            setPanelOpen: vi.fn(),
          }}
        />,
      ),
    );
    await click("preview.snapshot");
    expect(host.querySelectorAll(".preview-element-list details")).toHaveLength(
      1,
    );
    expect(host.textContent).toContain("Save record");
    action.mockResolvedValue(picked);
    await click("preview.inspectElement");
    expect(action).toHaveBeenLastCalledWith({
      kind: "inspect_ref",
      reference: "snapshot:0",
    });
    expect(host.querySelector(".preview-tool-output")?.textContent).toContain(
      "Save record",
    );
    await click("preview.annotateElement");
    expect(captureWeb).toHaveBeenCalledWith(active.id, picked);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
