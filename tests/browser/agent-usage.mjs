// Vite :1420 + the shared web-access CDP proxy :3456. Synthetic quota only.
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
  "http://127.0.0.1:1420/tests/browser/agent-usage-host.html",
);
async function evaluate(code) {
  const result = await request(`/eval?target=${targetId}`, code);
  if (result.error) {
    const diagnostic = await request(
      `/eval?target=${targetId}`,
      `(()=>{try{return eval(${JSON.stringify(code)})}catch(error){return {message:String(error),url:location.href,frames:[...document.querySelectorAll('iframe')].map(f=>({src:f.src,body:f.contentDocument?.body?.innerText}))}}})()`,
    );
    assert.fail(JSON.stringify({ result, diagnostic }));
  }
  return result.value;
}
async function until(code) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await evaluate(code)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Preview not ready: ${code}; ${await evaluate("document.body.innerText.slice(0,1500)")}`,
  );
}
try {
  await until("!!document.querySelector('#root')");
  const doc = "document.querySelector('#usage-preview')?.contentDocument";
  let statusHeight;
  for (const [width, language, theme, textSize] of [
    [1440, "zh", "dark", "default"],
    [960, "en", "light", "xlarge"],
    [480, "zh-TW", "dark", "xlarge"],
  ]) {
    await until(
      `(()=>{const f=document.querySelector('#usage-preview');if(!f)return false;f.style.width='${width}px';const src='/tests/browser/agent-usage.html?language=${language}&theme=${theme}&text-size=${textSize}';if(f.getAttribute('src')!==src){f.src=src;return false}const d=f.contentDocument;return d?.location.search.includes('language=${language}')&&!!d.querySelector('footer button[aria-haspopup="dialog"]')})()`,
    );
    await evaluate(
      `${doc}.querySelector('footer button[aria-haspopup="dialog"]').click();true`,
    );
    await until(`!!${doc}.querySelector('[role="progressbar"]')`);
    const metrics = await evaluate(
      `(()=>{const d=${doc},p=d.querySelector('[role="dialog"]'),r=p.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:d.defaultView.innerWidth,height:d.defaultView.innerHeight,overflow:d.documentElement.scrollWidth>d.defaultView.innerWidth,bar:d.querySelector('footer').getBoundingClientRect().height,progress:[...p.querySelectorAll('[role="progressbar"]')].map(n=>n.getAttribute('aria-valuenow')),text:p.textContent,dark:d.documentElement.classList.contains('dark'),scale:Number(d.documentElement.style.getPropertyValue('--app-scale')||1)}})()`,
    );
    assert.equal(metrics.dark, theme === "dark");
    assert.equal(metrics.scale, textSize === "xlarge" ? 1.2 : 1);
    assert.ok(
      metrics.text.includes(language === "en" ? "Agent usage" : "Agent 用量"),
    );
    assert.equal(metrics.overflow, false, JSON.stringify(metrics));
    assert.ok(
      metrics.left >= 0 &&
        metrics.right <= metrics.width &&
        metrics.top >= 0 &&
        metrics.bottom < metrics.height,
      JSON.stringify(metrics),
    );
    assert.ok(Math.abs(metrics.bar - 32) < 1, `Status bar: ${metrics.bar}`);
    assert.deepEqual(metrics.progress, ["23", "81", "0"]);
    if (width === 1440)
      await request(
        `/screenshot?target=${targetId}&file=/tmp/agent-hub-usage-preview.png`,
      );
    assert.ok(!metrics.text.includes("agentUsage."), metrics.text);
    await evaluate(
      `(()=>{const d=${doc};d.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true})()`,
    );
    await until(`!${doc}.querySelector('[role="dialog"]')`);
    assert.ok(
      await evaluate(
        `${doc}.activeElement===${doc}.querySelector('footer button[aria-haspopup="dialog"]')`,
      ),
    );
  }
  console.log(
    "PASS: Agent usage details, reset times, zero usage, both themes, three languages, 120% text, 480px viewport and Escape focus restoration.",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
