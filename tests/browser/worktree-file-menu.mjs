// Requires Vite on :1420 and the shared web-access CDP proxy on :3456.
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
  "http://127.0.0.1:1420/tests/browser/worktree-file-menu.html",
);
async function evaluate(code) {
  const result = await request(`/eval?target=${targetId}`, code);
  assert.equal(result.error, undefined, JSON.stringify(result));
  return result.value;
}
const inside = (code) =>
  evaluate(
    `(() => { const document = globalThis.document.querySelector('iframe').contentDocument; const window = document.defaultView; return eval(${JSON.stringify(code)}); })()`,
  );
async function until(code) {
  const deadline = Date.now() + 15000;
  while (!(await inside(code))) {
    assert.ok(Date.now() < deadline, `Fixture not ready: ${code}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const context = (selector) =>
  inside(
    `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new window.MouseEvent('contextmenu', {bubbles:true, cancelable:true, clientX:window.innerWidth-2, clientY:window.innerHeight-2})); true`,
  );
const choose = (index) =>
  inside(`document.querySelectorAll('[role=menuitem]')[${index}].click();true`);
const escape = () =>
  inside(
    `document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
  );
try {
  await evaluate(
    `document.querySelector('#root').style.display='none';const frame=document.createElement('iframe');frame.style.cssText='position:fixed;inset:0;border:0;width:960px;height:720px';frame.src='/tests/browser/worktree-file-menu.html';document.body.append(frame);true`,
  );
  await until(`!!document.querySelector('button[title="src"]')`);
  for (const theme of ["light", "dark"]) {
    for (const scale of [1, 1.2]) {
      for (const width of [420, 960]) {
        await evaluate(
          `document.querySelector('iframe').style.width='${width}px';true`,
        );
        await inside(
          `document.documentElement.classList.toggle('dark',${theme === "dark"});document.documentElement.style.zoom='${scale}';document.documentElement.style.setProperty('--app-scale','${scale}');true`,
        );
        await context('button[title="src"]');
        await until(`!!document.querySelector('[role=menu]')`);
        const layout = await inside(
          `(() => {const menu=document.querySelector('[role=menu]');const r=menu.getBoundingClientRect();return {fits:r.left>=0&&r.top>=0&&r.right<=window.innerWidth+1&&r.bottom<=window.innerHeight+1, background:window.getComputedStyle(menu).backgroundColor, items:menu.querySelectorAll('[role=menuitem]').length};})()`,
        );
        assert.ok(layout.fits, JSON.stringify({ theme, scale, width, layout }));
        assert.notEqual(layout.background, "rgba(0, 0, 0, 0)");
        assert.equal(layout.items, 8);
        await escape();
        assert.equal(await inside(`document.activeElement.title`), "src");
      }
    }
  }
  await inside(`document.querySelector('button[title="src"]').click();true`);
  await until(`!!document.querySelector('button[title="src/notes.md"]')`);
  await context('button[title="src"]');
  await choose(0);
  await until(`!!document.querySelector('dialog[open] input')`);
  await inside(
    `const input=document.querySelector('input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'draft.md');input.dispatchEvent(new window.Event('input',{bubbles:true}));true`,
  );
  await inside(`document.querySelector('form').requestSubmit();true`);
  await until(`!!document.querySelector('button[title="src/draft.md"]')`);
  assert.equal(
    await inside(`document.querySelector('[data-selected]').textContent`),
    "src/draft.md",
  );
  await context('button[title="src/draft.md"]');
  await choose(7);
  await until(`!!document.querySelector('dialog[open] input')`);
  await inside(
    `const input=document.querySelector('input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'renamed.md');input.dispatchEvent(new window.Event('input',{bubbles:true}));true`,
  );
  await inside(`document.querySelector('form').requestSubmit();true`);
  await until(`!!document.querySelector('button[title="src/renamed.md"]')`);
  assert.equal(
    await inside(`document.querySelector('[data-selected]').textContent`),
    "src/renamed.md",
  );
  await context('button[title="src/renamed.md"]');
  await choose(8);
  await until(`!!document.querySelector('[role=alertdialog]')`);
  assert.ok(
    await inside(`!!document.querySelector('button[title="src/renamed.md"]')`),
  );
  await inside(
    `const dialog=document.querySelector('[role=alertdialog]');[...dialog.querySelectorAll('button')].at(-1).click();true`,
  );
  await until(`!document.querySelector('button[title="src/renamed.md"]')`);
  assert.equal(
    await inside(`document.querySelector('[data-selected]').textContent`),
    "",
  );
  console.log(
    "Passed: menu theme, scale, narrow viewport, edge positioning, keyboard focus, create, rename, confirmed delete and file selection.",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
