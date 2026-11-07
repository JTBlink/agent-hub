// Run with Vite on :1420 and the shared web-access CDP proxy on :3456.
// Uses synthetic data; no repository mutations are performed.
import assert from "node:assert/strict";
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
  "http://127.0.0.1:1420/tests/browser/git-tag-menu.html",
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
const open = async (selector) => {
  await evaluate(
    `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,cancelable:true,clientX:innerWidth-2,clientY:innerHeight-2})); true`,
  );
  await wait(`!!document.querySelector('[role="menu"]')`);
};
const choose = async (title) => {
  assert.equal(
    await evaluate(
      `(() => {const button=[...document.querySelectorAll('button')].find(item=>item.textContent===${JSON.stringify(title)});if(!button)return false;button.click();return true})()`,
    ),
    true,
    title,
  );
};
try {
  await wait(`!!document.querySelector('summary')`);
  for (const theme of ["dark", "light"])
    for (const scale of [1, 1.2]) {
      await evaluate(
        `document.documentElement.classList.toggle('dark',${theme === "dark"});document.documentElement.style.zoom='${scale}';document.documentElement.style.setProperty('--app-scale','${scale}');document.getElementById('root').style.width='340px'; true`,
      );
      for (const selector of ["summary", '[data-graph-ref="tag"]']) {
        await open(selector);
        assert.equal(
          await evaluate(
            `(() => {const menu=document.querySelector('[role="menu"]');const rect=menu.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight+1&&menu.querySelectorAll('[role="separator"]').length>=3})()`,
          ),
          true,
          `${theme}/${scale}: bounded, grouped menu`,
        );
        assert.equal(
          await evaluate(`document.querySelectorAll('[role="menu"]').length`),
          1,
        );
        assert.deepEqual(
          await evaluate(
            `[...document.querySelectorAll('[role="menuitem"]')].slice(0,5).map(item=>item.textContent)`,
          ),
          [
            "在提交图中打开",
            "检出标签…",
            "推送标签…",
            "删除标签…",
            "创建分支…",
          ],
        );
        await evaluate(
          `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));true`,
        );
        assert.equal(
          await evaluate(`document.activeElement.textContent`),
          "刷新",
        );
        if (theme === "dark" && scale === 1 && selector === "summary")
          await request(
            `/screenshot?target=${targetId}&file=/tmp/agent-hub-tag-menu-dark.png`,
          );
        await evaluate(
          `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
        );
        await wait(`!document.querySelector('[role="menu"]')`);
        assert.equal(
          await evaluate(
            `document.activeElement===document.querySelector(${JSON.stringify(selector)})`,
          ),
          true,
        );
      }
      await open("summary");
      await choose("删除标签…");
      await wait(`!!document.querySelector('[role="alertdialog"]')`);
      assert.equal(
        await evaluate(
          `document.querySelector('[role="alertdialog"]').textContent.includes('远程仓库中的标签会保留')`,
        ),
        true,
      );
      await choose("取消");
      await open("summary");
      await choose("创建分支…");
      await wait(`document.activeElement.tagName==='INPUT'`);
      await evaluate(
        `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.activeElement,'topic/from-tag');document.activeElement.dispatchEvent(new Event('input',{bubbles:true}));true`,
      );
      await evaluate(
        `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));true`,
      );
      await wait(`!!document.querySelector('[role="alert"]')`);
      assert.equal(
        await evaluate(`document.querySelector('input').value`),
        "topic/from-tag",
      );
      await choose("取消");
      await open("summary");
      await choose("推送标签…");
      await wait(`!!document.querySelector('[role="combobox"]')`);
      await evaluate(
        `document.querySelector('[role="combobox"]').click();true`,
      );
      await wait(`!!document.querySelector('[role="listbox"]')`);
      await choose("mirror");
      assert.equal(
        await evaluate(
          `!([...document.querySelectorAll('button')].find(item=>item.textContent==='推送标签').disabled)`,
        ),
        true,
      );
      await choose("取消");
      console.log(
        `PASS ${theme}, ${scale}: list/graph menus, edge bounds, keyboard, dialogs and remote selection`,
      );
    }
  for (const language of ["zh", "en"]) {
    await request(
      `/navigate?target=${targetId}`,
      `http://127.0.0.1:1420/tests/browser/git-tag-menu.html?sorting&language=${language}`,
    );
    const labels =
      language === "zh"
        ? {
            tags: "标签",
            sort: "排序方式",
            date: "按日期排序",
            name: "按名称排序",
            asc: "升序",
            desc: "降序",
          }
        : {
            tags: "Tags",
            sort: "Sort by",
            date: "Date",
            name: "Name",
            asc: "Ascending",
            desc: "Descending",
          };
    await wait(
      `!!document.querySelector('button[aria-label="${labels.tags}"]')`,
    );
    await evaluate(
      `document.querySelector('button[aria-label="${labels.tags}"]').click(); true`,
    );
    await wait(`document.querySelectorAll('.git-history summary').length===4`);
    const names = () =>
      evaluate(
        `[...document.querySelectorAll('.git-history summary')].map(item=>item.title)`,
      );
    assert.deepEqual((await names()).slice(0, 3), [
      "v1.3.0",
      "v1.2.0",
      "v1.10.0",
    ]);
    for (const theme of ["dark", "light"])
      for (const scale of [1, 1.2]) {
        await evaluate(
          `document.documentElement.classList.toggle('dark',${theme === "dark"});document.documentElement.style.zoom='${scale}';document.documentElement.style.setProperty('--app-scale','${scale}');document.getElementById('root').style.width='340px'; true`,
        );
        await open(".git-history summary");
        await choose(labels.sort);
        await wait(`document.querySelectorAll('[role="menu"]').length===2`);
        assert.equal(
          await evaluate(`(() => {
          const menus=[...document.querySelectorAll('[role="menu"]')];
          return menus.every(menu=>{const r=menu.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})
            && document.querySelectorAll('[role="menuitemradio"][aria-checked="true"]').length===2;
        })()`),
          true,
          `${language}/${theme}/${scale}: submenu bounds and checked choices`,
        );
        assert.equal(
          await evaluate(`(() => {
          const item=document.querySelector('[role="menuitemradio"]'); const r=item.getBoundingClientRect();
          return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[role="menuitemradio"]')===item;
        })()`),
          true,
          "submenu is visible and clickable outside the parent panel",
        );
        await evaluate(
          `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
        );
        assert.equal(
          await evaluate(`document.querySelectorAll('[role="menu"]').length`),
          1,
        );
        await choose(labels.sort);
        await choose(labels.date);
        // Date direction initially desc; reset explicitly after previous iterations.
        await open(".git-history");
        await choose(labels.sort);
        await choose(labels.desc);
        assert.deepEqual((await names()).slice(0, 3), [
          "v1.2.0",
          "v1.10.0",
          "v1.3.0",
        ]);
        await open(".git-history");
        await choose(labels.sort);
        await choose(labels.asc);
        assert.deepEqual((await names()).slice(0, 3), [
          "v1.3.0",
          "v1.10.0",
          "v1.2.0",
        ]);
        await open(".git-history summary");
        await choose(labels.sort);
        await choose(labels.name);
        assert.deepEqual((await names()).slice(1), [
          "v1.10.0",
          "v1.2.0",
          "v1.3.0",
        ]);
        await open(".git-history");
        await choose(labels.sort);
        if (theme === "dark" && scale === 1.2 && language === "zh")
          await request(
            `/screenshot?target=${targetId}&file=/tmp/agent-hub-tag-sort.png`,
          );
        await evaluate(
          `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
        );
        await wait(`document.querySelectorAll('[role="menu"]').length===1`);
        await evaluate(
          `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
        );
        await wait(`!document.querySelector('[role="menu"]')`);
        console.log(
          `PASS ${language}/${theme}/${scale}: tag sort submenu, viewport bounds and live ordering`,
        );
      }
  }
} finally {
  await request(`/close?target=${targetId}`);
}
