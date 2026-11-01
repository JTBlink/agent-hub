// Synthetic task UI: run Vite on :1420 and the shared web-access proxy on :3456.
// Run: node tests/browser/task-panel.mjs. No real platform or Herdr writes occur.
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
  "http://127.0.0.1:1420/tests/browser/product-preview.html?view=tasks",
);
async function evaluate(code) {
  const result = await request(`/eval?target=${targetId}`, code);
  if (result.error) throw new Error(JSON.stringify(result));
  return result.value;
}
async function until(code) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(code)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Task preview not ready: ${code}`);
}
const click = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click();true`);
const clickText = (selector, text) =>
  evaluate(
    `(()=>{const n=[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n)throw new Error('Missing '+${JSON.stringify(text)});n.click();return true})()`,
  );
let savedTaskView;
const savedStarts = new Map();
try {
  await until("!!document.querySelector('tbody tr td')");
  for (const id of ["project-0", "project-1"]) {
    const key = `agent-hub.taskStart:${id}`;
    savedStarts.set(
      key,
      await evaluate(`localStorage.getItem(${JSON.stringify(key)})`),
    );
    await evaluate(`localStorage.removeItem(${JSON.stringify(key)});true`);
  }
  savedTaskView = await evaluate("localStorage.getItem('agent-hub.taskView')");
  await evaluate(
    `localStorage.setItem('agent-hub.taskView',JSON.stringify({provider:'github',projectId:'project-0',filters:{kind:'issue',state:'open',personal:'all',text:'is:issue is:open'}}));true`,
  );
  await request(
    `/navigate?target=${targetId}`,
    "http://127.0.0.1:1420/tests/browser/product-preview.html?view=tasks",
  );
  await until(
    `document.querySelector('[role="radio"][aria-label="GitHub"]')?.getAttribute('aria-checked')==='true'&&document.querySelectorAll('tbody tr').length===3`,
  );
  const iconSize = await evaluate(
    `(()=>{const h=document.querySelector('.workbench-activity-bar svg.activity-bar-icon'),other=document.querySelector('.workbench-activity-bar .codicon.activity-bar-icon');const r=h.getBoundingClientRect(),b=h.querySelector('path').getBBox();return {width:r.width,height:r.height,other:other.getBoundingClientRect().width,markWidth:b.width*r.width/h.viewBox.baseVal.width}})()`,
  );
  assert.equal(iconSize.width, iconSize.other, JSON.stringify(iconSize));
  assert.equal(iconSize.height, 24, JSON.stringify(iconSize));
  assert.ok(iconSize.markWidth <= 16, JSON.stringify(iconSize));
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-sidebar.png`,
  );
  const layout = await evaluate(
    `(()=>{const f=document.querySelector('button[aria-label="筛选条件"]').getBoundingClientRect(),s=document.querySelector('input[maxlength="256"]').getBoundingClientRect();return {filter:(f.top+f.bottom)/2,search:(s.top+s.bottom)/2,query:document.querySelector('input[maxlength="256"]').value}})()`,
  );
  assert.ok(
    Math.abs(layout.filter - layout.search) < 1,
    JSON.stringify(layout),
  );
  await click('button[aria-label="筛选条件"]');
  await clickText('[role="menuitem"]', "远端状态");
  await clickText('[role="dialog"] button', "已关闭");
  await until(
    `document.querySelector('input[maxlength="256"]').value.includes('is:closed')&&document.querySelectorAll('tbody tr').length===1`,
  );
  await evaluate(
    `(()=>{const n=document.querySelector('input[maxlength="256"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'is:issue is:open author:demo label:"needs review"');n.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
  );
  await until(`document.querySelectorAll('tbody tr').length===3`);
  await click('tbody tr button[aria-label^="修改议题"]');
  const githubActions = await evaluate(
    `document.querySelector('[role="menu"]').innerText`,
  );
  for (const action of ["关闭为已完成", "关闭为不计划处理", "作为重复议题关闭"])
    assert.ok(githubActions.includes(action), githubActions);
  await evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
  );
  await click("tbody tr td:nth-child(2) > button");
  await until(
    `!!document.querySelector('aside textarea[placeholder="添加评论…"]')`,
  );
  const details = await evaluate(
    `(()=>{const a=document.querySelector('aside[aria-label="任务详情"]');return {title:a.querySelector('h2').textContent,body:a.querySelector('article').innerText,comments:a.querySelectorAll('article').length}})()`,
  );
  assert.ok(details.title.includes("#121"), JSON.stringify(details));
  assert.ok(
    details.body.includes("Expected behavior"),
    JSON.stringify(details),
  );
  assert.ok(details.comments >= 2, JSON.stringify(details));
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-task-details.png`,
  );
  await clickText('aside[aria-label="任务详情"] button', "开始");
  await until(
    `!!document.querySelector('dialog[open] textarea')&&document.querySelector('dialog[open] button[type="submit"]')?.disabled===false`,
  );
  const launch = await evaluate(
    `(()=>{const d=document.querySelector('dialog[open]');return {title:d.querySelector('h2').textContent,prompt:d.querySelector('textarea').value,worktree:d.querySelector('input[type="checkbox"]').checked}})()`,
  );
  assert.ok(launch.title.includes("从议题开始任务"), JSON.stringify(launch));
  assert.ok(
    launch.prompt.includes("Expected behavior") &&
      launch.prompt.includes("github.com"),
    JSON.stringify(launch),
  );
  assert.equal(launch.worktree, false);
  assert.equal(
    await evaluate(
      `!!document.querySelector('dialog [role="combobox"][aria-label="项目"]')`,
    ),
    false,
  );
  await clickText("dialog summary", "选择 Skill");
  await until(
    `!!document.querySelector('dialog fieldset input[type="checkbox"]')`,
  );
  await click('dialog fieldset input[type="checkbox"]');
  assert.ok(
    await evaluate(
      `document.querySelector('dialog textarea').value.includes('SKILL.md')`,
    ),
  );
  await clickText("dialog summary", "编辑提示词模板");
  await evaluate(
    `(()=>{const n=document.querySelector('textarea[aria-label="提示词模板"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,'Verify issue acceptance and regressions.');n.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
  );
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-task-start.png`,
  );
  await click("dialog[open] > div button");
  await clickText('aside[aria-label="任务详情"] button', "开始");
  await until(
    `document.querySelector('dialog textarea')?.value.startsWith('Verify issue acceptance and regressions.')`,
  );
  assert.ok(
    await evaluate(
      `document.querySelector('dialog textarea').value.includes('SKILL.md')`,
    ),
  );
  await click("dialog[open] > div button");
  await click('aside[aria-label="任务详情"] button[aria-label="返回"]');
  await click('button[role="combobox"][aria-label="项目"]');
  await clickText('[role="option"]', "全部项目");
  await click('[role="radio"][aria-label="GitLab"]');
  await until(
    `!!document.querySelector('tbody tr button[aria-label^="在 GitLab"]')`,
  );
  await click('tbody tr button[aria-label^="修改议题"]');
  const gitlabActions = await evaluate(
    `document.querySelector('[role="menu"]').innerText`,
  );
  assert.ok(
    gitlabActions.includes("未关闭") && gitlabActions.includes("已关闭"),
    gitlabActions,
  );
  assert.ok(!gitlabActions.includes("关闭为已完成"), gitlabActions);
  await evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
  );
  await click("tbody tr td:nth-child(2) > button");
  await until(
    `!!document.querySelector('aside textarea[placeholder="添加评论…"]')`,
  );
  assert.ok(
    await evaluate(
      `!!document.querySelector('aside [title^="gitlab.example.invalid/"]')`,
    ),
  );
  await evaluate(
    `localStorage.setItem('agent-hub.taskView',JSON.stringify({provider:'github',projectId:'project-0',filters:{kind:'issue',state:'open',personal:'all',text:'is:issue is:open'}}));true`,
  );
  await evaluate(
    `(()=>{const f=document.createElement('iframe');f.id='task-preview';f.src='/tests/browser/product-preview.html?view=tasks&theme=light&text-size=xlarge';f.style.cssText='width:760px;height:720px;border:0';document.body.replaceChildren(f);return true})()`,
  );
  await until(
    `!!document.querySelector('#task-preview')?.contentDocument?.querySelector('tbody tr td:nth-child(2) > button')`,
  );
  const doc = "document.querySelector('#task-preview').contentDocument";
  await evaluate(
    `${doc}.querySelector('button[aria-label="筛选条件"]').click();true`,
  );
  const menu = await evaluate(
    `(()=>{const d=${doc},m=d.querySelector('[role="menu"]'),r=m.getBoundingClientRect(),b=d.querySelector('button[aria-label="筛选条件"]').getBoundingClientRect(),s=d.querySelector('input[maxlength="256"]').getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:d.defaultView.innerWidth,height:d.defaultView.innerHeight,filter:(b.top+b.bottom)/2,search:(s.top+s.bottom)/2,zoom:d.documentElement.style.zoom,overflow:d.documentElement.scrollWidth>d.defaultView.innerWidth}})()`,
  );
  assert.ok(
    menu.left >= 0 && menu.right <= menu.width && menu.bottom <= menu.height,
    JSON.stringify(menu),
  );
  assert.equal(menu.overflow, false, JSON.stringify(menu));
  assert.equal(menu.zoom, "1.2");
  assert.ok(Math.abs(menu.filter - menu.search) < 1, JSON.stringify(menu));
  await evaluate(
    `${doc}.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));${doc}.querySelector('tbody tr td:nth-child(2) > button').click();true`,
  );
  await until(`!!${doc}.querySelector('aside[aria-label="任务详情"]')`);
  await evaluate(
    `(()=>{const d=${doc};[...d.querySelectorAll('aside button')].find(n=>n.textContent.trim()==='开始').click();return true})()`,
  );
  await until(
    `${doc}.querySelector('dialog button[type="submit"]')?.disabled===false`,
  );
  const smallDialog = await evaluate(
    `(()=>{const d=${doc},dialog=d.querySelector('dialog'),preview=dialog.querySelector('textarea');preview.scrollIntoView({block:'center'});const r=dialog.getBoundingClientRect(),p=preview.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:d.defaultView.innerWidth,height:d.defaultView.innerHeight,preview:p.height,overflow:dialog.scrollWidth>dialog.clientWidth}})()`,
  );
  assert.ok(
    smallDialog.left >= 0 &&
      smallDialog.right <= smallDialog.width &&
      smallDialog.top >= 0 &&
      smallDialog.bottom <= smallDialog.height,
    JSON.stringify(smallDialog),
  );
  assert.equal(smallDialog.overflow, false, JSON.stringify(smallDialog));
  assert.ok(smallDialog.preview > 300, JSON.stringify(smallDialog));
  await evaluate(
    `${doc}.querySelector('dialog button[type="submit"]').scrollIntoView({block:'end'});true`,
  );
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-task-start-light.png`,
  );
  console.log(
    "Task UI passed: filters, GitHub/GitLab menus and details, remembered Skills/template, full prompt, matching sidebar icon size, light theme and 120% text.",
  );
} catch (error) {
  console.error(
    await evaluate(
      `document.querySelector('#task-preview')?.contentDocument?.body.innerText`,
    ),
  );
  throw error;
} finally {
  for (const [key, value] of savedStarts)
    await evaluate(
      value === null
        ? `localStorage.removeItem(${JSON.stringify(key)});true`
        : `localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(value)});true`,
    );
  if (savedTaskView !== undefined)
    await evaluate(
      savedTaskView === null
        ? "localStorage.removeItem('agent-hub.taskView');true"
        : `localStorage.setItem('agent-hub.taskView',${JSON.stringify(savedTaskView)});true`,
    );
  await request(`/close?target=${targetId}`);
}
