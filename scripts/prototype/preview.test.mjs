import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
import { createServer } from "vite";

const root = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));

it("serves migrated prototype entries through legacy URLs instead of the application shell", async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, preTransformRequests: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const listener = http.createServer(server.middlewares);
  try {
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${listener.address().port}`;
    const catalog = JSON.parse(
      readFileSync(
        new URL("../../docs/prototypes/catalog.json", import.meta.url),
        "utf8",
      ),
    );
    const entries = [
      {
        path: "/docs/prototypes/",
        aliases: ["/prototypes", "/prototypes/", "/prototypes/index.html"],
      },
      ...catalog,
    ];
    for (const entry of entries) {
      for (const alias of entry.aliases ?? []) {
        const query = "?variant=B&theme=light";
        const response = await fetch(origin + alias + query, {
          redirect: "manual",
        });
        assert.equal(response.status, 302, alias);
        assert.equal(
          response.headers.get("location"),
          entry.path + query,
          alias,
        );
        const page = await fetch(
          new URL(response.headers.get("location"), origin),
        );
        assert.equal(page.status, 200, entry.path);
        const html = await page.text();
        assert.ok(!html.includes('src="/src/main.tsx"'), alias);
        assert.match(html, /<script[^>]+type="module"/, alias);
      }
    }
  } finally {
    await new Promise((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    );
    await server.close();
  }
}, 15000);

const launch = (port) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "bash",
      [
        "./prototype.sh",
        "preview",
        "--port",
        String(port),
        "--layout",
        "B",
        "--no-open",
      ],
      { cwd: root, timeout: 8000 },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
  });

it("reuses only the current checkout and preserves services from other worktrees", async () => {
  let checkout = createHash("sha256").update(root).digest("hex");
  const server = http.createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ prototype: "agent-hub-preview", checkout }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const own = await launch(port);
    assert.equal(own.code, 0, own.output);
    assert.ok(own.output.includes("复用已有原型服务"));
    assert.ok(
      own.output.includes(`:${port}/docs/prototypes/preview/?variant=B`),
    );
    checkout = "different-worktree";
    const other = await launch(port);
    assert.equal(other.code, 1, other.output);
    assert.ok(other.output.includes("其他工作树"));
    assert.ok(server.listening);
    assert.equal((await launch(port)).code, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

it("compiles the catalog stylesheet with the shared theme", async () => {
  const brand = readFileSync(
    new URL("../../src/styles/brand.css", import.meta.url),
    "utf8",
  );
  const catalog = readFileSync(
    new URL("../../docs/prototypes/catalog.css", import.meta.url),
    "utf8",
  );
  const result = await postcss([
    tailwindcss({
      content: [
        { raw: '<html class="dark"><body></body></html>', extension: "html" },
      ],
      darkMode: "class",
    }),
  ]).process(brand + "\n" + catalog, { from: undefined });
  assert.ok(result.css.includes("--color-bg:"));
  assert.ok(result.css.includes(".dark"));
  assert.ok(!result.css.includes("@tailwind base"));
});
