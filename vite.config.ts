import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { productViteConfig } from "./scripts/app/product/vite-plugin.mjs";
import { helpContentPlugin } from "./scripts/docs/vite-plugin.mjs";

const product = productViteConfig(import.meta.dirname);

export default defineConfig({
  ...product,
  optimizeDeps: {
    ...product.optimizeDeps,
    // Discover Markdown's lazy preview dependencies before a live session starts.
    include: ["github-slugger", "unified", "remark-parse"],
  },
  plugins: [
    ...(product.plugins ?? []),
    react(),
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
