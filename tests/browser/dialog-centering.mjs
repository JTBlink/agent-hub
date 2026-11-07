// Run with Vite :1420 and the shared web-access proxy :3456: node tests/browser/dialog-centering.mjs
import assert from "node:assert/strict";
async function request(path, body) {
  const response = await fetch(`http://localhost:3456${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  const result = await response.json();
  assert.ok(response.ok && !result.error, JSON.stringify(result));
  return result;
}
const { targetId } = await request(
  "/new",
  "http://127.0.0.1:1420/tests/browser/dialog-centering.html",
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
const inside = (code) =>
  evaluate(
    `(()=>{const document=globalThis.document.querySelector('iframe').contentDocument;const window=document.defaultView;return eval(${JSON.stringify(code)})})()`,
  );
async function ready(condition = "!!document.querySelector('dialog[open]')") {
  const end = Date.now() + 10000;
  while (!(await inside(condition))) {
    assert.ok(Date.now() < end, "Dialog layout did not settle");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
let count = 0;
try {
  await evaluate(
    "document.querySelector('dialog')?.close();document.querySelector('#root').style.display='none';const frame=document.createElement('iframe');frame.style.cssText='position:fixed;inset:0;border:0';document.body.append(frame);true",
  );
  for (const [width, height] of [
    [1280, 900],
    [520, 720],
  ])
    for (const theme of ["dark", "light"])
      for (const size of ["small", "default", "large", "xlarge"])
        for (const long of [false, true]) {
          await evaluate(
            `new Promise(resolve=>{const f=document.querySelector('iframe');f.style.width='${width}px';f.style.height='${height}px';f.onload=()=>resolve(true);f.src='/tests/browser/dialog-centering.html?theme=${theme}&size=${size}${long ? "&long" : ""}'})`,
          );
          await ready();
          const bounds = await inside(
            "(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:window.innerWidth,height:window.innerHeight}})()",
          );
          assert.ok(
            Math.abs(bounds.x - width / 2) < 2 &&
              Math.abs(bounds.y - height / 2) < 2,
            JSON.stringify({ theme, size, long, bounds }),
          );
          assert.ok(
            bounds.left >= 0 &&
              bounds.right <= width &&
              bounds.top >= 0 &&
              bounds.bottom <= height,
            JSON.stringify(bounds),
          );
          await inside(
            "document.querySelector('dialog button[type=submit]').scrollIntoView({block:'nearest'});true",
          );
          assert.ok(
            await inside(
              "(()=>{const a=document.querySelector('dialog').getBoundingClientRect(),b=document.querySelector('button[type=submit]').getBoundingClientRect();return b.top>=a.top&&b.bottom<=a.bottom})()",
            ),
          );
          count++;
        }
  // Resizing an already open dialog must preserve centering without reopening it.
  await evaluate(
    "const f=document.querySelector('iframe');f.style.width='800px';f.style.height='600px';true",
  );
  await ready("window.innerWidth === 800 && window.innerHeight === 600");
  const center = await inside(
    "(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()",
  );
  assert.ok(
    Math.abs(center[0] - 400) < 2 && Math.abs(center[1] - 300) < 2,
    JSON.stringify(center),
  );
  console.log(
    `PASS: ${count} dialog centering layouts plus live resize; offset/transformed parent, themes, all text sizes, narrow window and long content.`,
  );
} finally {
  await request(`/close?target=${targetId}`);
}
