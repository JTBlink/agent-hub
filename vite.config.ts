import { defineConfig } from "vite";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { productViteConfig } from "./packages/agent-hub-sdk/build/vite-plugin.mjs";
import { helpContentPlugin } from "./scripts/docs/vite-plugin.mjs";

const product = productViteConfig(import.meta.dirname);
// Prebundle editor core and lazy languages together to preserve constructor identity.
// The package manifest and language registry remain the authoritative dependency lists.
const editorDependencies = [
  ...new Set([
    ...Object.keys(
      JSON.parse(
        readFileSync(new URL("./package.json", import.meta.url), "utf8"),
      ).dependencies,
    ).filter(
      (name) =>
        /^@(codemirror|lezer)\//.test(name) &&
        name !== "@codemirror/legacy-modes",
    ),
    ...[
      ...readFileSync(
        new URL(
          "./src/components/file-reader/codeLanguages.ts",
          import.meta.url,
        ),
        "utf8",
      ).matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]),
  ]),
];

export default defineConfig({
  ...product,
  optimizeDeps: {
    ...product.optimizeDeps,
    // Discover lazy Markdown and editor dependencies before a live session starts.
    include: [
      "github-slugger",
      "unified",
      "remark-parse",
      ...editorDependencies,
    ],
  },
  plugins: [
    ...(product.plugins ?? []),
    react(),
    {
      name: "isolated-dev-dependency-cache",
      config(config, { command }) {
        if (command !== "serve" || config.cacheDir) return;
        // Live Vite servers retain module transforms in memory. Sharing their
        // optimizer output can mix old core chunks with newly loaded languages.
        return {
          cacheDir: resolve(
            import.meta.dirname,
            "node_modules/.vite",
            `dev-${config.server?.port ?? 1420}`,
          ),
        };
      },
    },
    helpContentPlugin(import.meta.dirname),
    {
      name: "prototype-checkout-identity",
      configureServer(server) {
        const checkout = createHash("sha256")
          .update(realpathSync(server.config.root))
          .digest("hex");
        const catalog: { path?: string; aliases?: string[] }[] = JSON.parse(
          readFileSync(
            new URL("./docs/prototypes/catalog.json", import.meta.url),
            "utf8",
          ),
        );
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url ?? "/", "http://localhost");
          if (
            ["/prototypes", "/prototypes/", "/prototypes/index.html"].includes(
              url.pathname,
            )
          ) {
            response
              .writeHead(302, { Location: "/docs/prototypes/" + url.search })
              .end();
            return;
          }
          const entry = catalog.find((item) =>
            item.aliases?.includes(url.pathname),
          );
          if (entry?.path) {
            response
              .writeHead(302, { Location: entry.path + url.search })
              .end();
          } else next();
        });
        server.middlewares.use("/__prototype_identity", (request, response) => {
          if (request.method !== "GET") {
            response.writeHead(405).end();
            return;
          }
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(
            JSON.stringify({ prototype: "agent-hub-preview", checkout }),
          );
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    ...product.server,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**"],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
});
