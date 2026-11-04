// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PreviewAddress } from "./PreviewAddress";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("switches between a selectable source path and an editable URL in the same address field", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onToggle = vi.fn();
  const onNavigate = vi.fn();
  const props = {
    sourcePath: "/workspace/site/index.html",
    onToggle,
    onNavigate,
    onChange: vi.fn(),
  };
  const submit = () =>
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  try {
    await act(async () =>
      root.render(
        <PreviewAddress {...props} value={props.sourcePath} showingSource />,
      ),
    );
    expect(container.querySelector("input")?.value).toBe(props.sourcePath);
    expect(container.querySelector("input")?.readOnly).toBe(true);
    await act(async () => {
      submit();
    });
    expect(onNavigate).not.toHaveBeenCalled();
    await act(async () => container.querySelector("button")?.click());
    expect(onToggle).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <PreviewAddress
          {...props}
          value="http://preview.localhost/index.html"
          showingSource={false}
        />,
      ),
    );
    expect(container.querySelector("input")?.readOnly).toBe(false);
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "preview.showSourcePath",
    );
    await act(async () => {
      submit();
    });
    expect(onNavigate).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <PreviewAddress
          {...props}
          sourcePath={undefined}
          value="https://example.invalid/"
          showingSource={false}
        />,
      ),
    );
    expect(container.querySelector("button")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
