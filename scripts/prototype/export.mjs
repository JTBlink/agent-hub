import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { productViteConfig } from "../app/product/vite-plugin.mjs";
import { prototypePath, prototypes } from "./catalog.mjs";

const root = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(root, "docs/prototypes");
const outputRoot = resolve(sourceRoot, "dist");
// AgentHub opens HTML through the text-file reader.
const previewByteLimit = 1024 * 1024;
const pageFilename = (id) =>
  id === "index" ? "index.html" : `${id}/index.html`;

// Base85 leaves room for both the script and styles in a single Runner HTML file.
const base85 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~";
function encodeBase85(bytes) {
  const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
  bytes.copy(padded);
  const groups = [];
  for (let offset = 0; offset < padded.length; offset += 4) {
    let value = padded.readUInt32BE(offset);
    let group = "";
    for (let digit = 0; digit < 5; digit++) {
      group = base85[value % 85] + group;
      value = Math.floor(value / 85);
    }
    groups.push(group);
  }
  return groups.join("");
}

async function bundlePage(
  source,
  resolveConfig,
  { standalone, destination } = {},
) {
  const { output } = await build({
    root,
    configFile: false,
    publicDir: false,
    base: "./",
    resolve: resolveConfig,
    plugins: [react()],
    logLevel: "error",
    build: {
      write: false,
      target: "es2022",
      assetsInlineLimit: () => true,
      cssCodeSplit: false,
      modulePreload: false,
      rollupOptions: {
        input: source,
        output: { inlineDynamicImports: true },
      },
    },
  });

  const page = output.find((item) => item.fileName.endsWith(".html"));
  const script = output.find((item) => item.type === "chunk");
  const stylesheet = output.find((item) => item.fileName.endsWith(".css"));
  if (!page || !script || output.length !== (stylesheet ? 3 : 2)) {
    throw new Error(`原型包含无法内联的构建产物：${source}`);
  }
  const html = String(page.source);
  const scriptTag =
    /^[ \t]*<script type="module" crossorigin src="[^"]+"><\/script>[ \t]*\r?\n/m;
  const styleTag = /<link rel="stylesheet" crossorigin href="[^"]+">/;
  if (!scriptTag.test(html) || (stylesheet && !styleTag.test(html))) {
    throw new Error(`找不到原型的构建资源标签：${source}`);
  }
  const inlineScript = script.code.replace(/<\/script/gi, "<\\/script");
  const inlineStyle = String(stylesheet?.source ?? "").replace(
    /<\/style/gi,
    "<\\/style",
  );
  const template = html
    .replace(scriptTag, "")
    .replace(styleTag, () => `<style>${inlineStyle}</style>`);
  const embedScript = (page, script) =>
    page.replace(
      /<\/body>\s*<\/html>\s*$/i,
      () => `${script}\n</body>\n</html>\n`,
    );
  const plain = embedScript(
    template,
    `<script type="module">${inlineScript}</script>`,
  );
  if (Buffer.byteLength(plain) <= previewByteLimit) return plain;

  if (!standalone && destination) {
    // A local classic script loads in file:// and starts the bundled module in place.
    // Loading a module with a file:// src directly would require CORS.
    await writeFile(
      resolve(dirname(destination), "bundle.js"),
      `
      const moduleScript = document.createElement("script");
      moduleScript.type = "module";
      moduleScript.textContent = ${JSON.stringify(script.code)};
      document.body.append(moduleScript);
    `,
    );
    return embedScript(template, '<script src="./bundle.js"></script>');
  }

  const compressed = gzipSync(
    JSON.stringify([stylesheet?.source ?? "", script.code]),
    { level: 9 },
  );
  return embedScript(
    html
      .replace(scriptTag, "")
      .replace(styleTag, "")
      .replace(/^[ \t]+\r?\n/gm, ""),
    `<script type="module">
    try {
      const text = "${encodeBase85(compressed)}";
      const alphabet = ${JSON.stringify(base85)};
      const bytes = new DataView(new ArrayBuffer(text.length / 5 * 4));
      for (let offset = 0; offset < text.length; offset += 5) {
        let value = 0;
        for (let digit = 0; digit < 5; digit++) {
          value = value * 85 + alphabet.indexOf(text[offset + digit]);
        }
        bytes.setUint32(offset / 5 * 4, value);
      }
      const stream = new Blob([bytes.buffer.slice(0, ${compressed.length})]).stream()
        .pipeThrough(new DecompressionStream("gzip"));
      const [css, code] = await new Response(stream).json();
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
      const module = document.createElement("script");
      module.type = "module";
      module.textContent = code;
      document.body.append(module);
    } catch (error) {
      document.getElementById("root").textContent = "无法加载原型，请使用支持 gzip 解压的浏览器。";
      console.error(error);
    }
  </script>`,
  );
}

