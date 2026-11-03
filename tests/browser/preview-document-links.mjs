// Same prerequisites as preview-links.md. Production document renderer, synthetic IPC.
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
const d = "document.querySelector('#preview').contentDocument";
const run = (code) => evaluate(`(()=>{const d=${d};${code};return true})()`);
try {
  for (const [language, theme, size, width] of [
    ["zh", "dark", "default", 1440],
    ["en", "light", "xlarge", 960],
    ["zh-TW", "dark", "xlarge", 480],
  ]) {
    await run(
      `const f=document.querySelector('#preview');f.style.width='${width}px';f.src='./preview-workspace.html?language=${language}&theme=${theme}&text-size=${size}'`,
    );
    await until(`${d}?.querySelector('.preview-welcome')`);
    await run("d.querySelector('.preview-tabs button:last-child').click()");
    await until(`${d}?.querySelector('.preview-markdown a')`);
    await run("d.querySelector('.preview-markdown a').click()");
    await until(
      `${d}.documentElement.dataset.openedResource?.endsWith('next.md?mode=read#target')`,
    );
    assert.equal(
      await evaluate(
        `${d}.querySelectorAll('.preview-tabs [role=tab]').length`,
      ),
      1,
    );
    await run(
      "d.querySelector('.preview-markdown a').dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true,shiftKey:true}))",
    );
    await until(`${d}?.querySelector('#target')`);
    const position = await evaluate(
      `(()=>{const d=${d};const e=d.querySelector('#target'),p=e.closest('.preview-markdown-layout');return {target:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,container:p.getBoundingClientRect().top,containerBottom:p.getBoundingClientRect().bottom,scroll:p.scrollTop}})()`,
    );
    assert.ok(
      position.scroll > 100 &&
        position.target >= position.container - 1 &&
        position.bottom <= position.containerBottom + 1,
      JSON.stringify(position),
    );
    assert.equal(
      await evaluate(
        `${d}.querySelector('[data-preview-address]').value.endsWith('next.md?mode=read#target')`,
      ),
      true,
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/preview-document-link-${language}.png`,
    );
  }
  console.log(
    "PASS: authorized file destination/inversion, retained URL suffixes and actual fragment scroll in three layouts",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
