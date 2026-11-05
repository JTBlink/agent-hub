import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { previewAgentCommand } from "./previewAgentCommand";

it("preserves complete multiline prompts, quoted paths and configured argv when the copied script runs", () => {
  const root = mkdtempSync(join(tmpdir(), "preview-command-"));
  try {
    const log = join(root, "calls.jsonl");
    writeFileSync(
      join(root, "herdr"),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PREVIEW_TEST_LOG, JSON.stringify(args) + '\\n');
if (args.includes('create')) console.log(JSON.stringify({result:{root_pane:{pane_id:'test:pane'}}}));
`,
      { mode: 0o755 },
    );
    const prompt =
      "- Fix 'button'\nKeep $(printf injected) and `printf injected` literally.";
    const path = "/workspace/design 'one'";
    const command = previewAgentCommand({
      session: "default",
      path,
      title: "Example",
      prompt,
      launch: {
        kind: "codex",
        program: "codex",
        arguments: ["--model", "custom 'model' $(printf injected)"],
      },
    });
    const result = spawnSync("sh", ["-c", command], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${root}${delimiter}${process.env.PATH}`,
        PREVIEW_TEST_LOG: log,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    const calls = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls[0]).toEqual([
      "--session",
      "default",
      "workspace",
      "create",
      "--cwd",
      path,
      "--label",
      "Example",
      "--no-focus",
    ]);
    expect(calls[1].slice(-3)).toEqual([
      "--",
      "--model",
      "custom 'model' $(printf injected)",
    ]);
    expect(calls[2]).toEqual([
      "--session",
      "default",
      "agent",
      "prompt",
      "test:pane",
      `\n${prompt}`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("reuses a precise existing pane and does not include a startup command", () => {
  const command = previewAgentCommand({
    session: "default",
    pane: "w1:p2",
    path: "/workspace/site",
    title: "Page",
    prompt: "Full feedback",
    launch: { kind: "codex", program: "codex", arguments: [] },
  });
  expect(command).toBe(
    "herdr --session 'default' agent prompt 'w1:p2' 'Full feedback'",
  );
});
it("keeps custom executables instead of substituting Herdr's canonical binary", () => {
  const command = previewAgentCommand({
    session: "default",
    path: "/workspace/site",
    title: "Page",
    prompt: "Feedback",
    launch: {
      kind: "codex",
      program: "/tools/custom codex",
      arguments: ["--configured"],
    },
  });
  expect(command).toContain("pane run");
  expect(command).toContain("/tools/custom codex");
  expect(command).toContain("--configured");
  expect(command).not.toContain("agent start");
});
