import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const prototypes = JSON.parse(
  readFileSync(
    new URL("../../docs/prototypes/catalog.json", import.meta.url),
    "utf8",
  ),
);
export function prototypePath(id = "index", layout = "") {
  if (id === "index") {
    if (layout) throw new Error("每项原型仅保留一个方案，请移除 --layout 参数");
    return "/docs/prototypes/";
  }
  const entry = prototypes.find((item) => item.id === id);
  if (!entry)
    throw new Error(`未知原型：${id}，使用 ./prototype.sh --list 查看目录。`);
  if (entry.branch)
    throw new Error(
      `${entry.title}保存在 ${entry.branch} 分支（${entry.commit}），不会自动切换当前工作区。`,
    );
  if (layout) throw new Error("每项原型仅保留一个方案，请移除 --layout 参数。");
  const query = new URLSearchParams(entry.previewQuery);
  return entry.path + (query.size ? `?${query}` : "");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv[2] === "--list") {
      for (const entry of prototypes)
        console.log(`${entry.id.padEnd(17)} ${entry.title} · ${entry.status}`);
    } else console.log(prototypePath(process.argv[2], process.argv[3]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
