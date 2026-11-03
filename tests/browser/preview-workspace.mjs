// Real production components, synthetic IPC. Requires Vite :4176 and web-access :3456.
import assert from "node:assert/strict";
const request = async (path, body) => {
  const response = await fetch(`http://localhost:3456${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  const text = await response.text();
  assert.ok(response.ok, `${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
};
const { targetId } = await request(
  "/new",
  "http://127.0.0.1:4176/tests/browser/preview-workspace-host.html",
);
const evaluate = async (code) => {
  const result = await request(
    `/eval?target=${targetId}`,
    `(()=>{try{return eval(${JSON.stringify(code)})}catch(error){return {testError:String(error)}}})()`,
  );
  assert.ok(!result.error && !result.value?.testError, JSON.stringify(result));
  return result.value;
};
const until = async (code) => {
  for (let n = 0; n < 100; n++) {
    if (await evaluate(`Boolean(${code})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(`Not ready: ${code}`);
};
const documentRef = "document.querySelector('#preview').contentDocument";
const run = (code) =>
  evaluate(`(()=>{const d=${documentRef};${code};return true})()`);
try {
  for (const [width, theme, language, size] of [
    [1440, "dark", "zh", "default"],
    [960, "light", "en", "xlarge"],
    [480, "dark", "zh-TW", "xlarge"],
  ]) {
    const src = `./preview-workspace.html?theme=${theme}&language=${language}&text-size=${size}`;
    await evaluate(
      `(()=>{const f=document.querySelector('#preview');f.style.width='${width}px';f.src=${JSON.stringify(src)};return true})()`,
    );
    await until(`${documentRef}?.querySelector('.preview-welcome')`);
    await run(`d.querySelector('.preview-tabs button:last-child').click()`);
    await until(
      `${documentRef}?.querySelectorAll('.preview-markdown h2').length===2`,
    );
    const outline = await evaluate(
      `[...${documentRef}.querySelectorAll('.preview-markdown h2')].map(element=>({id:element.id,line:element.dataset.sourceLine}))`,
    );
    assert.deepEqual(
      outline.map((item) => item.id),
      ["working-document", "working-document-1"],
    );
    await run(`d.querySelector('.preview-toolbar button').click()`);
    await until(
      `${documentRef}?.querySelector('.preview-markdown-layout.picking')`,
    );
    await run(`d.querySelector('.preview-markdown p').click()`);
    await until(`${documentRef}?.querySelectorAll('.preview-note').length===1`);
    const sourceLine = await evaluate(
      `${documentRef}.querySelector('.preview-source-link').textContent`,
    );
    assert.ok(sourceLine.includes(":5"), sourceLine);
    await run(`d.querySelector('.preview-note-actions button').click()`);
    await until(
      `${documentRef}.documentElement.dataset.copiedContext?.includes('Viewport:')`,
    );
    const copied = await evaluate(
      `${documentRef}.documentElement.dataset.copiedContext`,
    );
    assert.ok(copied.includes("Source: guide.md:5-6"), copied);
    assert.ok(copied.includes("DOM path:"), copied);
    assert.ok(copied.includes("CSS:"), copied);
    assert.ok(copied.includes("Accessibility:"), copied);
    await run(`d.querySelector('.preview-source-link').click()`);
    await until(`${documentRef}?.querySelector('.cm-editor')`);
    await run(`d.querySelector('.preview-source-toggle').click()`);
    await until(`${documentRef}?.querySelector('.preview-markdown')`);
    await run(
      `d.querySelector('.preview-toolbar .lucide-search').closest('button').click()`,
    );
    await until(`${documentRef}?.querySelector('.preview-find input')`);
    await run(
      `const input=d.querySelector('.preview-find input');Object.getOwnPropertyDescriptor(d.defaultView.HTMLInputElement.prototype,'value').set.call(input,'Working');input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}))`,
    );
    await run(`d.querySelector('.preview-find').requestSubmit()`);
    await until(
      `${documentRef}.querySelector('.preview-find span').textContent.includes('2')`,
    );
    await run(`d.querySelector('.preview-find').requestSubmit()`);
    const second = await evaluate(
      `${documentRef}.querySelector('.preview-find span').textContent`,
    );
    assert.ok(second.startsWith("2"), second);
    assert.equal(
      await evaluate(
        `!!document.querySelector('vite-error-overlay')||!!${documentRef}.querySelector('vite-error-overlay')`,
      ),
      false,
      "Vite error overlay must not cover the accepted UI",
    );
    const dimensions = await evaluate(
      `(()=>{const d=${documentRef},r=d.querySelector('.preview-workspace').getBoundingClientRect();return {width:d.defaultView.innerWidth,right:r.right,scroll:d.documentElement.scrollWidth}})()`,
    );
    assert.ok(
      dimensions.right <= dimensions.width + 1,
      JSON.stringify(dimensions),
    );
    assert.ok(
      dimensions.scroll <= dimensions.width + 1,
      JSON.stringify(dimensions),
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/agenthub-preview-${width}-${theme}.png`,
    );
    await evaluate(
      `(()=>{const frame=document.querySelector('#preview');frame.src=${JSON.stringify(`./preview-workspace.html?view=cookies&theme=${theme}&language=${language}&text-size=${size}`)};return true})()`,
    );
    await until(
      `${documentRef}?.location.search.includes('view=cookies') && ${documentRef}?.querySelector('.preview-inspector textarea')`,
    );
    await run(
      `const input=d.querySelector('textarea');Object.getOwnPropertyDescriptor(d.defaultView.HTMLTextAreaElement.prototype,'value').set.call(input,'[]');input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}))`,
    );
    await run(`d.querySelector('.preview-inspector section > button').click()`);
    await until(`${documentRef}?.querySelector('.preview-import-confirm')`);
    const scopes = await evaluate(
      `[...${documentRef}.querySelectorAll('[role="switch"]')].map(element=>element.getAttribute('aria-label'))`,
    );
    assert.deepEqual(scopes, ["one.example.invalid", "two.example.invalid"]);
    const controlsReachable = await evaluate(
      `(()=>{const d=${documentRef},pane=d.querySelector('.preview-inspector-scroll'),controls=[...d.querySelectorAll('.preview-import-confirm [role="switch"],.preview-import-confirm>button')];return controls.every(element=>{element.scrollIntoView({block:'center'});const r=element.getBoundingClientRect(),p=pane.getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1&&r.width>0})})()`,
    );
    assert.equal(
      controlsReachable,
      true,
      "Every scope and import action must be reachable by scrolling",
    );
    await run(
      `d.querySelector('[role="switch"][aria-label="two.example.invalid"]').scrollIntoView({block:'center'})`,
    );

    const overflow = await evaluate(
      `(()=>{const d=${documentRef};return d.documentElement.scrollWidth>d.defaultView.innerWidth+1})()`,
    );
    assert.equal(overflow, false);
    assert.equal(
      await evaluate(
        `!!document.querySelector('vite-error-overlay')||!!${documentRef}.querySelector('vite-error-overlay')`,
      ),
      false,
      "Vite error overlay must not cover cookie import UI",
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    await request(
      `/screenshot?target=${targetId}&file=/tmp/agenthub-cookie-import-${width}-${theme}.png`,
    );
  }
  console.log(
    "Preview acceptance passed: Markdown outline, source capture/navigation, cookie scope preview, themes, enlarged text, 1440/960/480 layouts (synthetic IPC).",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
