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
  throw Error(
    `Not ready: ${code}; ${await evaluate("document.querySelector('#preview')?.contentDocument?.body.innerText.slice(-1500)")}`,
  );
};
const documentRef = "document.querySelector('#preview').contentDocument";
const run = (code) =>
  evaluate(`(()=>{const d=${documentRef};${code};return true})()`);
try {
  await until("document.querySelector('#preview')");
  for (const [width, theme, language, size] of [
    [1440, "dark", "zh", "default"],
    [960, "light", "en", "xlarge"],
    [480, "dark", "zh-TW", "xlarge"],
  ]) {
    const src = `./preview-workspace.html?theme=${theme}&language=${language}&text-size=${size}`;
    await evaluate(
      `(()=>{const f=document.querySelector('#preview');f.style.width='${width}px';f.src=${JSON.stringify(src)};return true})()`,
    );
    await until(
      `${documentRef}?.location.search === ${JSON.stringify(`?theme=${theme}&language=${language}&text-size=${size}`)} && ${documentRef}?.querySelector('.preview-welcome') && ${documentRef}?.querySelector('.preview-welcome button:last-child')`,
    );
    assert.ok(
      await evaluate(
        `${documentRef}.querySelector('.preview-new-tab svg').getBoundingClientRect().width >= 14`,
      ),
      "New-tab icon must remain visible",
    );
    await run(`d.querySelector('.preview-new-tab button').click()`);
    await until(
      `${documentRef}?.querySelectorAll('[role="menuitem"]').length===3`,
    );
    await run(
      `d.querySelector('[role="menuitem"]').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
    );
    await run(`d.querySelector('.preview-welcome button:last-child').click()`);
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
    const singleRow = await evaluate(
      `(()=>{const bar=${documentRef}.querySelector('.preview-addressbar');const r=bar.getBoundingClientRect();return [...bar.children].every(el=>{const b=el.getBoundingClientRect();return b.top>=r.top && b.bottom<=r.bottom})})()`,
    );
    assert.ok(singleRow, "Navigation and tools stay in one row");
    await run(`d.querySelector('.preview-more-trigger').click()`);
    await until(`${documentRef}?.querySelector('.preview-toolbar button')`);
    assert.ok(
      await evaluate(
        `(()=>{const rows=[...${documentRef}.querySelectorAll('.preview-toolbar button')].map(el=>el.getBoundingClientRect());return rows.every((r,i)=>i===0 || (Math.abs(r.left-rows[0].left)<1 && r.top>=rows[i-1].bottom))})()`,
      ),
      "More menu actions form a single column without overlap",
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
    assert.equal(
      await evaluate(
        `${documentRef}.querySelector('.preview-annotations > footer, .preview-context-composer select, dialog[open]') !== null`,
      ),
      false,
    );
    await run(`d.querySelectorAll('.preview-quick-actions button')[0].click()`);
    await run(`d.querySelectorAll('.preview-markdown p')[1].click()`);
    await until(
      `${documentRef}?.querySelectorAll('.preview-context-chip').length===2`,
    );
    await run(`d.querySelectorAll('.preview-quick-actions button')[1].click()`);
    await run(`d.querySelectorAll('.preview-markdown p')[1].click()`);
    await until(
      `${documentRef}?.querySelectorAll('.preview-context-chip').length===3`,
    );
    await run(
      `const input=d.querySelector('.preview-note textarea');Object.getOwnPropertyDescriptor(d.defaultView.HTMLTextAreaElement.prototype,'value').set.call(input,'Keep the layout responsive');input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}))`,
    );
    await run(`d.querySelectorAll('.preview-quick-actions button')[2].click()`);
    await until(
      `${documentRef}?.querySelector('.preview-markup canvas')?.getBoundingClientRect().width>0 && ${documentRef}?.querySelector('.preview-markup img')?.complete`,
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/agenthub-markup-${width}-${theme}.png`,
    );
    const original = await evaluate(
      `${documentRef}.querySelector('.preview-markup canvas').toDataURL()`,
    );
    for (const [event, x, y] of [
      ["pointerdown", 20, 20],
      ["pointermove", 100, 80],
      ["pointerup", 100, 80],
    ]) {
      await run(
        `const c=d.querySelector('.preview-markup canvas'),r=c.getBoundingClientRect();c.setPointerCapture=()=>{};c.dispatchEvent(new d.defaultView.PointerEvent('${event}',{clientX:r.left+${x},clientY:r.top+${y},pointerId:1,bubbles:true}))`,
      );
    }
    await until(
      `${documentRef}?.querySelector('.preview-markup canvas').toDataURL()!==${JSON.stringify(original)}`,
    );
    assert.ok(
      await evaluate(
        `(()=>{const c=${documentRef}.querySelector('.preview-markup canvas'),r=c.getBoundingClientRect();return Math.abs(r.width/r.height-c.width/c.height)<0.01})()`,
      ),
      "Drawing preserves screenshot proportions",
    );
    if (width === 1440) {
      const drawn = await evaluate(
        `${documentRef}.querySelector('.preview-markup canvas').toDataURL()`,
      );
      await run(`d.querySelector('[aria-label="撤销绘制"]').click()`);
      await until(
        `${documentRef}.querySelector('.preview-markup canvas').toDataURL()===${JSON.stringify(original)}`,
      );
      await run(`d.querySelector('[aria-label="重做绘制"]').click()`);
      await until(
        `${documentRef}.querySelector('.preview-markup canvas').toDataURL()===${JSON.stringify(drawn)}`,
      );
      for (const tool of [1, 2, 3, 4]) {
        await run(
          `d.querySelectorAll('.preview-markup-toolbar > button')[${tool}].click()`,
        );
        for (const [event, x, y] of [
          ["pointerdown", 40, 80 + tool * 30],
          ["pointermove", 200, 140 + tool * 30],
          ["pointerup", 200, 140 + tool * 30],
        ]) {
          await run(
            `const c=d.querySelector('.preview-markup canvas'),r=c.getBoundingClientRect();c.setPointerCapture=()=>{};c.dispatchEvent(new d.defaultView.PointerEvent('${event}',{clientX:r.left+${x},clientY:r.top+${y},pointerId:1,bubbles:true}))`,
          );
        }
      }
      await run(
        `d.querySelectorAll('.preview-markup-toolbar > button')[5].click()`,
      );
      await run(
        `const c=d.querySelector('.preview-markup canvas'),r=c.getBoundingClientRect();c.dispatchEvent(new d.defaultView.PointerEvent('pointerdown',{clientX:r.left+50,clientY:r.top+300,pointerId:1,bubbles:true}))`,
      );
      await until(`${documentRef}.querySelector('.preview-markup-text')`);
      await run(
        `const input=d.querySelector('.preview-markup-text');Object.getOwnPropertyDescriptor(d.defaultView.HTMLInputElement.prototype,'value').set.call(input,'Revise this area');input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}))`,
      );
      await run(
        `d.querySelector('.preview-markup-text').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`,
      );
      await until(`!${documentRef}.querySelector('.preview-markup-text')`);
      const allTools = await evaluate(
        `${documentRef}.querySelector('.preview-markup canvas').toDataURL()`,
      );
      assert.notEqual(allTools, drawn);
      await run(`d.querySelector('[aria-label="清空绘制"]').click()`);
      await until(
        `${documentRef}.querySelector('.preview-markup canvas').toDataURL()===${JSON.stringify(original)}`,
      );
      await run(`d.querySelector('[aria-label="撤销绘制"]').click()`);
      await until(
        `${documentRef}.querySelector('.preview-markup canvas').toDataURL()===${JSON.stringify(allTools)}`,
      );
    }
    await run(`d.querySelector('.preview-markup .app-button-primary').click()`);
    await until(
      `${documentRef}?.querySelectorAll('.preview-context-chip').length===4`,
    );
    await run(
      `d.querySelector('input[type="file"]').click=()=>{};d.querySelector('.preview-add-context button').click()`,
    );
    await until(
      `${documentRef}?.querySelector('.preview-context-search input')`,
    );
    assert.equal(
      await evaluate(
        `${documentRef}.querySelector('.preview-context-source-list [role="menuitem"]')!==null`,
      ),
      false,
    );
    assert.ok(
      await evaluate(
        `${documentRef}.activeElement===${documentRef}.querySelector('.preview-context-search input')`,
      ),
      "Context picker focuses search",
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/agenthub-context-menu-${width}-${theme}.png`,
    );

    await run(
      `const input=d.querySelector('.preview-context-search input');Object.getOwnPropertyDescriptor(d.defaultView.HTMLInputElement.prototype,'value').set.call(input,'guide');input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}))`,
    );
    await until(
      `${documentRef}?.querySelectorAll('.preview-context-source-list [role="option"]').length===2`,
    );
    await run(`d.querySelector('[data-context-source="files"]').click()`);
    // Supply an explicit multi-file selection without opening a native picker in this fixture.
    await run(
      `const transfer=new d.defaultView.DataTransfer();transfer.items.add(new d.defaultView.File(['Reference one'],'reference.md',{type:'text/markdown'}));transfer.items.add(new d.defaultView.File(['Reference two'],'constraints.txt',{type:'text/plain'}));const bytes=Uint8Array.from(atob(d.createElement('canvas').toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));transfer.items.add(new d.defaultView.File([bytes],'reference.png',{type:'image/png'}));const input=d.querySelector('input[type="file"]');input.files=transfer.files;input.dispatchEvent(new d.defaultView.Event('change',{bubbles:true}))`,
    );
    await until(
      `${documentRef}?.querySelectorAll('.preview-context-chip').length===7`,
    );
    await run(
      `d.querySelectorAll('.preview-context-chip')[1].querySelector('button:last-child').click()`,
    );
    await until(
      `${documentRef}?.querySelectorAll('.preview-context-chip').length===6`,
    );
    await run(
      `const input=d.querySelector('.preview-context-composer > textarea');Object.getOwnPropertyDescriptor(d.defaultView.HTMLTextAreaElement.prototype,'value').set.call(input,'Adjust layout');input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}))`,
    );
    const sendFits = await evaluate(
      `(()=>{const button=${documentRef}.querySelector('.preview-context-send').getBoundingClientRect(),panel=${documentRef}.querySelector('.preview-annotations').getBoundingClientRect();return button.bottom<=panel.bottom && button.top>=panel.top})()`,
    );
    assert.ok(
      sendFits,
      "Send control stays inside the panel with multiple contexts",
    );
    await run(
      `d.querySelector('.preview-context-header-actions > button').click()`,
    );
    await until(`!${documentRef}?.querySelector('.preview-context-composer')`);
    await run(
      `d.querySelector('.preview-addressbar button[aria-expanded]:not([role]):not([aria-haspopup])').click()`,
    );
    await until(
      `${documentRef}?.querySelector('.preview-context-composer > textarea')`,
    );
    assert.equal(
      await evaluate(
        `${documentRef}.querySelector('.preview-context-composer > textarea').value`,
      ),
      "Adjust layout",
    );
    await run(`d.querySelector('.preview-status button:last-child').click()`);
    await until(
      `${documentRef}.documentElement.dataset.copiedContext?.includes('Adjust layout')`,
    );
    await run(
      `d.querySelector('.preview-context-composer > textarea').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}))`,
    );
    await until(
      `${documentRef}.documentElement.dataset.deliveredContext?.includes('Adjust layout')`,
    );
    const delivered = await evaluate(
      `${documentRef}.documentElement.dataset.deliveredContext`,
    );
    for (const expected of [
      "Source: guide.md:5-6",
      "DOM path:",
      "Reference one",
      "Reference two",
      "Keep the layout responsive",
    ])
      assert.ok(delivered.includes(expected), delivered);
    assert.equal(
      await evaluate(
        `JSON.parse(${documentRef}.documentElement.dataset.packagedContext).images.length`,
      ),
      2,
    );
    assert.equal(
      await evaluate(
        `${documentRef}.querySelector('dialog[open], .preview-context-composer select') !== null`,
      ),
      false,
    );
    // Inspect the first context again before testing source navigation.
    await run(`d.querySelector('.preview-context-chip > button').click()`);
    await run(`d.querySelector('.preview-source-link').click()`);
    await until(`${documentRef}?.querySelector('.cm-editor')`);
    await run(`d.querySelector('.preview-more-trigger').click()`);
    await run(`d.querySelector('.preview-source-toggle').click()`);
    await until(`${documentRef}?.querySelector('.preview-markdown')`);
    await run(`d.querySelector('.preview-more-trigger').click()`);
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
    await evaluate(
      `(()=>{document.querySelector('#preview').src=${JSON.stringify(`./preview-workspace.html?view=downloads&theme=${theme}&language=${language}&text-size=${size}`)};return true})()`,
    );
    await until(
      `${documentRef}?.location.search.includes('view=downloads') && ${documentRef}.querySelectorAll('.preview-note').length===2`,
    );
    assert.equal(
      await evaluate(
        `${documentRef}.querySelectorAll('.preview-note [role="status"]').length`,
      ),
      1,
    );
    await run(
      `const button=d.querySelector('.preview-note .lucide-trash-2').closest('button');button.scrollIntoView({block:'center'});button.click()`,
    );
    await until(`${documentRef}.querySelectorAll('.preview-note').length===1`);
    assert.equal(
      await evaluate(
        `${documentRef}.querySelector('.preview-note strong').textContent`,
      ),
      "pending.txt",
    );
    assert.equal(
      await evaluate(
        `${documentRef}.documentElement.scrollWidth>${documentRef}.defaultView.innerWidth+1`,
      ),
      false,
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/agenthub-downloads-${width}-${theme}.png`,
    );
    for (const mode of ["reconnect", "reopen"]) {
      await evaluate(
        `(()=>{document.querySelector('#preview').src=${JSON.stringify(`./preview-workspace.html?view=recovery&action=${mode}&theme=${theme}&language=${language}&text-size=${size}`)};return true})()`,
      );
      await until(
        `${documentRef}?.location.search.includes('view=recovery') && ${documentRef}.querySelector('.preview-browser-error button')`,
      );
      const readable = await evaluate(
        `(()=>{const d=${documentRef},pane=d.querySelector('.preview-browser-error');return [...pane.querySelectorAll('p')].every(p=>p.getBoundingClientRect().width>=pane.clientWidth-50)})()`,
      );
      assert.equal(
        readable,
        true,
        "Recovery text must use the available line width",
      );
      await request(
        `/screenshot?target=${targetId}&file=/tmp/agenthub-${mode}-${width}-${theme}.png`,
      );
      await run(
        `const button=d.querySelectorAll('.preview-browser-error button')[${mode === "reopen" ? 1 : 0}];button.scrollIntoView({block:'center'});button.click()`,
      );
      await until(
        `${documentRef}.querySelector('.preview-browser-image img') && !${documentRef}.querySelector('.preview-browser-error')`,
      );
      assert.equal(
        await evaluate(
          `${documentRef}.documentElement.scrollWidth>${documentRef}.defaultView.innerWidth+1`,
        ),
        false,
      );
      assert.equal(
        await evaluate(`${documentRef}.documentElement.dataset.recoveryAction`),
        mode,
      );
    }
  }
  console.log(
    "Preview acceptance passed: six screenshot tools, raster undo/redo/clear, searchable source picker, permanent quick actions, multiple context chips, text/image/file imports, removal, retained instructions, current-workspace delivery, keyboard submit, source navigation, themes and 1440/960/480 layouts (synthetic IPC).",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
