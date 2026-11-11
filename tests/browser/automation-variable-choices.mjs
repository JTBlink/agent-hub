// Run with Vite on :1420 and the shared web-access CDP proxy on :3456.
// Synthetic fixture only; no installed tasks are changed.
import assert from "node:assert/strict";
const origin =
  process.env.AGENT_HUB_BROWSER_TEST_ORIGIN ?? "http://127.0.0.1:1420";

async function request(path, body) {
  const response = await fetch(`http://localhost:3456${path}`, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  assert.ok(response.ok);
  const result = await response.json();
  assert.equal(result.error, undefined, result.error);
  return result;
}
const { targetId } = await request(
  "/new",
  `${origin}/tests/browser/automation-prompts.html`,
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
const wait = async (code) => {
  const end = Date.now() + 15000;
  while (!(await evaluate(code))) {
    assert.ok(Date.now() < end, `Timed out: ${code}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
try {
  for (const width of [380, 900])
    for (const language of ["zh", "en"])
      for (const theme of ["dark", "light"])
        for (const scale of [1, 1.25]) {
          console.log(`Checking ${width}px/${language}/${theme}/${scale}`);
          await request(
            `/navigate?target=${targetId}`,
            `${origin}/tests/browser/automation-prompts.html?width=${width}&language=${language}&theme=${theme}&scale=${scale}`,
          );
          await wait(
            `!!document.querySelector('input[aria-label="${language === "zh" ? "变量值 1" : "Variable value 1"}"]')`,
          );
          await evaluate(
            `document.querySelector('details').open=true; document.querySelector('button[role="combobox"]').scrollIntoView({block:'center'}); true`,
          );
          assert.equal(
            await evaluate(
              `(() => {const button=document.querySelector('button[role="combobox"]'); const input=button.parentElement.previousElementSibling; const b=button.getBoundingClientRect(), i=input.getBoundingClientRect(); return Math.abs(b.height-i.height)<0.5 && Math.abs(b.top-i.top)<0.5 && Math.abs(b.bottom-i.bottom)<0.5 && Math.abs(b.left-i.right)<0.5})()`,
            ),
            true,
            "Dropdown trigger matches the input height and joins its right edge",
          );
          await evaluate(
            `document.querySelector('button[role="combobox"]').click(); true`,
          );
          await wait(`!!document.querySelector('[role="listbox"]')`);
          assert.equal(
            await evaluate(
              `(() => {const button=document.querySelector('button[role="combobox"]'); const field=button.parentElement.parentElement.getBoundingClientRect(); const menu=document.querySelector('[role="listbox"]').getBoundingClientRect(); return Math.abs(menu.left-field.left)<1 && Math.abs(menu.width-field.width)<1})()`,
            ),
            true,
            "Menu aligns with the full value field, not just its arrow button",
          );
          assert.deepEqual(
            await evaluate(
              `[...document.querySelectorAll('[role="option"]')].map(item=>item.textContent)`,
            ),
            ["own", "all"],
          );
          assert.equal(
            await evaluate(
              `(() => {const menu=document.querySelector('[role="listbox"]'); const r=menu.getBoundingClientRect(); return r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1})()`,
            ),
            true,
          );
          await evaluate(
            `document.querySelectorAll('[role="option"]')[1].click(); true`,
          );
          await wait(
            `document.querySelector('input[aria-label="${language === "zh" ? "变量值 1" : "Variable value 1"}"]').value==='all'`,
          );
          await evaluate(
            `document.querySelector('button[role="combobox"]').click(); true`,
          );
          await wait(`!!document.querySelector('[role="listbox"]')`);
          await evaluate(
            `document.querySelector('button[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})); true`,
          );
          await evaluate(
            `document.querySelector('button[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); true`,
          );
          await wait(
            `document.querySelector('input[aria-label="${language === "zh" ? "变量值 1" : "Variable value 1"}"]').value==='own'`,
          );
          // Switch editor scenario to test explicit choices and long-label layout.
          await evaluate(
            `document.querySelectorAll('button[aria-label^="${language === "zh" ? "编辑「" : "Edit "}"]')[1].click(); true`,
          );
          await wait(
            `document.querySelector('input[aria-label="${language === "zh" ? "变量值 1" : "Variable value 1"}"]').value==='all'`,
          );
          await evaluate(
            `document.querySelector('details').open=true; document.querySelector('button[role="combobox"]').scrollIntoView({block:'center'}); document.querySelector('button[role="combobox"]').click(); true`,
          );
          await wait(`document.querySelectorAll('[role="option"]').length===3`);
          assert.equal(
            await evaluate(
              `(() => {const r=document.querySelector('[role="listbox"]').getBoundingClientRect(); return r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1})()`,
            ),
            true,
          );
          await evaluate(
            `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true`,
          );
          assert.equal(
            await evaluate(`document.querySelector('[role="listbox"]')===null`),
            true,
          );
        }
  await evaluate(
    `(() => {const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='Add variable'); button.click(); return true})()`,
  );
  await wait(`!!document.querySelector('input[aria-label="Variable name 2"]')`);
  assert.equal(
    await evaluate(
      `document.querySelector('input[aria-label="Variable suggestions 2"]').closest('details').open`,
    ),
    true,
  );
  await evaluate(
    `(() => {const input=document.querySelector('input[aria-label="Variable name 2"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'mode'); input.dispatchEvent(new Event('input',{bubbles:true})); return true})()`,
  );
  await evaluate(
    `(() => {const data=new DataTransfer(); data.setData('text','own\\nall\\nown'); document.querySelector('input[aria-label="Variable suggestions 2"]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data})); return true})()`,
  );
  await wait(
    `!!document.querySelector('button[aria-label="Remove suggestion all"]')`,
  );
  await evaluate(
    `document.querySelector('button[aria-label="Confirm variable"]').click(); true`,
  );
  await wait(
    `!!document.querySelector('button[aria-label="Choose variable value 2"]')`,
  );
  await evaluate(
    `document.querySelector('button[aria-label="Choose variable value 2"]').scrollIntoView({block:'center'}); document.querySelector('button[aria-label="Choose variable value 2"]').click(); true`,
  );
  await wait(`document.querySelectorAll('[role="option"]').length===3`);
  assert.deepEqual(
    await evaluate(
      `[...document.querySelectorAll('[role="option"]')].map(item=>item.textContent)`,
    ),
    ["(Empty value)", "own", "all"],
  );
  await evaluate(
    `document.querySelectorAll('[role="option"]')[2].click(); true`,
  );
  await wait(
    `document.querySelector('input[aria-label="Variable value 2"]').value==='all'`,
  );
  console.log(
    "Variable dropdown: selection, keyboard, scenario switching and long-label bounds passed in Chinese/English, dark/light and 100%/125% scale.",
  );
} catch (error) {
  console.error(
    await evaluate(
      `({url:location.href,text:document.body.innerText.slice(0,1500)})`,
    ),
  );
  throw error;
} finally {
  await request(`/close?target=${targetId}`);
}
