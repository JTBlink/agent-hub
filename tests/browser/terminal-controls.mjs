// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
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
  "http://127.0.0.1:1420/tests/browser/terminal-controls.html",
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
const inside = (code) =>
  evaluate(
    `(() => { const document = globalThis.document.querySelector('iframe').contentDocument; const window = document.defaultView; return eval(${JSON.stringify(code)}); })()`,
  );
async function waitFor(code) {
  const deadline = Date.now() + 20000;
  while (!(await evaluate(code))) {
    assert.ok(Date.now() < deadline, "Terminal controls did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
try {
  await evaluate(
    `document.querySelector('#root').style.display='none'; const frame=document.createElement('iframe'); frame.style.cssText='position:fixed;inset:0;border:0;width:1000px;height:720px'; frame.src='/tests/browser/terminal-controls.html';document.body.append(frame);`,
  );
  await waitFor(
    `Boolean(document.querySelector('iframe').contentDocument?.querySelector('[role=tab]'))`,
  );
  assert.ok(
    await inside(`(() => {
    const graph=[...document.querySelectorAll('[role=tab]')].find(tab=>tab.textContent==='Git Graph');
    return graph && graph.closest('[role=tablist]') === document.querySelector('[role=tab]').closest('[role=tablist]') && document.querySelectorAll('[role=tablist]').length===1;
  })()`),
  );
  await inside(
    `[...document.querySelectorAll('[role=tab]')].find(tab=>tab.textContent==='Git Graph').click()`,
  );
  assert.equal(
    await inside(
      `document.querySelector('[role=tab][aria-selected=true]').textContent`,
    ),
    "Git Graph",
  );
  await inside(`document.querySelector('[role=tab]').click()`);
  for (const theme of ["light", "dark"]) {
    for (const scale of [1, 1.2]) {
      for (const width of [420, 1000]) {
        await evaluate(
          `document.querySelector('iframe').style.width='${width}px'`,
        );
        await inside(
          `document.documentElement.classList.toggle('dark', ${theme === "dark"}); document.documentElement.style.zoom='${scale}';document.documentElement.style.setProperty('--app-scale','${scale}');`,
        );
        const compact = await inside(`(() => {
          const surface = document.querySelector('[data-terminal-surface]').getBoundingClientRect();
          const bar = document.querySelector('[data-terminal-surface] nav');
          const rect = bar.getBoundingClientRect();
          const content = document.querySelector('[data-terminal-content]').getBoundingClientRect();
          const buttons = [...bar.querySelectorAll('button')];
          return {
            docked: window.getComputedStyle(bar).position !== 'absolute' && Math.abs(rect.bottom - surface.bottom) < 2,
            compactHeight: rect.height <= 29 * ${scale},
            fits: rect.left >= surface.left && rect.right <= surface.right,
            contentClear: content.bottom <= rect.top,
            buttonsFit: buttons.every(button => { const r = button.getBoundingClientRect(); return r.left >= rect.left && r.right <= rect.right; }),
          };
        })()`);
        assert.deepEqual(
          compact,
          {
            docked: true,
            compactHeight: true,
            fits: true,
            contentClear: true,
            buttonsFit: true,
          },
          `Compact terminal controls ${theme}/${scale}/${width}`,
        );
        await inside(
          `document.querySelector('button[aria-label=Herdr]').click()`,
        );
        assert.equal(
          await inside(`document.querySelector('[role=menu]')`),
          null,
        );
        assert.ok(
          await inside(
            `Number(document.querySelector('[data-launches]').getAttribute('data-launches')) > 0`,
          ),
        );
        assert.ok(
          await inside(
            `Boolean(document.querySelector('button[aria-label=Herdr] [role=img]'))`,
          ),
        );
        await inside(
          `document.querySelector('[role=tab]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:${width - 3},clientY:717}))`,
        );
        const rename = await inside(
          `(() => { const rect=document.querySelector('[role=menu]').getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}; })()`,
        );
        assert.ok(
          rename.left >= 0 &&
            rename.right <= width + 1 &&
            rename.top >= 0 &&
            rename.bottom <= 721,
        );
        await inside(`document.querySelector('[role=menuitem]').click()`);
        assert.ok(
          await inside(
            `document.activeElement === document.querySelector('input')`,
          ),
        );
        await inside(
          `document.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape'}))`,
        );
        assert.equal(
          await inside(`document.querySelector('[role=tab]').textContent`),
          "herdr-default",
        );
      }
    }
  }
  await inside(
    `document.querySelector('[role=tab]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:35}))`,
  );
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-terminal-controls.png`,
  );
  console.log(
    "Terminal controls: themes, zoom, narrow layouts, default session launcher, update indicator and rename menu passed",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
