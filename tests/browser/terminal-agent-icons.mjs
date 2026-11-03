// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
import assert from "node:assert/strict";

async function request(path, body) {
  const response = await fetch(`http://localhost:3456${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
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
        await inside(
          `document.querySelector('[data-new-terminal-fixture] button').click()`,
        );
        await waitFor(
          `(() => { const images = [...document.querySelector('iframe').contentDocument.querySelectorAll('[role=menuitem] img')]; return images.length === 5 && images.every(image => image.complete && image.naturalWidth > 0); })()`,
        );
        const icons = await inside(
          `[...document.querySelectorAll('[role=menuitem] img')].map(image => ({loaded: image.naturalWidth > 0, bundled: image.src.startsWith('data:image/'), visible: image.getBoundingClientRect().width > 0}))`,
        );
        assert.equal(icons.length, 5);
        assert.ok(
          icons.every((icon) => icon.loaded && icon.bundled && icon.visible),
          JSON.stringify(icons),
        );
        if (theme === "dark" && scale === 1.2 && width === 1000) {
          await request(
            `/screenshot?target=${targetId}&file=/tmp/agent-hub-terminal-agent-icons.png`,
          );
        }
        await inside(
          `document.querySelector('[role=menu]').dispatchEvent(new window.KeyboardEvent('keydown', {key:'Escape', bubbles:true}))`,
        );
      }
    }
  }
  console.log(
    "PASS: five Agent icons load from bundled data in eight theme/scale/width combinations",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
