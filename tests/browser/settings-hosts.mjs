// Run: node tests/browser/settings-hosts.mjs
// Requires Vite on :1420 and the shared web-access CDP proxy on :3456.
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
const baseUrl =
  process.env.AGENT_HUB_BROWSER_BASE_URL ?? "http://127.0.0.1:1420";
const { targetId } = await request(
  "/new",
  `${baseUrl}/tests/browser/settings-hosts.html`,
);
async function evaluate(code) {
  const result = await request(
    `/eval?target=${targetId}`,
    `(() => { return eval(${JSON.stringify(code)}); })()`,
  );
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
    assert.ok(Date.now() < deadline, code);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
try {
  await evaluate(
    `document.querySelector('#root').style.display='none';const frame=document.createElement('iframe');frame.style.cssText='position:fixed;inset:0;border:0;width:960px;height:720px';frame.src='/tests/browser/settings-hosts.html';document.body.append(frame);true`,
  );
  for (const theme of ["light", "dark"]) {
    for (const size of ["default", "xlarge"]) {
      for (const width of [520, 960]) {
        for (const language of ["zh", "en", "zh-TW"]) {
          await evaluate(
            `new Promise(resolve => { const frame=document.querySelector('iframe');frame.style.width='${width}px';frame.onload=()=>resolve(true);frame.src='/tests/browser/settings-hosts.html?theme=${theme}&text-size=${size}&language=${language}'; })`,
          );
          await until(`!!document.querySelector('textarea:not(:disabled)')`);
          const layout = await inside(`(() => {
            const sidebar=document.querySelector('[role=tablist]');
            const panel=document.querySelector('#settings-panel-hosts');
            const editor=document.querySelector('textarea');
            const a=sidebar.getBoundingClientRect(), b=panel.getBoundingClientRect(), c=editor.getBoundingClientRect();
            return {vertical:sidebar.getAttribute('aria-orientation'),left:a.right<=b.left, fits:c.right<=window.innerWidth+1, overflow:document.documentElement.scrollWidth>window.innerWidth, enabled:!editor.disabled, outsideEditor: !document.querySelector(".workbench-editor-panel").contains(sidebar), fullHeight: sidebar.closest(".workbench-sidebar-panel").getBoundingClientRect().height >= document.querySelector(".workbench-editor-panel").getBoundingClientRect().height - 1};
          })()`);
          assert.equal(layout.vertical, "vertical");
          assert.ok(
            layout.left &&
              layout.fits &&
              layout.enabled &&
              !layout.overflow &&
              layout.outsideEditor &&
              layout.fullHeight,
            JSON.stringify({ theme, size, width, language, layout }),
          );
        }
      }
    }
  }
  await evaluate(
    `new Promise(resolve => { const frame=document.querySelector('iframe');frame.style.width='960px';frame.onload=()=>resolve(true);frame.src='/tests/browser/settings-hosts.html?language=zh'; })`,
  );
  await until(`!!document.querySelector('textarea:not(:disabled)')`);
  await inside(
    `document.querySelector('#settings-panel-hosts details').open=true;Array.from(document.querySelectorAll('#settings-panel-hosts button')).find(b=>b.textContent==='打开系统权限设置').click();true`,
  );
  await until(
    `document.documentElement.dataset.permissionSettingsOpened === 'true'`,
  );
  const width = await inside(
    `Number(document.querySelector('[role=separator]').getAttribute('aria-valuenow'))`,
  );
  await inside(
    `document.querySelector('[role=separator]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));true`,
  );
  assert.equal(
    await inside(
      `Number(document.querySelector('[role=separator]').getAttribute('aria-valuenow'))`,
    ),
    width + 10,
  );
  await inside(
    `document.querySelector('[role=separator]').dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}));true`,
  );
  await inside(
    `const editor=document.querySelector('textarea');Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(editor,${JSON.stringify("127.0.0.2 demo.test\n")});editor.dispatchEvent(new window.Event('input',{bubbles:true}));true`,
  );
  await until(
    `!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='保存').disabled`,
  );
  await inside(`document.querySelector('#settings-tab-network').click();true`);
  await inside(`document.querySelector('#settings-tab-hosts').click();true`);
  assert.equal(
    await inside(`document.querySelector('textarea').value`),
    "127.0.0.2 demo.test\n",
  );
  await inside(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='保存').click();true`,
  );
  await until(`!!document.querySelector('[role=status]')`);
  assert.ok(
    (
      await inside(`document.querySelector('[role=status]').textContent`)
    ).includes("Hosts 已保存"),
  );
  await inside(`document.querySelector('[aria-pressed="false"]').click();true`);
  await until(
    `document.querySelector('textarea').value==='127.0.0.2 app.test\\n'`,
  );
  await inside(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='应用到系统').click();true`,
  );
  await until(
    `!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='已应用' && b.disabled)`,
  );
  await inside(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='用 VS Code 打开').click();true`,
  );
  await until(`!!document.documentElement.dataset.vscodeOpened`);
  assert.ok(
    (await inside(`document.documentElement.dataset.vscodeOpened`)).includes(
      "/profiles/development/hosts",
    ),
  );
  await inside(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='新建方案').click();true`,
  );
  await until(`!!document.querySelector('[role=alertdialog] input')`);
  const modalFits = await inside(
    `(() => {const r=document.querySelector('[role=alertdialog]').getBoundingClientRect();return r.top>=0 && r.bottom<=window.innerHeight;})()`,
  );
  assert.ok(modalFits);
  await inside(
    `const input=document.querySelector('[role=alertdialog] input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'Browser profile');input.dispatchEvent(new window.Event('input',{bubbles:true}));true`,
  );
  await inside(
    `Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent==='保存').click();true`,
  );
  await until(
    `!document.querySelector('[role=alertdialog]') && document.querySelector('textarea').value.includes('app.test')`,
  );
  await inside(
    `document.querySelector('#settings-tab-hosts').focus();document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));true`,
  );
  assert.equal(
    await inside(`document.activeElement.id`),
    "settings-tab-network",
  );
  console.log(
    "PASS: 24 theme/scale/width/locale layouts, draft retention, save, profile create/apply, VS Code, settings shortcut, sidebar sizing and vertical keyboard navigation",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
