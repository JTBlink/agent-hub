import { relative, resolve } from "node:path";
import { loadProduct, prepareProduct } from "./config.mjs";

/** Keep product selection out of the shared Vite/prototype configuration. */
export function productViteConfig(root) {
  const product = loadProduct(
    process.env.AGENT_HUB_PRODUCT_CONFIG ||
      process.env.AGENT_HUB_PRODUCT ||
      "standard",
  );
  const selected = !!process.env.AGENT_HUB_PRODUCT_HASH;
  if (selected && process.env.AGENT_HUB_PRODUCT_HASH !== "development")
    prepareProduct(product);
  const herdr = product.features.includes("herdr");
  return {
    resolve: {
      alias: {
        "@app/features": selected
          ? resolve(product.generatedDir, "features.ts")
          : resolve(root, "src/app/features/default.ts"),
        "@app/herdr": resolve(
          root,
          herdr
            ? "src/features/herdr/integration.ts"
            : "src/integrations/herdr/disabled.ts",
        ),
        "@app/product": selected
          ? process.env.AGENT_HUB_PRODUCT_TS ||
            product.environment.AGENT_HUB_PRODUCT_TS
          : resolve(root, "src/app/product/default.ts"),
      },
    },
    build: { outDir: process.env.AGENT_HUB_PRODUCT_OUTPUT_DIR || "dist" },
    server: { port: Number(process.env.AGENT_HUB_DEV_PORT || product.devPort) },
    plugins: [
      {
        name: "product-module-selection",
        enforce: "pre",
        transform(source, id) {
          if (herdr || !/\/src\/i18n\/(zh|zh-TW|en)\.json$/.test(id)) return;
          const locale = JSON.parse(source);
          const sharedKeys = [
            "newTab",
            "copyOutput",
            "toggleZoom",
            "restorePane",
            "zoomPane",
            "terminalTools",
            "clear",
            "agentType",
            "noInstalledAgents",
            "agentName",
            "initialTask",
          ];
          locale.herdr = Object.fromEntries(
            sharedKeys.map((key) => [key, locale.herdr[key]]),
          );
          for (const key of Object.keys(locale.terminal))
            if (key.startsWith("herdr")) delete locale.terminal[key];
          return { code: JSON.stringify(locale), map: null };
        },
        generateBundle(_options, bundle) {
          const modules = [
            ...new Set(
              Object.values(bundle)
                .filter((item) => item.type === "chunk")
                .flatMap((item) => Object.keys(item.modules)),
            ),
          ]
            .map((id) => relative(root, id.split("?")[0]).replaceAll("\\", "/"))
            .filter((id) => !id.startsWith("../") && !id.includes("\0"))
            .sort();
          if (
            !herdr &&
            modules.some((id) => id.startsWith("src/features/herdr/"))
          )
            this.error(
              "Excluded Herdr implementation entered the product bundle",
            );
          this.emitFile({
            type: "asset",
            fileName: "product-build.json",
            source: JSON.stringify(
              {
                product_id: product.id,
                config_hash: selected
                  ? process.env.AGENT_HUB_PRODUCT_HASH
                  : "development",
                features: product.features,
                modules,
                assets: Object.keys(bundle).sort(),
              },
              null,
              2,
            ),
          });
        },
      },
    ],
  };
}
