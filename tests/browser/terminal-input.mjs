// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
// Run: node tests/browser/terminal-input.mjs [--input-events | --ime | --ime-composition | --chinese-composition]
import assert from "node:assert/strict";

const inputMode = process.argv.includes("--chinese-composition")
  ? "chinese-composition"
  : process.argv.includes("--ime-composition")
    ? "ime-composition"
    : process.argv.includes("--ime")
      ? "ime"
      : process.argv.includes("--input-events");
const proxy = "http://localhost:3456";
async function request(path, body) {
  const response = await fetch(`${proxy}${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  assert.ok(response.ok, `Browser proxy returned ${response.status}`);
  return response.json();
}
const { targetId } = await request(
  "/new",
  "http://127.0.0.1:1420/tests/browser/terminal-rendering.html",
);
const evaluate = (code) => request(`/eval?target=${targetId}`, code);
try {
  const deadline = Date.now() + 30000;
  while (
    !(
      await evaluate("typeof window.runTerminalInputRegression")
    ).value?.includes("function")
  ) {
    assert.ok(Date.now() < deadline, "Input fixture did not load");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await evaluate(
    `window.runTerminalInputRegression(${JSON.stringify(inputMode)}).then(result => window.inputResult = result).catch(error => window.inputResult = {error: String(error)}); "started"`,
  );
  let result;
  while (!result) {
    result = (await evaluate("window.inputResult")).value;
    assert.ok(Date.now() < deadline, "Input regression timed out");
    if (!result) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(
    result.complete,
    true,
    `Keystrokes were lost, duplicated or reordered: ${result.received ?? ""}`,
  );
  if (!inputMode)
    assert.equal(
      result.displayed,
      true,
      "The emulator did not echo the command",
    );
  assert.ok(
    result.writeCalls <= 3,
    "Queued keys waited for individual IPC calls",
  );
  assert.equal(result.created, 1, "The PTY was recreated");
  assert.equal(result.closed, 0, "The PTY was closed");
  console.log(
    `PASS: ${result.characters} keystrokes ${process.argv.includes("--input-events") || process.argv.includes("--ime") ? "generated" : "echoed"} in order, ${result.writeCalls} IPC writes, ${result.elapsed} ms (25 ms per IPC)`,
  );
} finally {
  await request(`/close?target=${targetId}`);
}
