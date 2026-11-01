// Requires Vite on :1420 and the web-access CDP proxy on :3456.
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
  "http://127.0.0.1:1420/tests/browser/product-preview.html?view=discover",
);
async function evaluate(code) {
  const result = await request(`/eval?target=${targetId}`, code);
  assert.equal(result.error, undefined, JSON.stringify(result));
  return result.value;
}
async function until(code) {
  const deadline = Date.now() + 30000;
  while (!(await evaluate(code))) {
    assert.ok(Date.now() < deadline, "Discover preview did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
try {
  await until("!!document.querySelector('.discovery-page')");
  await evaluate(`document.querySelector('#root').style.visibility='hidden';
    const frame=document.createElement('iframe');frame.id='discovery-preview';
    frame.style.cssText='position:fixed;inset:0;height:600px;border:0';
    document.body.append(frame);true`);
  for (const width of [640, 1440]) {
    for (const theme of ["light", "dark"]) {
      for (const scale of [1, 1.2]) {
        for (const kind of ["automations", "skills"]) {
          const context = `${width}/${theme}/${scale}/${kind}`;
          await evaluate(`(()=>{const f=document.querySelector('#discovery-preview');
            f.style.width='${width}px';f.src='/tests/browser/product-preview.html?view=discover&type=${kind}';return true})()`);
          const doc =
            "document.querySelector('#discovery-preview').contentDocument";
          await until(
            `(()=>{const d=${doc};return d?.readyState==='complete'&&!!d.querySelector('#discover-${kind}[aria-selected=true]')})()`,
          );
          await evaluate(`(()=>{const d=${doc};
            d.documentElement.classList.toggle('dark',${theme === "dark"});
            d.documentElement.style.zoom='${scale}';
            d.documentElement.style.setProperty('--app-scale','${scale}');return true})()`);
          const read = `(()=>{const d=${doc};const header=d.querySelector('.discovery-editor-header').getBoundingClientRect();
            const shell=d.querySelector('.workbench-editor-panel');const editor=shell.getBoundingClientRect();
            const style=d.defaultView.getComputedStyle(shell);const zoom=${scale};
            const panel=d.querySelector('[role=tabpanel]:not([hidden])');
            return {left:header.left-editor.left-parseFloat(style.borderLeftWidth)*zoom,
              right:editor.right-header.right-parseFloat(style.borderRightWidth)*zoom,
              top:header.top-editor.top-parseFloat(style.borderTopWidth)*zoom,
              headerTop:header.top,scrollTop:panel.scrollTop,overflow:d.documentElement.scrollWidth>d.documentElement.clientWidth}})()`;
          const before = await evaluate(read);
          for (const edge of ["left", "right", "top"])
            assert.ok(
              Math.abs(before[edge]) < 1,
              `${context}: header ${edge} gap: ${before[edge]}`,
            );
          assert.equal(
            before.overflow,
            false,
            `${context}: horizontal overflow`,
          );
          // Force overflow independently of fixture size; only the active panel should scroll.
          await evaluate(`(()=>{const d=${doc};const panel=d.querySelector('[role=tabpanel]:not([hidden])');
            const spacer=d.createElement('div');spacer.style.height='1500px';panel.append(spacer);
            panel.scrollTop=300;return true})()`);
          const after = await evaluate(read);
          assert.ok(after.scrollTop > 0, `${context}: content cannot scroll`);
          assert.equal(
            after.headerTop,
            before.headerTop,
            `${context}: tabs moved with content`,
          );
        }
      }
    }
  }
  console.log(
    "PASS: Discover tabs span the editor and stay fixed while either panel scrolls, at 640/1440px, both themes and 100%/120% scale.",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
