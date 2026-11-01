// Requires Vite on :1420 and the shared web-access CDP proxy on :3456.
import assert from "node:assert/strict";
async function request(path, body) {
  return (
    await fetch(`http://localhost:3456${path}`, {
      method: body === undefined ? "GET" : "POST",
      body,
    })
  ).json();
}
const { targetId } = await request(
  "/new",
  "http://127.0.0.1:1420/tests/browser/product-preview.html?view=worktree",
);
async function evaluate(code) {
  const result = await request(`/eval?target=${targetId}`, code);
  assert.equal(result.error, undefined, JSON.stringify(result));
  return result.value;
}
async function until(code) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(code)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Preview not ready: ${code}`);
}
try {
  await until("!!document.querySelector('footer')");
  await evaluate(
    `document.querySelector('#root').style.visibility='hidden';const frame=document.createElement('iframe');frame.id='worktree-preview';frame.style.cssText='position:fixed;inset:0;width:960px;height:760px;border:0';document.body.append(frame);true`,
  );
  const doc = "document.querySelector('#worktree-preview').contentDocument";
  for (const long of [false, true]) {
    await evaluate(
      `document.querySelector('#worktree-preview').src='/tests/browser/product-preview.html?view=worktree${long ? "&longWorktrees" : ""}';true`,
    );
    await until(
      `(()=>{const d=${doc};return d?.readyState==='complete'&&!!d.querySelector('footer')&&!d.querySelector('header [role=combobox]')?.disabled})()`,
    );
    for (const theme of ["light", "dark"]) {
      for (const scale of [1, 1.2]) {
        await evaluate(
          `(()=>{const d=${doc};d.documentElement.classList.toggle('dark',${theme === "dark"});d.documentElement.style.zoom='${scale}';d.documentElement.style.setProperty('--app-scale','${scale}');d.querySelector('header [role=combobox]').click();return true})()`,
        );
        await until(`!!${doc}.querySelector('[role=listbox]')`);
        const metrics = await evaluate(
          `(()=>{const d=${doc},m=d.querySelector('[role=listbox]'),r=m.getBoundingClientRect(),w=d.defaultView,items=[...m.querySelectorAll('[role=option]')];return {count:items.length,fits:r.left>=0&&r.right<=w.innerWidth&&r.bottom<=w.innerHeight,scroll:m.scrollHeight>m.clientHeight+1,rowsFit:items.every(e=>e.getBoundingClientRect().height<=36*${scale}+1),labelsFit:items.every(e=>{const s=e.lastElementChild;return s.scrollWidth<=s.clientWidth+1}),headerHeight:d.querySelector('header').getBoundingClientRect().height}})()`,
        );
        assert.equal(metrics.count, long ? 10 : 3);
        assert.equal(metrics.fits, true, JSON.stringify(metrics));
        assert.equal(metrics.scroll, false, JSON.stringify(metrics));
        assert.equal(metrics.rowsFit, true, JSON.stringify(metrics));
        assert.equal(metrics.labelsFit, true, JSON.stringify(metrics));
        assert.ok(
          Math.abs(metrics.headerHeight - 36) < 0.2,
          JSON.stringify(metrics),
        );
        await evaluate(
          `(()=>{const d=${doc};d.querySelector('header [role=combobox]').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true})()`,
        );
        await until(`!${doc}.querySelector('[role=listbox]')`);
      }
    }
  }
  console.log(
    "PASS: complete worktree labels and all 3/10 rows at 960px, both themes, 100%/120%, with unchanged titlebar height.",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
