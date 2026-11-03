// Prerequisites: preview-workspace fixture and web-access CDP proxy; PREVIEW_TEST_ORIGIN overrides the default Vite origin.
import assert from "node:assert/strict";
const origin = process.env.PREVIEW_TEST_ORIGIN ?? "http://127.0.0.1:4176";
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
  `${origin}/tests/browser/preview-workspace-host.html`,
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
  for (const [
    language,
    theme,
    size,
    width,
    rendererLabel,
    networkLabel,
    serverLabel,
    proxyLabel,
  ] of [
    [
      "zh",
      "dark",
      "default",
      1440,
      "页面渲染位置",
      "页面网络路径",
      "外部内核渲染",
      "指定代理网络",
    ],
    [
      "en",
      "light",
      "xlarge",
      960,
      "Page renderer",
      "Page network route",
      "External browser renderer",
      "Configured proxy network",
    ],
    [
      "zh-TW",
      "dark",
      "xlarge",
      480,
      "頁面渲染位置",
      "頁面網路路徑",
      "外部核心渲染",
      "指定代理網路",
    ],
  ]) {
    await run(
      `const f=document.querySelector('#preview');f.style.width='${width}px';f.src='./preview-workspace.html?view=execution&language=${language}&theme=${theme}&text-size=${size}'`,
    );
    await until(
      `${d}?.location.search.includes("view=execution") && ${d}?.querySelector('.preview-tabs .lucide-plus')`,
    );
    await run(
      "d.querySelector('.preview-tabs .lucide-plus').closest('button').click()",
    );
    await until(
      `${d}.documentElement.dataset.executionPages && JSON.parse(${d}.documentElement.dataset.executionPages).length===1`,
    );
    const original = JSON.parse(
      await evaluate(`${d}.documentElement.dataset.executionPages`),
    )[0];
    assert.equal(
      await evaluate(
        `(()=>{const c=${d}.querySelector('[role=combobox]');return c.getBoundingClientRect().width>0 && getComputedStyle(c).display!=='none'})()`,
      ),
      true,
    );
    await run("d.querySelector('[role=combobox]').click()");
    await run(
      "[...d.querySelectorAll('[role=option]')].find(o=>o.textContent==='External').click()",
    );
    await until(
      `${d}.querySelector('.preview-execution')?.textContent.includes(${JSON.stringify(serverLabel)})`,
    );
    await run("d.querySelector('[role=combobox]').click()");
    await run(
      "[...d.querySelectorAll('[role=option]')].find(o=>o.textContent==='Proxy').click()",
    );
    await until(
      `${d}.querySelector('.preview-execution')?.textContent.includes(${JSON.stringify(proxyLabel)})`,
    );
    const pages = JSON.parse(
      await evaluate(`${d}.documentElement.dataset.executionPages`),
    );
    assert.equal(pages.length, 3);
    assert.equal(pages[0].id, original.id);
    assert.equal(pages[0].profile, "default");
    assert.equal(
      await evaluate(`${d}.documentElement.dataset.executionClosed`),
      "0",
    );
    assert.equal(
      await evaluate(`${d}.querySelectorAll('[role=tab]').length`),
      3,
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/preview-execution-${language}.png`,
    );
    await run(
      "d.querySelector('.preview-toolbar .lucide-settings-2').closest('button').click()",
    );
    await until(`${d}.querySelector('.preview-profile-row')`);
    for (const [label, kind] of [
      [rendererLabel, "renderer"],
      [networkLabel, "network"],
    ]) {
      await run(
        `const label=[...d.querySelectorAll('label')].find(l=>l.textContent.includes(${JSON.stringify(label)}));const button=label.querySelector('[role=combobox]');button.scrollIntoView({block:'center'});button.click()`,
      );
      await until(`${d}.querySelector('[role=listbox]')`);
      await request(
        `/screenshot?target=${targetId}&file=/tmp/preview-execution-${kind}-${language}.png`,
      );
      await run("d.querySelector('[role=option]').click()");
    }
    assert.equal(
      await evaluate(
        `${d}.documentElement.scrollWidth <= ${d}.documentElement.clientWidth`,
      ),
      true,
    );
  }
  console.log(
    "PASS: runtime-location display, new-tab profile routing without closes, renderer/network menus in three locales and layouts",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
