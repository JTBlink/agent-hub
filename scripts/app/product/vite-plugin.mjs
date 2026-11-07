import { copyFileSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  loadProduct,
  prepareProduct,
  featureAliases,
  featureCatalog,
} from "./config.mjs";

/** Keep product selection out of the shared Vite/prototype configuration. */
export function productViteConfig(root) {
  const product = loadProduct(
    process.env.AGENT_HUB_PRODUCT_CONFIG ||
      process.env.AGENT_HUB_PRODUCT ||
      "standard",
  );
  const selected = !!process.env.AGENT_HUB_PRODUCT_HASH;
  if (
    process.env.AGENT_HUB_PRODUCT_HASH === "development" &&
    process.env.AGENT_HUB_PRODUCT_TS
  )
    product.generatedDir = resolve(process.env.AGENT_HUB_PRODUCT_TS, "..");
  else if (!selected) product.generatedDir += "-development";
  product.hash = process.env.AGENT_HUB_PRODUCT_HASH || "development";
  prepareProduct(product);
  const herdr = product.features.includes("herdr");
  const integrationAliases = featureAliases(root, product.features);
  return {
    resolve: {
      alias: {
        "@app/features": resolve(product.generatedDir, "features.ts"),
        ...integrationAliases,
        "@app/platforms": resolve(product.generatedDir, "platforms.ts"),
        "@app/product":
          process.env.AGENT_HUB_PRODUCT_TS ||
          resolve(product.generatedDir, "product.ts"),
      },
    },
    // These generated application entries live under node_modules for build isolation.
    // Prebundling them duplicates React contexts in lazy feature chunks (e.g. Herdr).
    optimizeDeps: {
      exclude: [
        "@app/features",
        "@app/product",
        "@app/platforms",
        ...Object.keys(integrationAliases),
      ],
    },
    build: { outDir: process.env.AGENT_HUB_PRODUCT_OUTPUT_DIR || "dist" },
    server: { port: Number(process.env.AGENT_HUB_DEV_PORT || product.devPort) },
    plugins: [
      {
        name: "product-module-selection",
        enforce: "pre",
        transformIndexHtml(html) {
          return product.productName
            ? html.replace(
                /<title>.*?<\/title>/,
                `<title>${product.productName.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title>`,
              )
            : html;
        },
        configureServer(server) {
          if (!product.productName) return;
          server.middlewares.use((req, res, next) => {
            const filename = {
              "/icons/app-icon.svg": "app-icon.svg",
              "/icons/32x32.png": "32x32.png",
              "/icons/128x128.png": "128x128.png",
            }[req.url?.split("?")[0]];
            if (!filename) return next();
            res.setHeader(
              "Content-Type",
              filename.endsWith("svg") ? "image/svg+xml" : "image/png",
            );
            res.end(readFileSync(resolve(product.iconDir, filename)));
          });
        },
        writeBundle() {
          if (!product.productName) return;
          const output =
            process.env.AGENT_HUB_PRODUCT_OUTPUT_DIR || resolve(root, "dist");
          for (const filename of ["app-icon.svg", "32x32.png", "128x128.png"])
            copyFileSync(
              resolve(product.iconDir, filename),
              resolve(output, "icons", filename),
            );
        },
        transform(source, id) {
          if (!/\/src\/i18n\/(zh|zh-TW|en)\.json$/.test(id)) return;
          const locale = JSON.parse(source);
          if (product.productName) locale.app.name = product.productName;
          if (herdr) return { code: JSON.stringify(locale), map: null };
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
          const excluded = Object.entries(featureCatalog.features).flatMap(
            ([id, featureDefinition]) =>
              product.features.includes(id)
                ? []
                : (featureDefinition.excluded ?? []),
          );
          if (
            modules.some((id) =>
              excluded.some((prefix) => id.startsWith(prefix)),
            )
          )
            this.error("Excluded feature entered the product bundle");
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
