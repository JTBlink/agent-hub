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
  "http://127.0.0.1:1420/tests/browser/terminal-sessions.html",
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
async function waitFor(code) {
  const deadline = Date.now() + 20000;
  while (!(await evaluate(code))) {
    assert.ok(
      Date.now() < deadline,
      "Terminal sessions fixture did not become ready",
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
try {
  await evaluate(`document.querySelector('#root').style.display='none';
    const frame=document.createElement('iframe');frame.id='sessions-frame';
    frame.style.cssText='position:fixed;inset:0;border:0;width:1000px;height:720px';
    frame.src='/tests/browser/terminal-sessions.html';document.body.append(frame);`);
  const inFrame = async (code) =>
    evaluate(`(() => {
    const document = window.document.querySelector('#sessions-frame').contentDocument;
    const innerWidth = document.defaultView.innerWidth, innerHeight = document.defaultView.innerHeight;
    const getComputedStyle = document.defaultView.getComputedStyle.bind(document.defaultView);
    return eval(${JSON.stringify(code)});
  })()`);
  await waitFor(
    'Boolean(document.querySelector("#sessions-frame").contentDocument?.querySelector("[data-sessions-fixture] button"))',
  );
  for (const theme of ["light", "dark"]) {
    for (const scale of [1, 1.2]) {
      for (const width of [420, 1000]) {
        await inFrame(`document.documentElement.classList.toggle('dark', ${theme === "dark"});
          document.documentElement.style.zoom = '${scale}';
          document.documentElement.style.setProperty('--app-scale', '${scale}');
          document.querySelector('[data-sessions-fixture]').style.right = '${width === 420 ? 1 : 9}rem';`);
        await evaluate(
          `document.querySelector('#sessions-frame').style.width='${width}px'`,
        );
        await inFrame(
          `document.querySelector('[data-sessions-fixture] button').click()`,
        );
        await waitFor(
          'Boolean(document.querySelector("#sessions-frame").contentDocument.querySelector("[data-sessions-fixture] button[aria-expanded=true]"))',
        );
        const result = await inFrame(`(() => {
          const trigger = document.querySelector('[data-sessions-fixture] button');
          const panel = document.getElementById(trigger.getAttribute('aria-controls'));
          const rect = panel.getBoundingClientRect();
          const text = [...panel.querySelectorAll('button[title] > span:first-child span')];
          const complete = text.every(node => getComputedStyle(node).textOverflow !== 'ellipsis' && node.scrollWidth <= node.clientWidth + 1);
          const last = panel.lastElementChild;
          last.scrollIntoView({block:'nearest'});
          return {complete, withinWindow:rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
            entries:panel.querySelectorAll('button[title]').length,
            lastReachable:last.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom};
        })()`);
        assert.deepEqual(
          result,
          {
            complete: true,
            withinWindow: true,
            entries: 8,
            lastReachable: true,
          },
          `${theme}/${scale}/${width}`,
        );
        if (theme === "dark" && scale === 1.2 && width === 420)
          await request(
            `/screenshot?target=${targetId}&file=/tmp/agent-hub-terminal-sessions.png`,
          );
        await inFrame(
          `document.querySelector('[data-sessions-fixture] button').click()`,
        );
      }
    }
  }
  console.log(
    "PASS: full session names and paths, eight reachable entries, both themes, scales and window widths",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
