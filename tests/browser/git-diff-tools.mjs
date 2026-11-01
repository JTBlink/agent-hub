// Requires Vite on :1420 and the shared web-access browser proxy on :3456.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
async function request(path, body) {
  return (
    await fetch("http://localhost:3456" + path, {
      method: body === undefined ? "GET" : "POST",
      body,
    })
  ).json();
}
const url =
  "http://127.0.0.1:1420/tests/browser/product-preview.html?view=git&wrap-diff";
const { targetId: target } = await request("/new", url);
const screenshot = join(tmpdir(), "agent-hub-git-diff-tools.png");
try {
  const evaluate = async (code) => {
    const result = await request("/eval?target=" + target, code);
    assert.equal(result.error, undefined, JSON.stringify(result));
    return result.value;
  };
  const frame = () =>
    request(
      "/screenshot?target=" +
        target +
        "&file=" +
        encodeURIComponent(screenshot),
    );
  async function until(code) {
    for (let i = 0; i < 50; i++) {
      await frame();
      if (await evaluate(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error("Timed out: " + code);
  }
  const click = (label) =>
    evaluate(
      `document.querySelector('button[aria-label="${label}"]').click();true`,
    );
  await until(
    `!!document.querySelector('button[aria-label="未暂存: src/parser.rs"]')`,
  );
  await click("未暂存: src/parser.rs");
  await until(`document.querySelectorAll('.cm-editor').length===2`);
  assert.equal(
    await evaluate(
      `document.querySelectorAll('[role="toolbar"] button').length`,
    ),
    7,
  );
  await click("下一处更改");
  assert.ok(
    await evaluate(
      `document.querySelector('[role="toolbar"] [role="status"]').textContent==='1/2'`,
    ),
  );
  await click("下一处更改");
  assert.ok(
    await evaluate(
      `document.querySelector('[role="toolbar"] [role="status"]').textContent==='2/2'`,
    ),
  );
  await click("上一处更改");
  await click("自动换行");
  await until(`document.querySelectorAll('.cm-lineWrapping').length===2`);
  await until(
    `(()=>{const y=[...document.querySelectorAll('.cm-content')].map(c=>[...c.querySelectorAll('.cm-line')].find(e=>e.textContent==='middle')?.getBoundingClientRect().top);return y.length===2&&y.every(Number.isFinite)&&Math.abs(y[0]-y[1])<1})()`,
  );
  assert.ok(
    await evaluate(
      `[...document.querySelectorAll('.cm-scroller')].every(e=>e.scrollWidth<=e.clientWidth)`,
    ),
  );
  await click("显示空白字符");
  await until(`document.querySelectorAll('.cm-highlightSpace').length>0`);
  await click("差异滚动概览");
  assert.equal(
    await evaluate(`document.querySelectorAll('[role="scrollbar"]').length`),
    0,
  );
  await click("差异滚动概览");
  await click("并排");
  await until(`document.querySelectorAll('.cm-editor').length===1`);
  await click("下一处更改");
  assert.ok(
    await evaluate(
      `document.querySelector('[role="toolbar"] [role="status"]').textContent==='1/2'`,
    ),
  );
  await click("并排");
  await until(`document.querySelectorAll('.cm-editor').length===2`);

  const separator = `document.querySelector('[role="separator"][aria-orientation="horizontal"]')`;
  const key = (key) =>
    evaluate(
      `${separator}.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true}));true`,
    );
  await key("Home");
  const small = await evaluate(
    `document.getElementById(${separator}.getAttribute('aria-controls')).clientHeight`,
  );
  await key("End");
  const large = await evaluate(
    `document.getElementById(${separator}.getAttribute('aria-controls')).clientHeight`,
  );
  assert.ok(large > small + 100);
  await evaluate(
    `document.querySelector('.git-history button[aria-expanded]').click();true`,
  );
  await until(`${separator}.getAttribute('aria-disabled')==='true'`);
  assert.ok(
    await evaluate(`document.querySelector('.git-history').clientHeight<50`),
  );
  await evaluate(
    `document.querySelector('.git-history button[aria-expanded]').click();true`,
  );
  await evaluate(
    `${separator}.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));true`,
  );
  await until(`${separator}.getAttribute('aria-valuenow')==='60'`);
  await key("ArrowUp");
  const saved = await evaluate(`${separator}.getAttribute('aria-valuenow')`);
  await request("/navigate?target=" + target, url);
  await until(`!!${separator}`);
  assert.equal(
    await evaluate(`${separator}.getAttribute('aria-valuenow')`),
    saved,
  );
  await click("未暂存: src/parser.rs");
  await until(`document.querySelectorAll('.cm-editor').length===2`);
  await frame();
  await evaluate(
    `(()=>{document.querySelector('#root').style.visibility='hidden';const frame=document.createElement('iframe');frame.id='diff-tools-preview';frame.style.cssText='position:fixed;inset:0;width:1100px;height:760px;border:0;z-index:99999';frame.src='/tests/browser/product-preview.html?view=git&wrap-diff&theme=light&text-size=xlarge&language=en';document.body.append(frame);return true})()`,
  );
  await until(
    `!!document.querySelector('#diff-tools-preview').contentDocument?.querySelector('button[title="src/parser.rs"]')`,
  );
  await evaluate(
    `document.querySelector('#diff-tools-preview').contentDocument.querySelector('button[title="src/parser.rs"]').click();true`,
  );
  await until(
    `document.querySelector('#diff-tools-preview').contentDocument.querySelectorAll('.cm-editor').length===2`,
  );
  await evaluate(
    `document.querySelector('#diff-tools-preview').contentDocument.querySelector('button[aria-label="Word wrap"]').click();true`,
  );
  await until(
    `(()=>{const d=document.querySelector('#diff-tools-preview').contentDocument;const y=[...d.querySelectorAll('.cm-content')].map(c=>[...c.querySelectorAll('.cm-line')].find(e=>e.textContent==='middle')?.getBoundingClientRect().top);return y.every(Number.isFinite)&&Math.abs(y[0]-y[1])<1&&d.documentElement.scrollWidth<=d.documentElement.clientWidth})()`,
  );
  assert.ok(
    await evaluate(
      `(()=>{const d=document.querySelector('#diff-tools-preview').contentDocument;return d.querySelector('[role="toolbar"]').getBoundingClientRect().right<=1100&&[...d.querySelectorAll('.cm-scroller')].every(e=>e.scrollWidth<=e.clientWidth)})()`,
    ),
  );
  await request(
    "/screenshot?target=" +
      target +
      "&file=" +
      encodeURIComponent(join(tmpdir(), "agent-hub-git-diff-tools-light.png")),
  );
  await evaluate(
    `document.querySelector('#diff-tools-preview').remove();document.querySelector('#root').style.visibility='';true`,
  );
  await frame();
  console.log(
    "PASS: diff toolbar, wrapping with aligned rows, whitespace, overview, both layouts; sidebar limits, collapse and persistence.",
  );
  console.log(screenshot);
} finally {
  await request("/close?target=" + target);
}
