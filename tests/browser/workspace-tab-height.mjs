// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
// Run: node tests/browser/workspace-tab-height.mjs
import assert from "node:assert/strict";

async function request(path, body) {
  const response = await fetch(`http://localhost:3456${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  assert.ok(response.ok);
  return response.json();
}
const { targetId } = await request(
  "/new",
  "http://127.0.0.1:1420/tests/browser/product-preview.html?view=worktree",
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
async function waitFor(code) {
  const deadline = Date.now() + 30000;
  while (!(await evaluate(code))) {
    assert.ok(Date.now() < deadline, "Workspace fixture did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
try {
  await waitFor('Boolean(document.querySelector("[role=tab]"))');
  await evaluate(
    '[...document.querySelectorAll("button")].find(e => e.textContent === "README.md").click()',
  );
  await waitFor('document.querySelectorAll("[role=tab]").length === 2');
  for (const theme of ["light", "dark"]) {
    for (const scale of [1, 1.2]) {
      await evaluate(
        `document.documentElement.classList.toggle("dark", ${theme === "dark"}); document.documentElement.style.zoom = "${scale}"`,
      );
      for (const active of [0, 1]) {
        await evaluate(
          `document.querySelectorAll("[role=tab]")[${active}].click()`,
        );
        await waitFor(
          `document.querySelectorAll("[role=tab]")[${active}].getAttribute("aria-selected") === "true"`,
        );
        const aligned = await evaluate(`(() => {
          const tabs = [...document.querySelectorAll("[role=tab]")];
          const boxes = tabs.map(tab => [tab.parentElement, tab, tab.parentElement.querySelector("button:last-child")].map(el => el.getBoundingClientRect()));
          return boxes[0].every((box, index) =>
            Math.abs(box.top - boxes[1][index].top) < 0.1 &&
            Math.abs(box.bottom - boxes[1][index].bottom) < 0.1);
        })()`);
        assert.equal(
          aligned,
          true,
          `${theme}, scale ${scale}, active tab ${active}`,
        );
      }
    }
  }
  console.log(
    "PASS: terminal and file tabs align in both themes, scales and selection states",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
