import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".scratch/agent-hub-v1");
const issuesDirectory = join(root, "issues");
const statusPath = join(root, "status.md");

function readStatuses() {
  const statuses = new Map();
  for (const file of readdirSync(issuesDirectory).filter((name) =>
    name.endsWith(".md"),
  )) {
    const match = file.match(/^([DB]\d{2})-/);
    if (!match) continue;
    const contents = readFileSync(join(issuesDirectory, file), "utf8");
    const status = contents.match(/^Status:\s*(\w+)/m)?.[1];
    if (!status) throw new Error(`${file} is missing a Status field`);
    statuses.set(match[1], status);
  }
  return statuses;
}

function readIndex() {
  const contents = readFileSync(statusPath, "utf8");
  const rows = new Map();
  for (const line of contents.split("\n")) {
    const columns = line.split("|").map((value) => value.trim());
    if (columns.length < 5 || !/^[DB]\d{2}$/.test(columns[1])) continue;
    rows.set(columns[1], columns[3].replaceAll("`", ""));
  }
  const totalLine = contents
    .split("\n")
    .find((line) => /^\| 合计\s+\|/.test(line));
  const total = totalLine
    ?.split("|")
    .slice(2, 6)
    .map((value) => Number.parseInt(value.trim(), 10));
  return { rows, total };
}

const statuses = readStatuses();
const { rows: index, total } = readIndex();
const errors = [];
for (const [id, status] of statuses) {
  if (index.get(id) !== status)
    errors.push(`${id}: issue=${status}, index=${index.get(id) ?? "missing"}`);
}
for (const id of index.keys()) {
  if (!statuses.has(id))
    errors.push(`${id}: status index row has no issue file`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const counts = { resolved: 0, claimed: 0, open: 0 };
for (const status of statuses.values())
  counts[status] = (counts[status] ?? 0) + 1;
const expectedTotal = [
  counts.resolved,
  counts.claimed,
  counts.open,
  statuses.size,
];
if (!total || total.some((value, index) => value !== expectedTotal[index])) {
  console.error(
    `Summary counts are stale: expected ${expectedTotal.join("/")}, found ${total?.join("/") ?? "missing"}`,
  );
  process.exit(1);
}
console.log(
  `Task status index is consistent (${statuses.size} tasks): ${JSON.stringify(counts)}`,
);
