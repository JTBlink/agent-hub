// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import {
  matchRoutes,
  MemoryRouter,
  Outlet,
  useLocation,
} from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AppRoutes } from "./AppRoutes";
import { createAppRoutes } from "./routeDefinitions";

vi.mock("../components/Layout", () => ({
  Layout: () => (
    <main>
      <Outlet />
    </main>
  ),
}));

vi.mock("@app/discover", () => ({
  default: function ProductDiscovery() {
    const { search } = useLocation();
    return <p>Product discovery {search}</p>;
  },
}));

it("preserves built-in aliases, parameters, and workspace host routes", () => {
  const routes = createAppRoutes();
  for (const path of [
    "/",
    "/install",
    "/discover",
    "/terminal",
    "/preview",
    "/settings",
  ]) {
    expect(matchRoutes(routes, path)?.at(-1)?.route.path).toBe(path);
  }
  expect(matchRoutes(routes, "/project/demo/skills")?.at(-1)?.params).toEqual({
    id: "demo",
  });
  expect(matchRoutes(routes, "/help/getting-started")?.at(-1)?.params).toEqual({
    articleId: "getting-started",
  });
});

it("renders host pages inside the shared layout without changing the base route set", () => {
  const extension = { path: "/extra", element: <p>Host page</p> };
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/extra"]}>
      <AppRoutes extensionRoutes={[extension]} />
    </MemoryRouter>,
  );
  expect(html).toBe("<main><p>Host page</p></main>");
  expect(matchRoutes(createAppRoutes(), "/extra")).toBeNull();
  expect(extension.path).toBe("/extra");
});

it.each(["/discover", "/install"])(
  "renders the selected discovery page at %s with its original query",
  (path) => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`${path}?type=automations`]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(html).toBe(
      "<main><p>Product discovery ?type=automations</p></main>",
    );
  },
);
