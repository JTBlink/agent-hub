import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { helpContentPlugin } from "./scripts/docs/vite-plugin.mjs";

export default defineConfig({
  plugins: [
    react(),
    helpContentPlugin(import.meta.dirname),
    {
      name: "prototype-checkout-identity",
      configureServer(server) {
        const checkout = createHash("sha256")
          .update(realpathSync(server.config.root))
          .digest("hex");
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
    port: 1420,
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
