// Prerequisites: preview-links.md; PREVIEW_TEST_ORIGIN overrides the default Vite origin.
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
  for (const [language, theme, size, width] of [
    ["zh", "dark", "default", 1440],
    ["en", "light", "xlarge", 960],
    ["zh-TW", "dark", "xlarge", 480],
  ]) {
    await run(
      `const f=document.querySelector('#preview');f.style.width='${width}px';f.src='./preview-workspace.html?view=remote-downloads&language=${language}&theme=${theme}&text-size=${size}'`,
    );
    await until(`${d}?.querySelector('.preview-note')`);
    assert.equal(
      await evaluate(`${d}.querySelector('.preview-note strong').textContent`),
      "server-artifact.bin",
    );
    assert.equal(
      await evaluate(
        `${d}.querySelector('.preview-note .lucide-download, .preview-note .lucide-folder-open')===null`,
      ),
      true,
    );
    assert.ok(
      await evaluate(`${d}.querySelectorAll('.preview-note p').length>=3`),
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/preview-remote-download-${language}.png`,
    );
    await run("d.querySelector('.preview-note button').click()");
    await until(`${d}.querySelector('.preview-note button[title]')?.disabled`);
    await run("d.querySelector('.preview-note button').click()");
    await until(`!${d}.querySelector('.preview-note button[title]')?.disabled`);
    await run("d.querySelector('.preview-note button').click()");
    await until(`${d}.querySelector('.preview-note .lucide-folder-open')`);
    await request(
      `/screenshot?target=${targetId}&file=/tmp/preview-retrieved-${language}.png`,
    );
    await run(
      `const f=document.querySelector('#preview');f.src='./preview-workspace.html?view=remote-settings&language=${language}&theme=${theme}&text-size=${size}'`,
    );
    await until(`${d}?.querySelector('.preview-toolbar .lucide-settings-2')`);
    await run(
      "d.querySelector('.preview-toolbar .lucide-settings-2').closest('button').click()",
    );
    await until(`${d}?.querySelector('.preview-profile-row')`);
    await run("d.querySelector('.preview-profile-row').click()");
    await until(`${d}?.querySelector('input[placeholder=\"/srv/downloads\"]')`);
    await run(
      "const input=d.querySelector('input[placeholder=\"/srv/downloads\"]');input.scrollIntoView({block:'center'})",
    );
    await request(
      `/screenshot?target=${targetId}&file=/tmp/preview-remote-download-settings-${language}.png`,
    );
    await run("d.querySelector('fieldset .app-button-primary').click()");
    await until(`${d}.documentElement.dataset.savedRemoteProfile`);
    const saved = JSON.parse(
      await evaluate(`${d}.documentElement.dataset.savedRemoteProfile`),
    );
    assert.equal(saved.remote_download_directory, "/srv/downloads");
    assert.equal(saved.remote_transfer_target, "browser-host");
    assert.equal(saved.endpoint, "http://127.0.0.1:9222");
  }
  console.log(
    "PASS: remote retrieval, cancellation, retry, truthful local actions and SSH settings in three layouts",
  );
} finally {
  await request(`/close?target=${targetId}`);
}
