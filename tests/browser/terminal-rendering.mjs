// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
// Run: node tests/browser/terminal-rendering.mjs
import assert from "node:assert/strict";

const proxy = "http://localhost:3456";
const page = "http://127.0.0.1:1420/tests/browser/terminal-rendering.html";
async function request(path, body) {
  const response = await fetch(`${proxy}${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  assert.ok(response.ok, `Browser proxy returned ${response.status}`);
  return response.json();
}
const { targetId } = await request("/new", page);
const evaluate = (code) => request(`/eval?target=${targetId}`, code);
try {
  const deadline = Date.now() + 30000;
  while (
    !(
      await evaluate("typeof window.runTerminalRenderingRegression")
    ).value?.includes("function")
  ) {
    assert.ok(Date.now() < deadline, "Rendering fixture did not load");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await evaluate(
    'window.runTerminalRenderingRegression().then(result => window.regressionResult = result).catch(error => window.regressionResult = {error: String(error)}); "started"',
  );
  let result;
  while (!result) {
    result = (await evaluate("window.regressionResult")).value;
    assert.ok(Date.now() < deadline, "Rendering regression timed out");
    if (!result) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(
    result.sessionMenuFits,
    true,
    "Single-session menu must fit without scrolling",
  );
  assert.equal(
    result.noOuterInsets,
    true,
    "Terminal content has outer top or side padding",
  );
  assert.equal(
    result.gutterMatchesBackground,
    true,
    "Scrollbar gutter shows a black background",
  );
  assert.equal(
    result.gridFits,
    true,
    "Terminal grid clips the last row or column at default or enlarged text size",
  );
  assert.equal(
    result.cacheStable,
    true,
    "Opening a peer pane corrupted existing glyphs",
  );
  assert.equal(
    result.iconsReady,
    true,
    "Private-use icons are missing from the bundled primary font",
  );
  assert.equal(
    result.iconPixelsCorrect,
    true,
    "Terminal icons differ from the bundled symbol glyphs",
  );
  assert.equal(result.created, 2, "A PTY was unexpectedly recreated");
  assert.equal(result.closed, 0, "An existing PTY was closed");
  assert.equal(
    result.webglPanes,
    2,
    "Both panes must use real WebGL renderers",
  );
  console.log(
    "PASS: bundled icons match pixels in all ANSI styles; peer pane preserves pixels; real WebGL; both PTYs retained",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
