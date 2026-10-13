import { join } from "node:path";
import { buildHelp } from "./build-help.mjs";

/** Keep both development surfaces in sync when authors edit the source Markdown. */
export function helpContentPlugin(root) {
  return {
    name: "agenthub-help-content",
    configResolved() {
      // Direct Vite starts bypass npm's predev hook, including fresh checkouts.
      buildHelp(root);
    },
    configureServer(server) {
      const source = join(root, "docs/help");
      const changelog = join(root, "CHANGELOG.md");
      server.watcher.add([source, changelog]);
      let pending;
      const regenerate = (path) => {
        if (
          path !== changelog &&
          !path.startsWith(`${source}/`) &&
          !path.startsWith(`${source}\\`)
        )
          return;
        clearTimeout(pending);
        pending = setTimeout(() => {
          try {
            buildHelp(root);
            server.ws.send({ type: "full-reload" });
          } catch (error) {
            server.ws.send({
              type: "error",
              err: {
                message: error.message,
                stack: "",
                plugin: "agenthub-help-content",
              },
            });
          }
        }, 100);
      };
      for (const event of ["add", "change", "unlink"])
        server.watcher.on(event, regenerate);
      server.httpServer?.once("close", () => {
        clearTimeout(pending);
        for (const event of ["add", "change", "unlink"])
          server.watcher.off(event, regenerate);
      });
    },
  };
}
