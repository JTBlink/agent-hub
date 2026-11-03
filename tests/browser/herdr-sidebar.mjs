// Run against Vite :1420 and the shared web-access proxy :3456. Synthetic IPC only.
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
  "http://127.0.0.1:1420/tests/browser/herdr-sidebar-host.html",
);
async function evaluate(code) {
  const r = await request(
    `/eval?target=${targetId}`,
    `(()=>{try{return eval(${JSON.stringify(code)})}catch(error){return {previewError:String(error),code:${JSON.stringify(code)}}}})()`,
  );
  assert.ok(!r.error && !r.value?.previewError, JSON.stringify(r));
  return r.value;
}
async function until(code) {
  for (let n = 0; n < 100; n++) {
    if (await evaluate(code)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Not ready: ${code}`);
}
const d = "document.querySelector('#preview').contentDocument";
const click = async (code) =>
  evaluate(`(()=>{const d=${d};${code};return true})()`);
try {
  for (const [width, theme, language, size] of [
    [1440, "dark", "zh", "default"],
    [960, "light", "en", "xlarge"],
    [480, "dark", "zh-TW", "xlarge"],
  ]) {
    const src = `/tests/browser/herdr-sidebar.html?theme=${theme}&language=${language}&text-size=${size}`;
    await until(
      `(()=>{const f=document.querySelector('#preview');if(!f)return false;f.style.width='${width}px';if(f.getAttribute('src')!==${JSON.stringify(src)}){f.src=${JSON.stringify(src)};return false}return f.contentDocument?.querySelectorAll('[data-herdr-workspace]').length===14})()`,
    );
    const branchRow = await evaluate(
      `(()=>{const d=${d},row=d.querySelector('[data-herdr-workspace="w2"]'),directory=row.querySelector('[data-herdr-directory]'),branch=row.querySelector('[data-herdr-branch]'),connector=row.querySelector('[data-herdr-connector]'),rowRect=row.getBoundingClientRect(),directoryRect=directory.getBoundingClientRect(),branchRect=branch.getBoundingClientRect(),connectorRect=connector.getBoundingClientRect(),vertical=connector.firstElementChild.getBoundingClientRect(),horizontal=connector.lastElementChild.getBoundingClientRect();return {directory:directory.textContent,branch:branch.textContent,title:row.title,label:row.getAttribute('aria-label'),stacked:branchRect.top>=directoryRect.bottom-1,withinRow:directoryRect.right<=rowRect.right&&branchRect.right<=rowRect.right,connectorFillsRow:Math.abs(connectorRect.top-rowRect.top)<=1&&Math.abs(connectorRect.bottom-rowRect.bottom)<=1,connectorJoined:Math.abs(vertical.bottom-horizontal.top)<=1&&Math.abs(vertical.left-horizontal.left)<=1}})()`,
    );
    assert.deepEqual(branchRow, {
      directory: "demo-work-issue",
      branch: "fix/issue-macos",
      title: "/projects/demo-work-issue\nfix/issue-macos",
      label: "demo-work-issue fix/issue-macos",
      stacked: true,
      withinRow: true,
      connectorFillsRow: true,
      connectorJoined: true,
    });
    // Open at the viewport edge: the real portal must fit at every text scale.
    await click(
      `d.querySelector('[data-herdr-workspace="w1"]').dispatchEvent(new d.defaultView.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:d.defaultView.innerWidth-2,clientY:d.defaultView.innerHeight-2}))`,
    );
    await until(`!!${d}.querySelector('[role="menu"]')`);
    if (width === 1440)
      await request(
        `/screenshot?target=${targetId}&file=/tmp/agenthub-herdr-workspace-menu.png`,
      );
    const menu = await evaluate(
      `(()=>{const d=${d},m=d.querySelector('[role="menu"]'),r=m.getBoundingClientRect();return {items:[...m.querySelectorAll('[role="menuitem"]')].map(b=>({label:b.textContent,disabled:b.disabled})),separators:m.querySelectorAll('[role="separator"]').length,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:d.defaultView.innerWidth,height:d.defaultView.innerHeight,focused:m.contains(d.activeElement)}})()`,
    );
    assert.equal(menu.items.length, 6, JSON.stringify(menu));
    assert.equal(
      menu.items.some((item) => item.disabled),
      false,
      JSON.stringify(menu),
    );
    assert.equal(menu.separators, 1);
    assert.equal(menu.focused, true);
    assert.ok(
      menu.left >= 0 &&
        menu.top >= 0 &&
        menu.right <= menu.width &&
        menu.bottom <= menu.height,
      JSON.stringify(menu),
    );
    assert.ok(
      menu.items.every(
        (item) => !/^(herdr|fileTree|common|git)\./.test(item.label),
      ),
    );
    await click(
      `const m=d.querySelector('[role="menu"]');m.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'End',bubbles:true}))`,
    );
    assert.equal(
      await evaluate(
        `(()=>{const d=${d};return d.activeElement === d.querySelector('[role="menuitem"]:last-child')})()`,
      ),
      true,
    );
    await click(`d.activeElement.click()`);
    await until(
      `${d}.defaultView.previewMenuCalls.some(c=>c.command==='plugin:clipboard-manager|write_text'&&c.args.text==='main')`,
    );
    await until(`!${d}.querySelector('[role="menu"]')`);
    assert.equal(
      await evaluate(`${d}.activeElement.getAttribute('data-herdr-workspace')`),
      "w1",
    );
    await click(
      `d.querySelector('[data-herdr-workspace="w1"]').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true}))`,
    );
    await until(`!!${d}.querySelector('[role="menu"]')`);
    await click(
      `d.querySelector('[role="menu"]').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
    );
    await until(`!${d}.querySelector('[role="menu"]')`);
    await click(
      `d.querySelector('[data-herdr-workspace="w1"]').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'ContextMenu',bubbles:true}))`,
    );
    await until(`!!${d}.querySelector('[role="menu"]')`);
    await click(`d.querySelectorAll('[role="menuitem"]')[3].click()`);
    await until(
      `${d}.defaultView.previewMenuCalls.some(c=>c.command==='plugin:clipboard-manager|write_text'&&c.args.text==='.')`,
    );
    console.log(
      `PASS ${width}px ${theme} ${language} ${size}: project context menu grouping, edge bounds, copy relative path/branch and focus restoration`,
    );
    const openCalls = `${d}.defaultView.previewOpenCalls`;
    const beforeRepeat = await evaluate(`${openCalls}.length`);
    await click(`d.querySelector('[data-herdr-workspace="w1"]').click()`);
    assert.equal(await evaluate(`${openCalls}.length`), beforeRepeat);
    await click(`d.querySelector('[data-herdr-workspace="w2"]').click()`);
    await until(`${openCalls}.length===${beforeRepeat + 1}`);
    await until(
      `!!${d}.querySelector('nav button[aria-label="${language === "en" ? "Copy output" : language === "zh" ? "复制输出" : "複製輸出"}"]')`,
    );
    const newLabel =
      language === "en"
        ? "New Agent"
        : language === "zh"
          ? "新建 Agent"
          : "新增 Agent";
    await click(
      `[...d.querySelectorAll('aside button')].find(b=>b.textContent===${JSON.stringify(newLabel)}).click()`,
    );
    await until(
      `(()=>{const d=${d},p=d.querySelector('[role="alertdialog"]');return !!p && p.contains(d.activeElement)})()`,
    );
    const metrics = await evaluate(
      `(()=>{const d=${d},p=d.querySelector('[role="alertdialog"]'),r=p.getBoundingClientRect();return {overflow:d.documentElement.scrollWidth>d.defaultView.innerWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:d.defaultView.innerWidth,height:d.defaultView.innerHeight,text:p.textContent,focus:p.contains(d.activeElement),scale:d.documentElement.style.getPropertyValue('--app-scale')}})()`,
    );
    assert.equal(metrics.overflow, false, JSON.stringify(metrics));
    assert.ok(
      metrics.left >= 0 &&
        metrics.right <= metrics.width &&
        metrics.top >= 0 &&
        metrics.bottom <= metrics.height,
      JSON.stringify(metrics),
    );
    assert.equal(metrics.focus, true);
    assert.ok(!metrics.text.includes("herdr."), metrics.text);
    await click(
      `d.defaultView.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
    );
    await until(`!${d}.querySelector('[role="alertdialog"]')`);
    await click(
      `const first=d.querySelector('[data-herdr-workspace]');first.focus();first.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`,
    );
    assert.equal(
      await evaluate(`${d}.activeElement.getAttribute('data-herdr-workspace')`),
      "w2",
    );
    await click(
      `[...d.querySelectorAll('aside button[aria-expanded]')].find(b=>b.textContent.includes('Agent')).click()`,
    );
    assert.equal(
      await evaluate(
        `(()=>{const d=${d};return [...d.querySelectorAll('aside button[aria-expanded]')].find(b=>b.textContent.includes('Agent')).getAttribute('aria-expanded')})()`,
      ),
      "true",
    );
    console.log(
      `PASS ${width}px ${theme} ${language} ${size}: native attachment, toolbar, dialog bounds, Escape and keyboard navigation`,
    );
    if (width === 1440)
      await request(
        `/screenshot?target=${targetId}&file=/tmp/agent-hub-herdr-preview.png`,
      );
  }
  const workspaceIds = `(()=>{const d=${d};return [...d.querySelectorAll('[data-herdr-workspace]')].map(row=>row.getAttribute('data-herdr-workspace')).slice(0,3).join(',')})()`;
  await until(
    `(()=>{const d=${d},handle=d.querySelector('[data-herdr-workspace-drag="w3"]');return !!handle&&handle.getAttribute('aria-disabled')!=='true'})()`,
  );
  assert.equal(await evaluate(workspaceIds), "w1,w2,w3");
  const drag = await evaluate(`(()=>{
    const d=${d};
    const source=d.querySelector('[data-herdr-workspace-drag="w3"]').getBoundingClientRect();
    const target=d.querySelector('[data-herdr-workspace-group="w1"]').getBoundingClientRect();
    return {
      start:{x:source.left+source.width/2,y:source.top+source.height/2},
      end:{x:target.left+target.width/2,y:target.top+target.height/2}
    };
  })()`);
  const pointer =
    "bubbles:true,pointerId:1,pointerType:'mouse',isPrimary:true,button:0";
  await click(
    `d.querySelector('[data-herdr-workspace-drag="w3"]').dispatchEvent(new d.defaultView.PointerEvent('pointerdown',{${pointer},buttons:1,clientX:${drag.start.x},clientY:${drag.start.y}}))`,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  for (let step = 1; step <= 8; step++) {
    const x = drag.start.x + ((drag.end.x - drag.start.x) * step) / 8;
    const y = drag.start.y + ((drag.end.y - drag.start.y) * step) / 8;
    await click(
      `d.dispatchEvent(new d.defaultView.PointerEvent('pointermove',{${pointer},buttons:1,clientX:${x},clientY:${y}}))`,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await click(
    `d.dispatchEvent(new d.defaultView.PointerEvent('pointerup',{${pointer},buttons:0,clientX:${drag.end.x},clientY:${drag.end.y}}))`,
  );
  await until(`${workspaceIds}==='w3,w1,w2'`);
  assert.equal(
    await evaluate(
      `${d}.defaultView.sessionStorage.getItem('preview:herdr-workspace-order')?.includes('w3')`,
    ),
    true,
  );
  await click(`d.defaultView.location.reload()`);
  await until(
    `(()=>{const d=${d};return d.querySelectorAll('[data-herdr-workspace]').length===14&&${workspaceIds}==='w3,w1,w2'})()`,
  );
  console.log(
    "PASS pointer drag: root workspace order persisted after reload and linked worktree followed its parent",
  );
  await until(
    `(()=>{const d=${d},handle=d.querySelector('[data-herdr-workspace-drag="w3"]');return !!handle&&handle.getAttribute('aria-disabled')!=='true'})()`,
  );
  await click(
    `d.defaultView.focus();d.querySelector('[data-herdr-workspace-drag="w3"]').focus({preventScroll:true})`,
  );
  await until(
    `${d}.activeElement?.getAttribute('data-herdr-workspace-drag')==='w3'`,
  );
  for (const [key, code] of [
    [" ", "Space"],
    ["ArrowDown", "ArrowDown"],
  ]) {
    await click(
      `d.activeElement.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true}))`,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(
    await evaluate(
      `${d}.activeElement.getAttribute('data-herdr-workspace-drag')`,
    ),
    "w3",
  );
  await click(
    `d.activeElement.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}))`,
  );
  await until(`${workspaceIds}==='w1,w2,w3'`);
  assert.equal(
    await evaluate(
      `${d}.activeElement.getAttribute('data-herdr-workspace-drag')`,
    ),
    "w3",
  );
  console.log(
    "PASS keyboard drag: arrow keys reorder without list navigation stealing focus",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
