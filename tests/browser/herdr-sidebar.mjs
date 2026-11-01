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
    await click(`d.querySelector('[data-herdr-workspace="w1"]').click()`);
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
} finally {
  await request(`/close?target=${targetId}`);
}
