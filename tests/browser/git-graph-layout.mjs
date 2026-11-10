// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
import assert from "node:assert/strict";

async function request(path, body) {
  const response = await fetch(`http://localhost:3456${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  assert.ok(response.ok);
  const result = await response.json();
  assert.equal(result.error, undefined, result.error);
  return result;
}
const { targetId } = await request(
  "/new",
  "http://127.0.0.1:1420/tests/browser/git-graph-refs.html",
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
try {
  const deadline = Date.now() + 15000;
  while (
    !(await evaluate(
      'document.querySelectorAll("[data-commit-index]").length === 4',
    ))
  ) {
    assert.ok(Date.now() < deadline, "Graph preview did not load");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const dark of [true, false])
    for (const scale of [1, 1.2])
      for (const width of [780, 1400]) {
        await evaluate(`document.documentElement.classList.toggle('dark', ${dark});
          document.documentElement.style.zoom='${scale}';
          document.documentElement.style.setProperty('--app-scale','${scale}');
          document.getElementById('root').style.width='${width}px';true`);
        assert.equal(
          await evaluate(`(() => {
          const buttons = [...document.querySelectorAll('[data-commit-index]')];
          return buttons.every(button => {
            const row = button.closest('tr');
            const cell = row.cells[1].getBoundingClientRect();
            const date = row.cells[2].getBoundingClientRect();
            const rect = button.getBoundingClientRect();
            const refs = button.querySelector('.git-graph-refs');
            const summary = button.lastElementChild;
            return rect.right <= cell.right && rect.right <= date.left &&
              summary.getBoundingClientRect().right <= rect.right + 1 &&
              Math.abs(row.getBoundingClientRect().height - 30 * ${scale}) < 1 &&
              (!refs || (refs.getBoundingClientRect().width <= rect.width * 0.61 &&
                getComputedStyle(refs).overflowX === 'auto'));
          }) && buttons[2].querySelector('.git-graph-refs').scrollWidth >
            buttons[2].querySelector('.git-graph-refs').clientWidth &&
            buttons[3].lastElementChild.textContent.endsWith('…');
        })()`),
          true,
          `${dark ? "dark" : "light"}, ${scale}, ${width}: message and refs stay before metadata`,
        );
      }
  await evaluate("document.getElementById('root').style.width='780px';true");
  assert.equal(
    await evaluate(`(() => {
    const badge = [...document.querySelectorAll('[data-commit-index="2"] [data-graph-ref]')].find(badge => badge.title.includes('abcdef0123456789'.repeat(12)));
    badge.focus();
    return badge.title.includes('abcdef0123456789'.repeat(12)) &&
      document.activeElement === badge && badge.getBoundingClientRect().right <=
        badge.closest('.git-graph-refs').getBoundingClientRect().right + 1;
  })()`),
    true,
    "Long refs retain the full title and can be reached with focus",
  );
  console.log(
    "PASS: graph columns do not overlap in 8 theme/scale/width combinations; long refs remain accessible",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
