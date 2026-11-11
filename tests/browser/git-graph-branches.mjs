// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
// Run: node tests/browser/git-graph-branches.mjs
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
  "http://127.0.0.1:1420/tests/browser/git-history.html?graph&branches&language=zh",
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
async function wait(code) {
  const deadline = Date.now() + 15000;
  while (!(await evaluate(code))) {
    assert.ok(Date.now() < deadline, `Timed out: ${code}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const open = () =>
  evaluate(`document.querySelector('button[role="combobox"]').click();true`);
const type = (value) =>
  evaluate(`(() => {
  const input = document.querySelector('input[role="combobox"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', {bubbles:true}));return true;
})()`);
const key = (value) =>
  evaluate(
    `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true,cancelable:true}));true`,
  );
try {
  await wait(`!!document.querySelector('[data-commit-index]')`);
  for (const dark of [true, false]) {
    for (const scale of [1, 1.2]) {
      await evaluate(
        `document.documentElement.classList.toggle('dark',${dark});document.documentElement.style.zoom='${scale}';document.documentElement.style.setProperty('--app-scale','${scale}');document.getElementById('root').style.width='620px';true`,
      );
      await open();
      await wait(
        `document.activeElement === document.querySelector('input[role="combobox"]')`,
      );
      assert.equal(
        await evaluate(`document.querySelectorAll('[role="option"]').length`),
        61,
      );
      assert.equal(
        await evaluate(`(() => {
        const list = document.querySelector('[role="listbox"]').parentElement;
        const rect = list.getBoundingClientRect();
        return rect.left>=0 && rect.right<=innerWidth+1 && rect.bottom<=innerHeight+1 && rect.top>=0 && list.scrollHeight>list.clientHeight;
      })()`),
        true,
        `Menu bounds ${dark}/${scale}`,
      );
      await evaluate(
        `document.querySelector('[role="listbox"]').parentElement.scrollTop=500;true`,
      );
      assert.equal(
        await evaluate(`(() => {
        const input = document.querySelector('input[role="combobox"]').getBoundingClientRect();
        const menu = document.querySelector('[role="listbox"]').parentElement.getBoundingClientRect();
        return input.top>=menu.top && input.bottom<=menu.bottom;
      })()`),
        true,
        "Search stays visible while scrolling",
      );
      await type("ORIGIN/TOPIC/29");
      await wait(`document.querySelectorAll('[role="option"]').length===1`);
      await key("Enter");
      await wait(`!document.querySelector('[role="listbox"]')`);
      assert.equal(
        await evaluate(
          `document.querySelector('button[role="combobox"]').textContent`,
        ),
        "origin/topic/29",
      );
      assert.equal(
        await evaluate(
          `document.activeElement===document.querySelector('button[role="combobox"]')`,
        ),
        true,
      );
      await open();
      await type("no-such-branch");
      await wait(`!!document.querySelector('[role="status"]')`);
      assert.equal(
        await evaluate(`document.querySelectorAll('[role="option"]').length`),
        0,
      );
      await evaluate(
        `document.querySelector('button[aria-label="清空分支搜索"]').click();true`,
      );
      await wait(`document.querySelectorAll('[role="option"]').length===61`);
      await key("Escape");
      assert.equal(
        await evaluate(
          `document.querySelector('button[role="combobox"]').textContent`,
        ),
        "origin/topic/29",
      );
      await evaluate(
        `document.querySelector('input[type="checkbox"]').click();true`,
      );
      await wait(
        `document.querySelector('button[role="combobox"]').textContent==='全部分支'`,
      );
      await open();
      await wait(`document.querySelectorAll('[role="option"]').length===31`);
      assert.equal(
        await evaluate(
          `[...document.querySelectorAll('[role="option"]')].every(option=>!option.textContent.startsWith('origin/'))`,
        ),
        true,
      );
      await key("Escape");
      await evaluate(
        `document.querySelector('input[type="checkbox"]').click();true`,
      );
      await wait(`document.querySelector('input[type="checkbox"]').checked`);
    }
  }
  await open();
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-git-branches.png`,
  );
  console.log(
    "PASS: branch search/clear/empty/selection, sticky input, keyboard focus, remote visibility and menu bounds in both themes at 100%/120%",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
