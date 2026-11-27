import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repositoryRoot } from "../../scripts/shared/paths.mjs";

const [directory, tag, revision] = process.argv.slice(2);
const sdkFile = (name) => new URL(name, import.meta.url);
const version = readFileSync(sdkFile("./VERSION"), "utf8").trim();
if (
  !directory ||
  tag !== `sdk-v${version}` ||
  !/^\d+\.\d+\.\d+$/.test(version) ||
  !/^[0-9a-f]{40}$/.test(revision)
)
  throw new Error(
    "Pass an SDK asset directory, matching sdk-v tag and source SHA",
  );

const stem = `agent-hub-sdk-${version}`;
const archive = `${stem}.tar.gz`;
const assets = [
  archive,
  `${archive}.sha256`,
  `${stem}-manifest.json`,
  `${stem}-RELEASE-NOTES.md`,
];
const copies = {
  [`${stem}-README.md`]: "README.md",
  [`${stem}-install.mjs`]: "install.mjs",
  [`${stem}-build-product.mjs`]: "build-product.mjs",
};
assets.push(...Object.keys(copies));
if (
  JSON.stringify(readdirSync(directory).sort()) !==
    JSON.stringify(assets.sort()) ||
  assets.some((file) => !lstatSync(join(directory, file)).isFile())
)
  throw new Error("SDK release asset list does not match");

const read = (name) => readFileSync(join(directory, name));
const digest = createHash("sha256").update(read(archive)).digest("hex");
const manifest = JSON.parse(read(`${stem}-manifest.json`));
const appVersion = readFileSync(join(repositoryRoot, "VERSION"), "utf8").trim();
if (
  manifest.version !== version ||
  manifest.appVersion !== appVersion ||
  manifest.revision !== revision ||
  manifest.preview !== false ||
  manifest.file !== archive ||
  manifest.sha256 !== digest ||
  read(`${archive}.sha256`).toString().trimEnd() !== `${digest}  ${archive}`
)
  throw new Error(
    "SDK release manifest does not match the tag, commit or archive",
  );

const readArchive = (file) =>
  execFileSync("tar", [
    "-xOzf",
    join(directory, archive),
    `agent-hub-sdk/${file}`,
  ]);
for (const [file, expected] of Object.entries({
  SDK_VERSION: version,
  SDK_REVISION: revision,
  VERSION: appVersion,
})) {
  if (readArchive(file).toString().trim() !== expected)
    throw new Error(`SDK archive identity mismatch: ${file}`);
}
for (const [asset, source] of Object.entries(copies)) {
  if (!read(asset).equals(readFileSync(sdkFile(source))))
    throw new Error(`SDK asset does not match release source: ${asset}`);
}
if (
  !readArchive("README.md").equals(read(`${stem}-README.md`)) ||
  !readArchive("RELEASE-NOTES.md").equals(read(`${stem}-RELEASE-NOTES.md`))
)
  throw new Error("SDK archive documentation does not match release assets");

process.stdout.write(`Verified ${stem} from ${revision}\n`);
