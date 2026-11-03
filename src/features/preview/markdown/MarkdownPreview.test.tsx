// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../../components/file-reader/CodeEditor", () => ({
  CodeEditor: () => <div data-editor />,
}));
it("scrolls a linked fragment only when visible and preserves the later reading position", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props = {
    document: {
      id: "linked",
      kind: "markdown" as const,
      title: "next.md",
      content: "",
      revision: "first",
      fragment: "target",
    },
    draft: "# Start\n\n## Target\n\nParagraph",
    source: false,
    picking: false,
    onCapture: vi.fn(),
    onLink: vi.fn(),
  };
  try {
    await act(async () =>
      root.render(<MarkdownPreview {...props} active={false} />),
    );
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => root.render(<MarkdownPreview {...props} active />));
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll.mock.instances[0]).toBe(container.querySelector("#target"));
    await act(async () =>
      root.render(<MarkdownPreview {...props} active={false} />),
    );
    await act(async () => root.render(<MarkdownPreview {...props} active />));
    expect(scroll).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <MarkdownPreview
          {...props}
          document={{ ...props.document, fragment: "start" }}
          source
        />,
      ),
    );
    expect(scroll).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <MarkdownPreview
          {...props}
          document={{ ...props.document, fragment: "start" }}
        />,
      ),
    );
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.mock.instances[1]).toBe(container.querySelector("#start"));
  } finally {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    vi.unstubAllGlobals();
  }
});