async function exportPage({ id, standaloneEntry }, resolveConfig) {
  const source = resolve(
    sourceRoot,
    standaloneEntry ? `${id}/prototype.html` : pageFilename(id),
  );
  const destination = resolve(outputRoot, pageFilename(id));
  await mkdir(dirname(destination), { recursive: true });
  const original = await readFile(source, "utf8");
  let html = original.includes('<script type="module"')
    ? await bundlePage(source, resolveConfig, {
        standalone: standaloneEntry,
        destination,
      })
    : original;

  // Static prototypes use the workspace icon in HTML and inline templates.
  // Use the matching raster icon so inlining stays within the preview limit.
  const icons = new Set(
    [...html.matchAll(/<img\b[^<>]*\bsrc="(\.\.\/[^"]+\/app-icon\.svg)"/g)].map(
      ([, path]) => path,
    ),
  );
  for (const path of icons) {
    const icon = await readFile(
      resolve(dirname(source), path.replace(/app-icon\.svg$/, "128x128.png")),
    );
    html = html.replaceAll(
      path,
      `data:image/png;base64,${icon.toString("base64")}`,
    );
  }
  if (html.includes('href="README.md"')) {
    await copyFile(
      resolve(dirname(source), "README.md"),
      resolve(dirname(destination), "README.md"),
    );
  }
  if (standaloneEntry) {
    const generated = `<!-- Generated by ./prototype.sh ${id} from prototype.html. -->`;
    html = html.replace(/<!doctype html>/i, `$&\n${generated}`);
  }
  if (Buffer.byteLength(html) > previewByteLimit) {
    throw new Error(`原型超过 AgentHub 文件预览的 1 MiB 上限：${id}`);
  }
  if (standaloneEntry)
    await writeFile(resolve(sourceRoot, pageFilename(id)), html);
  await writeFile(destination, html);
}

async function exportCatalog(resolveConfig) {
  const html = await bundlePage(
    resolve(sourceRoot, "catalog.html"),
    resolveConfig,
  );
  const generated =
    "<!-- Generated by ./prototype.sh from catalog.html, catalog.json, catalog.css and catalog.mjs. -->";
  const catalog = (directory) =>
    html
      .replace(/<!doctype html>/i, `$&\n${generated}`)
      .replace("<html ", `<html data-preview-directory="${directory}" `);
  await writeFile(resolve(sourceRoot, "index.html"), catalog("./dist/"));
  await writeFile(resolve(outputRoot, "index.html"), catalog("./"));
}

try {
  const [id = "index", layout] = process.argv.slice(2);
  const entry = new URL(prototypePath(id, layout), "https://example.invalid");
  const prototype = prototypes.find((item) => item.id === id);
  const { resolve: resolveConfig } = productViteConfig(root);
  if (id === "index") {
    for (const item of prototypes) {
      if (item.path && !item.branch) await exportPage(item, resolveConfig);
    }
    await mkdir(outputRoot, { recursive: true });
    await exportCatalog(resolveConfig);
  } else {
    await exportPage(prototype, resolveConfig);
  }
  const directory =
    id === "index" || prototype?.standaloneEntry ? sourceRoot : outputRoot;
  const target = pathToFileURL(resolve(directory, pageFilename(id)));
  target.search = entry.search;
  console.log(target.href);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
