import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { helpContentPlugin } from "./scripts/docs/vite-plugin.mjs";

export default defineConfig({
  plugins: [react(), helpContentPlugin(import.meta.dirname)],
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
