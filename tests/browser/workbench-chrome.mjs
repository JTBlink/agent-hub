// Requires Vite on :1420 and the shared web-access CDP proxy on :3456.
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
  "http://127.0.0.1:1420/tests/browser/product-preview.html?view=worktree",
);
async function evaluate(code) {
  const result = await request(`/eval?target=${targetId}`, code);
  assert.equal(result.error, undefined, JSON.stringify(result));
  return result.value;
}
async function until(code) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(code)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Preview not ready: ${code}`);
}
try {
  await until("!!document.querySelector('footer')");
  await evaluate(
    `document.querySelector('#root').style.visibility='hidden';const frame=document.createElement('iframe');frame.id='chrome-preview';frame.style.cssText='position:fixed;inset:0;width:960px;height:760px;border:0';document.body.append(frame);true`,
  );
  const doc = "document.querySelector('#chrome-preview').contentDocument";
  for (const view of ["worktree", "git", "dashboard"]) {
    await evaluate(
      `document.querySelector('#chrome-preview').src='/tests/browser/product-preview.html?view=${view}';true`,
    );
    await until(
      `(()=>{const d=${doc};return d?.location.search.includes('view=${view}')&&d.readyState==='complete'&&!!d.querySelector('footer')})()`,
    );
    for (const theme of ["light", "dark"]) {
      for (const scale of [1, 1.2]) {
        await evaluate(
          `(()=>{const d=${doc};d.documentElement.classList.toggle('dark',${theme === "dark"});d.documentElement.style.zoom='${scale}';d.documentElement.style.setProperty('--app-scale','${scale}');return true})()`,
        );
        const metrics = await evaluate(
          `(()=>{const d=${doc};const footer=d.querySelector('footer');const rect=footer.getBoundingClientRect();const trigger=d.querySelector('header [role=combobox]');const labels=[...trigger.querySelectorAll('span')];const status=[...footer.querySelectorAll('span,button')].filter(e=>e.getClientRects().length);return {height:rect.height,overflow:d.documentElement.scrollWidth>d.documentElement.clientWidth,labelsVisible:labels.every(e=>e.scrollWidth<=e.clientWidth+1),statusFits:status.every(e=>{const r=e.getBoundingClientRect();return r.top>=rect.top-0.5&&r.bottom<=rect.bottom+0.5})}})()`,
        );
        assert.ok(
          Math.abs(metrics.height - 22) < 0.2,
          `${view}/${theme}/${scale}: ${JSON.stringify(metrics)}`,
        );
        assert.equal(metrics.overflow, false, `${view}: document overflow`);
        assert.equal(
          metrics.labelsVisible,
          true,
          `${view}/${theme}/${scale}: truncated title label`,
        );
        assert.equal(
          metrics.statusFits,
          true,
          `${view}/${theme}/${scale}: clipped status content`,
        );
      }
    }
  }
  console.log(
    "PASS: complete project/branch labels and 22px status bar at 960px, both themes and 100%/120%, across workspace, Git and dashboard.",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
