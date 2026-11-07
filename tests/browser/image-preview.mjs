// Requires Vite on :4179 and the shared web-access proxy on :3456.
// Uses only synthetic data and the production file-tree/Git image components.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
const origin = process.env.IMAGE_PREVIEW_ORIGIN || "http://127.0.0.1:4179";
async function request(path, body) {
  return (
    await fetch("http://localhost:3456" + path, {
      method: body === undefined ? "GET" : "POST",
      body,
    })
  ).json();
}
for (const query of ["", "?light&large"]) {
  const { targetId } = await request(
    "/new",
    `${origin}/tests/browser/image-preview.html${query}`,
  );
  assert.ok(targetId);
  const evaluate = async (code) => {
    const result = await request(`/eval?target=${targetId}`, code);
    assert.equal(result.error, undefined, JSON.stringify(result));
    return result.value;
  };
  const until = async (code) => {
    for (let i = 0; i < 60; i++) {
      await request(
        `/screenshot?target=${targetId}&file=${encodeURIComponent(join(tmpdir(), "agent-hub-image-frame.png"))}`,
      );
      if (await evaluate(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timed out: " + code);
  };
  const click = (label, index = 0) =>
    evaluate(
      `document.querySelectorAll('button[aria-label="${label}"]')[${index}].click();true`,
    );
  try {
    await until(
      `document.querySelectorAll('img').length===2 && [...document.querySelectorAll('img')].every(i=>i.complete && i.naturalWidth===1024)`,
    );
    assert.equal(
      await evaluate(`document.querySelectorAll('.cm-editor').length`),
      0,
    );
    if (!query) {
      const metrics = await evaluate(`(async () => {
        const bytes = await (await fetch('/docs/images/automation-hermes.png')).arrayBuffer();
        const blob = new Blob([bytes], {type:'image/png'});
        const dataUrl = await new Promise(resolve => {const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob)});
        const sample = async (src) => {const i=new Image();const start=performance.now();i.src=src;await i.decode();const ms=performance.now()-start;i.src='';return ms};
        const binary=[], base64=[];
        const url=URL.createObjectURL(blob);
        try {for(let n=0;n<5;n++) {binary.push(await sample(url));base64.push(await sample(dataUrl));}}finally{URL.revokeObjectURL(url)}
        return {rawBytes:bytes.byteLength,base64UrlBytes:dataUrl.length,binaryDecodeMs:binary,base64DecodeMs:base64};
      })()`);
      console.log(
        "MEASURE browser decode only (excludes Rust/IPC; no timing threshold): " +
          JSON.stringify(metrics),
      );
    }
    await click("Zoom in");
    await until(
      `document.querySelector('[aria-label="Image controls"]').textContent.includes('125%')`,
    );
    for (let i = 0; i < 6; i++) await click("Zoom in");
    await until(
      `document.querySelector('img').parentElement.parentElement.scrollWidth>document.querySelector('img').parentElement.parentElement.clientWidth`,
    );
    await click("Reset to fit");
    await click("Open larger preview");
    await until(`!!document.querySelector('dialog[open] img')?.naturalWidth`);
    assert.equal(
      await evaluate(
        `document.querySelector('dialog').contains(document.activeElement)`,
      ),
      true,
    );
    await evaluate(
      `document.querySelector('dialog button[aria-label="Close"]').click();true`,
    );
    await until(`!document.querySelector('dialog')`);
    await click("Stacked");
    assert.equal(
      await evaluate(
        `document.querySelector('[aria-label="Stacked"]').getAttribute('aria-pressed')`,
      ),
      "true",
    );
    await evaluate(`document.querySelector('main').style.width='600px';true`);
    await click("Side by side");
    await until(
      `[...document.querySelectorAll('img')].every(i=>i.getBoundingClientRect().width<300)`,
    );
    const screenshot = join(
      tmpdir(),
      `agent-hub-image-preview${query ? "-light-large" : "-dark"}.png`,
    );
    await request(
      `/screenshot?target=${targetId}&file=${encodeURIComponent(screenshot)}`,
    );
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(b=>b.textContent==='new.svg').click();true`,
    );
    await until(
      `document.body.textContent.includes('No image in this version') && document.querySelectorAll('img').length===1`,
    );
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(b=>b.textContent==='Toggle file tree').click();true`,
    );
    await until(
      `document.querySelectorAll('img').length===1 && document.querySelector('img').complete`,
    );
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(b=>b.textContent==='broken.png').click();true`,
    );
    await until(
      `document.querySelector('[role="alert"]')?.textContent.includes('Unable to load image preview')`,
    );
    console.log(
      `PASS ${query || "dark"}: binary routing, decode, zoom/scroll, popup/focus, layouts, narrow container, added image, file tree and corrupt image. Screenshot: ${screenshot}`,
    );
  } finally {
    await request(`/close?target=${targetId}`);
  }
}
