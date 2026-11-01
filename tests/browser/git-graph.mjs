// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
// Run: node tests/browser/git-graph.mjs
import assert from "node:assert/strict";
async function request(path, body) {
  const r = await fetch(`http://localhost:3456${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  assert.ok(r.ok);
  return r.json();
}
const { targetId } = await request(
  "/new",
  "http://127.0.0.1:1420/tests/browser/git-history.html?graph",
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
async function wait(code) {
  const deadline = Date.now() + 15000;
  while (!(await evaluate(code))) {
    assert.ok(Date.now() < deadline);
    await new Promise((r) => setTimeout(r, 100));
  }
}
try {
  await wait('!!document.querySelector("[data-commit-index]")');
  await evaluate('document.querySelector("[data-commit-index]").click()');
  await wait('!!document.querySelector(".git-commit-inspector")');
  assert.equal(
    await evaluate(
      'document.querySelector(".git-commit-inspector details").open',
    ),
    true,
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".git-commit-inspector").textContent.includes("user@example.invalid")',
    ),
    true,
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".git-commit-inspector").textContent.includes("+9 / −2")',
    ),
    true,
  );
  for (const light of [true, false])
    for (const size of ["default", "xlarge"]) {
      await evaluate(
        `document.documentElement.classList.toggle('dark',${!light});`,
      );
      await evaluate(
        `import('/src/lib/textScale.ts').then(m=>m.applyTextSize('${size}'))`,
      );
      assert.equal(
        await evaluate(
          `(()=>{const a=document.querySelector('tbody svg').getBoundingClientRect();const b=document.querySelector('[data-commit-index]').getBoundingClientRect();return Math.abs(a.height-b.height)<1;})()`,
        ),
        true,
      );
    }
  await evaluate(`document.querySelector('#root > div').style.width='620px';`);
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.git-commit-inspector')).gridTemplateColumns.split(' ').length`,
    ),
    1,
  );
  await evaluate(`document.querySelector('#root > div').style.width='';`);
  await evaluate(
    `document.querySelector('[data-commit-index]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));`,
  );
  await wait(`!!document.querySelector('[data-commit-index="199"]')`);
  assert.equal(
    await evaluate(`document.activeElement.getAttribute('data-commit-index')`),
    "199",
  );
  assert.ok(
    await evaluate(
      `document.querySelectorAll('[data-commit-index]').length < 80`,
    ),
  );
  console.log(
    "PASS: expanded commit identities/message/file statistics, themes/text scaling, windowed rows and keyboard End",
  );
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-git-graph.png`,
  );
} finally {
  await request(`/close?target=${targetId}`);
}
