import assert from "node:assert/strict";
const request = async (path, body) => {
  const response = await fetch(`http://localhost:3456${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  const text = await response.text();
  assert.ok(response.ok, text);
  return text ? JSON.parse(text) : {};
};
const { targetId } = await request(
  "/new",
  "http://127.0.0.1:4176/tests/browser/preview-links.html",
);
const evaluate = async (code) => {
  const result = await request(
    `/eval?target=${targetId}`,
    `(()=>{try{return eval(${JSON.stringify(code)})}catch(error){return {testError:String(error),stack:error.stack}}})()`,
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
const count = (kind) =>
  `document.querySelectorAll('[data-kind="${kind}"]').length`;
const clickMarkdown = (modifiers) =>
  evaluate(
    `document.querySelector('article a').dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, ${modifiers} }))`,
  );
try {
  await until(
    "document.documentElement.dataset.ready && document.querySelector('article a') && !document.querySelector('select').disabled",
  );
  await clickMarkdown("");
  await until(`${count("system")} === 1`);
  await clickMarkdown("shiftKey:true,metaKey:true");
  await until(`${count("preview")} === 1`);
  await evaluate(
    "(()=>{const select=document.querySelector('select');select.value='preview';select.dispatchEvent(new Event('change',{bubbles:true}));return true})()",
  );
  await until(
    "document.querySelector('select').value==='preview' && !document.querySelector('select').disabled",
  );
  await clickMarkdown("");
  await until(`${count("preview")} === 2`);
  // Move over a real rendered cell before clicking, exercising the addon's URL detection and OSC 8.
  for (const [row, address] of [
    [0, "/plain"],
    [1, "/osc8"],
  ]) {
    const point = await evaluate(
      `(()=>{const r=document.querySelector('.xterm-screen').getBoundingClientRect();return {x:r.x+10,y:r.y+(r.height/6)*(${row}+0.5)}})()`,
    );
    await evaluate(
      `(()=>{const e=document.querySelector('.xterm-screen'); e.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:${point.x},clientY:${point.y}}));return true})()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const before = await evaluate(count("preview"));
    // Mouse protocol enabled: plain click reaches PTY without opening a URL.
    const click = (modifiers) =>
      evaluate(
        `(()=>{const e=document.querySelector('.xterm-screen');for(const type of ['mousedown','mouseup'])e.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='mousedown'?1:0,clientX:${point.x},clientY:${point.y},${modifiers}}));return true})()`,
      );
    await click("");
    assert.equal(await evaluate(count("preview")), before);
    for (const button of [1, 2]) {
      await evaluate(
        `(()=>{const e=document.querySelector('.xterm-screen');for(const type of ['mousedown','mouseup'])e.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:${button},ctrlKey:true,clientX:${point.x},clientY:${point.y}}));return true})()`,
      );
      assert.equal(await evaluate(count("preview")), before);
    }
    await evaluate(
      `(()=>{const e=document.querySelector('.xterm-screen');for(const type of ['mousedown','mouseup'])e.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:0,ctrlKey:type==='mouseup',clientX:${point.x},clientY:${point.y}}));return true})()`,
    );
    assert.equal(await evaluate(count("preview")), before);
    const inputBefore = await evaluate(count("input"));
    await click("ctrlKey:true");
    await until(`${count("preview")} === ${before + 1}`);
    assert.equal(
      await evaluate(count("input")),
      inputBefore,
      "link activation must not send mouse input to the PTY",
    );
    const latest = await evaluate(
      "[...document.querySelectorAll('[data-kind=preview]')].at(-1).textContent",
    );
    assert.ok(latest.includes(address), latest);
    await click("ctrlKey:true,shiftKey:true");
    await until(`${count("system")} === ${row + 2}`);
  }
  assert.equal(await evaluate(count("error")), 0);
  for (const [language, theme, size, width] of [
    ["zh", "dark", "default", 1440],
    ["en", "light", "xlarge", 960],
    ["zh-TW", "dark", "xlarge", 480],
  ]) {
    await request(
      `/navigate?target=${targetId}`,
      "http://127.0.0.1:4176/tests/browser/preview-workspace-host.html",
    );
    await until("document.querySelector('#preview')");
    await evaluate(
      `(()=>{const f=document.querySelector('#preview');f.style.width='${width}px';f.src='./preview-links.html?language=${language}&theme=${theme}&text-size=${size}';return true})()`,
    );
    await until(
      "document.querySelector('#preview').contentDocument?.documentElement?.dataset.ready && document.querySelector('#preview').contentDocument?.querySelector('[role=combobox]') && !document.querySelector('#preview').contentDocument.querySelector('select').disabled",
    );
    const frame = (code) =>
      evaluate(
        `(()=>{const document=window.document.querySelector('#preview').contentDocument;const innerWidth=document.defaultView.innerWidth,innerHeight=document.defaultView.innerHeight;return eval(${JSON.stringify(code)})})()`,
      );
    await frame("document.querySelector('[role=combobox]').click()");
    await until(
      "document.querySelector('#preview').contentDocument?.querySelector('[role=listbox]')",
    );
    const bounds = await frame(
      "(()=>{const r=document.querySelector('[role=listbox]').getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,w:innerWidth,h:innerHeight}})()",
    );
    assert.ok(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.right <= bounds.w &&
        bounds.bottom <= bounds.h,
      JSON.stringify(bounds),
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/preview-links-${language}.png`,
    );
    await frame("document.querySelectorAll('[role=option]')[1].click()");
  }
  console.log(
    "PASS: content routing, plain URL/OSC 8, mouse protocol isolation, and three locale/theme/scale menus",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
