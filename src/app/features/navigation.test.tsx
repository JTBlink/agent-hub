// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { SidebarActivityBar } from "../../components/SidebarActivityBar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@app/product", () => ({
  productConfig: {
    sidebar: {
      primary: ["example"],
      bottom: [],
      defaultPanel: "example",
    },
  },
}));
vi.mock("@app/features", () => ({
  featureModules: [
    {
      id: "example",
      sidebar: {
        id: "example-panel",
        kind: "panel",
        labelKey: "example.title",
        icon: () => <svg aria-hidden="true" />,
        component: () => <p>Example panel</p>,
      },
    },
  ],
}));

it("dispatches an independently contributed panel without adding a builtin activity entry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  await act(async () =>
    root.render(
      <MemoryRouter>
        <SidebarActivityBar
          panelOpen
          panelId="panel"
          selectedPanel="example-panel"
          manualSelection
          onSelectPanel={select}
          gitSidebarOpen={false}
          onSelectGit={vi.fn()}
        />
      </MemoryRouter>,
    ),
  );
  const button = host.querySelector<HTMLButtonElement>(
    '[aria-label="example.title"]',
  );
  expect(button?.getAttribute("aria-expanded")).toBe("true");
  await act(async () => button?.click());
  expect(select).toHaveBeenCalledWith("example-panel");
  await act(async () => root.unmount());
  host.remove();
});
