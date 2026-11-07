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
const chooseProvider = async (label) => {
  await click('[role="combobox"][aria-label="平台"]');
  await clickText('[role="option"]', label);
};
let savedTaskView;
const savedStarts = new Map();
try {
  await until(
    `!!document.querySelector('[role="combobox"][aria-label="项目"]')`,
  );
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
    `document.querySelector('[role="combobox"][aria-label="平台"]')?.textContent.includes('GitHub')&&document.querySelectorAll('tbody tr').length===3`,
  );
  await click('[role="combobox"][aria-label="平台"]');
  assert.deepEqual(
    await evaluate(
      `Array.from(document.querySelectorAll('[role="option"]')).map(n=>n.textContent.trim())`,
    ),
    ["全部平台", "GitHub", "GitLab"],
  );
  await clickText('[role="option"]', "GitHub");
  await until(
    `document.querySelector('button[aria-label="登录账号"]')?.innerText.includes('@demo')`,
  );
  assert.ok(
    await evaluate(
      `document.querySelector('button[aria-label="登录账号"]').title.includes('GitHub · github.com · @demo')`,
    ),
  );
  await evaluate(
    `document.querySelector('button[aria-label="登录账号"]').focus();true`,
  );
  await click('button[aria-label="登录账号"]');
  await until(
    `document.querySelector('dialog[open]')?.innerText.includes('@demo')`,
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector('section[aria-label="仓库连接"]')`,
    ),
    false,
  );
  await clickText("dialog button", "切换账号");
  await until(
    `document.querySelector('dialog')?.innerText.includes('@reviewer')`,
  );
  await clickText('dialog [role="radio"]', "GitLab");
  await until(
    `document.querySelector('dialog')?.innerText.includes('gitlab.example.invalid · 当前账号')`,
  );
  await clickText("dialog button", "添加账号");
  await until(
    `document.querySelectorAll('dialog [role="combobox"]').length===2`,
  );
  assert.ok(
    await evaluate(
      `document.querySelectorAll('dialog [role="combobox"]')[1].innerText.includes('Auth 登录')`,
    ),
  );
  await evaluate(
    `document.querySelectorAll('dialog [role="combobox"]')[1].click();true`,
  );
  await clickText('dialog [role="option"]', "访问令牌（Token）");
  await until(`!!document.querySelector('dialog input[type="password"]')`);
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-platform-accounts-dark.png`,
  );
  // Token sign-in uses synthetic IPC; no actual credentials or CLI authentication changes.
  await evaluate(
    `(()=>{const inputs=document.querySelectorAll('dialog input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(inputs[0],'git-secondary.example.invalid');inputs[0].dispatchEvent(new Event('input',{bubbles:true}));set.call(inputs[1],'fixture-token');inputs[1].dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
  );
  await clickText("dialog button", "登录并验证");
  await until(
    `document.querySelector('dialog')?.innerText.includes('git-secondary.example.invalid · 当前账号') && document.querySelector('dialog [role="combobox"]')?.innerText.includes('git-secondary.example.invalid') && !document.querySelector('dialog input[type="password"]') && document.querySelector('dialog').getAttribute('aria-busy') !== 'true'`,
  );
  assert.ok(
    await evaluate(
      `document.querySelector('dialog [role="combobox"]').innerText.includes('git-secondary.example.invalid')`,
    ),
  );
  await click('dialog [role="combobox"]');
  await until(`document.querySelectorAll('dialog [role="option"]').length===3`);
  assert.ok(
    await evaluate(
      `document.querySelector('dialog').contains(document.querySelector('[role="option"]'))`,
    ),
  );
  assert.ok(
    await evaluate(
      `[...document.querySelectorAll('dialog [role="option"]')].at(-1).innerText.includes('gitlab.com · 未登录')`,
    ),
  );
  await clickText('dialog [role="option"]', "gitlab.example.invalid · @demo");
  await until(
    `document.querySelector('dialog')?.innerText.includes('gitlab.example.invalid · 当前账号')`,
  );
  await clickText("dialog button", "添加账号");
  await until(
    `document.querySelectorAll('dialog [role="combobox"]').length===2`,
  );
  await evaluate(
    `document.querySelectorAll('dialog [role="combobox"]')[1].click();true`,
  );
  await clickText('dialog [role="option"]', "Auth 登录");
  await clickText("dialog button", "登录并验证");
  await until(`!!document.querySelector('dialog .terminal-emulator canvas')`);
  await clickText("dialog button", "取消授权");
  await until(
    `!document.querySelector('dialog .terminal-emulator') && !document.querySelector('dialog button[aria-label="关闭"]').disabled`,
  );
  await clickText('dialog [role="radio"]', "GitHub");
  await until(
    `document.querySelector('dialog')?.innerText.includes('@reviewer')`,
  );
  await clickText("dialog button", "添加账号");
  await until(`!!document.querySelector('dialog form')`);
  await clickText("dialog button", "登录并验证");
  await until(
    `document.querySelector('dialog [aria-label="设备授权验证码"]')?.innerText.includes('DEMO-1234')`,
  );
  assert.equal(
    await evaluate(
      `document.querySelector('dialog button[aria-label="关闭"]').disabled`,
    ),
    true,
  );
  await evaluate(
    `document.querySelector('dialog').dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true}));document.querySelector('dialog').click();true`,
  );
  assert.ok(await evaluate(`document.querySelector('dialog').open`));
  await evaluate(
    `(()=>{window.dispatchEvent(new Event('blur'));document.querySelector('dialog').close();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});window.dispatchEvent(new Event('focus'));delete document.visibilityState;return true})()`,
  );
  assert.ok(
    await evaluate(
      `document.querySelector('dialog').open && document.querySelector('dialog [aria-label="设备授权验证码"]').innerText.includes('DEMO-1234')`,
    ),
  );
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-auth-device-flow.png`,
  );
  await clickText("dialog button", "取消授权");
  await until(
    `!document.querySelector('dialog .terminal-emulator') && !document.querySelector('dialog button[aria-label="关闭"]').disabled`,
  );
  await click('dialog button[aria-label="关闭"]');
  assert.equal(
    await evaluate(`document.activeElement?.getAttribute('aria-label')`),
    "登录账号",
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
  await chooseProvider("GitLab");
  await until(
    `document.querySelector('[role="alert"]')?.textContent.includes('demo-web')`,
  );
  assert.ok(
    await evaluate(
      `document.querySelector('[role="alert"]').textContent.includes('GitHub')`,
    ),
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes('未找到可自动识别')`),
    false,
  );
  const reminder = await evaluate(
    `(()=>{const n=document.querySelector('[role="alert"]'),f=document.querySelector('button[aria-label="筛选条件"]'),p=document.querySelector('[role="combobox"][aria-label="项目"]');return {top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,filterTop:f.getBoundingClientRect().top,projectBottom:p.getBoundingClientRect().bottom,color:getComputedStyle(n).color,warning:getComputedStyle(document.documentElement).getPropertyValue('--color-warning')}})()`,
  );
  assert.ok(
    reminder.top >= reminder.projectBottom &&
      reminder.bottom <= reminder.filterTop,
    JSON.stringify(reminder),
  );
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-task-reminder-dark.png`,
  );
  await click('button[role="combobox"][aria-label="项目"]');
  await clickText('[role="option"]', "demo-api");
  await until(
    `!!document.querySelector('tbody tr button[aria-label^="在 GitLab"]')`,
  );
  assert.equal(
    await evaluate(`!!document.querySelector('[role="alert"]')`),
    false,
  );
  assert.deepEqual(
    await evaluate(
      `JSON.parse(localStorage.getItem('agent-hub.taskView')).projectIds`,
    ),
    ["project-0", "project-1"],
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[role="combobox"][aria-label="项目"] [aria-label="已选 2 个项目"]')?.textContent.trim()`,
    ),
    "2",
  );
  const countLayout = await evaluate(
    `(()=>{const p=document.querySelector('[role="combobox"][aria-label="项目"]'),b=p.querySelector('[aria-label="已选 2 个项目"]'),r=b.getBoundingClientRect(),v=p.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,parentLeft:v.left,parentRight:v.right,fullNames:p.title}})()`,
  );
  assert.ok(
    countLayout.width > 0 &&
      countLayout.left >= countLayout.parentLeft &&
      countLayout.right <= countLayout.parentRight,
    JSON.stringify(countLayout),
  );
  assert.equal(countLayout.fullNames, "demo-web, demo-api");
  const selectedRow = await evaluate(
    `(()=>{const list=document.querySelector('ul[aria-label="已选 2 个项目"]'),r=list.getBoundingClientRect(),p=document.querySelector('[role="combobox"][aria-label="项目"]').getBoundingClientRect(),f=document.querySelector('button[aria-label="筛选条件"]').getBoundingClientRect();return {names:[...list.querySelectorAll('li > span:not([role]):first-of-type')].map(n=>n.textContent),text:list.innerText,top:r.top,bottom:r.bottom,projectBottom:p.bottom,filterTop:f.top}})()`,
  );
  assert.ok(
    selectedRow.text.includes("demo-web") &&
      selectedRow.text.includes("demo-api") &&
      selectedRow.text.includes("3"),
    JSON.stringify(selectedRow),
  );
  assert.ok(
    selectedRow.top >= selectedRow.projectBottom &&
      selectedRow.bottom <= selectedRow.filterTop,
    JSON.stringify(selectedRow),
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('[role="option"][aria-selected="true"]').length`,
    ),
    2,
  );
  assert.deepEqual(
    await evaluate(
      `Array.from(document.querySelectorAll('[role="option"] [role="img"]')).map(node=>node.getAttribute('aria-label'))`,
    ),
    ["GitHub", "GitLab"],
  );
  await evaluate(
    `document.querySelector('[role="combobox"][aria-label="项目"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
  );
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-task-repository-chips-dark.png`,
  );
  await click('[role="combobox"][aria-label="项目"]');
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-task-projects-dark.png`,
  );
  await clickText('[role="option"]', "demo-web");
  await until(`!document.querySelector('[role="alert"]')`);
  assert.equal(
    await evaluate(
      `document.querySelector('[role="option"][aria-selected="true"]').textContent.trim()`,
    ),
    "demo-api",
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[role="option"][aria-selected="true"]').disabled`,
    ),
    true,
  );
  await clickText('[role="option"]', "全部项目");
  assert.deepEqual(
    await evaluate(
      `JSON.parse(localStorage.getItem('agent-hub.taskView')).projectIds`,
    ),
    [],
  );
  await evaluate(
    `document.querySelector('[role="combobox"][aria-label="项目"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`,
  );
  await click('button[role="combobox"][aria-label="项目"]');
  await clickText('[role="option"]', "全部项目");
  await chooseProvider("GitLab");
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
    `${doc}.querySelector('[role="combobox"][aria-label="项目"]').click();true`,
  );
  const projectMenu = await evaluate(
    `(()=>{const d=${doc},m=d.querySelector('[role="listbox"]'),r=m.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:d.defaultView.innerWidth,height:d.defaultView.innerHeight,zoom:d.documentElement.style.zoom,overflow:d.documentElement.scrollWidth>d.defaultView.innerWidth,multiple:m.getAttribute('aria-multiselectable')}})()`,
  );
  assert.ok(
    projectMenu.left >= 0 &&
      projectMenu.right <= projectMenu.width &&
      projectMenu.bottom <= projectMenu.height,
    JSON.stringify(projectMenu),
  );
  assert.equal(projectMenu.overflow, false);
  assert.equal(projectMenu.zoom, "1.2");
  assert.equal(projectMenu.multiple, "true");
  await evaluate(
    `(()=>{const d=${doc};[...d.querySelectorAll('[role="option"]')].find(n=>n.textContent.trim()==='demo-api').click();return true})()`,
  );
  await until(
    `!!${doc}.querySelector('[role="combobox"] [aria-label="已选 2 个项目"]')`,
  );
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-task-projects-light.png`,
  );
  await evaluate(
    `(()=>{const d=${doc};d.querySelector('[role="combobox"][aria-label="项目"]').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true})()`,
  );
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
  await evaluate(
    `document.querySelector('#task-preview').src='/tests/browser/product-preview.html?view=tasks&theme=light&text-size=xlarge&many-projects';true`,
  );
  await until(
    `${doc}.querySelector('[role="combobox"][aria-label="项目"]')?.textContent.includes('demo-project-1')`,
  );
  await evaluate(
    `${doc}.querySelector('[role="combobox"][aria-label="项目"]').click();true`,
  );
  for (let index = 2; index <= 12; index++) {
    await evaluate(
      `(()=>{const d=${doc};[...d.querySelectorAll('[role="option"]')].find(n=>n.textContent.trim()===${JSON.stringify("demo-project-" + index)}).click();return true})()`,
    );
  }
  await evaluate(
    `(()=>{const d=${doc};d.querySelector('[role="combobox"][aria-label="项目"]').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true})()`,
  );
  await until(`!!${doc}.querySelector('ul[aria-label="已选 12 个项目"]')`);
  const overflowingProjects = await evaluate(
    `(()=>{const d=${doc},list=d.querySelector('ul[aria-label="已选 12 个项目"]');return {count:list.children.length,scroll:list.scrollWidth,width:list.clientWidth,overflow:d.documentElement.scrollWidth>d.defaultView.innerWidth,tabIndex:list.tabIndex}})()`,
  );
  assert.equal(overflowingProjects.count, 12);
  assert.ok(
    overflowingProjects.scroll > overflowingProjects.width,
    JSON.stringify(overflowingProjects),
  );
  assert.equal(overflowingProjects.overflow, false);
  assert.equal(overflowingProjects.tabIndex, 0);
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-task-repository-chips-light.png`,
  );
  await evaluate(
    `${doc}.querySelector('button[aria-label="登录账号"]').click();true`,
  );
  await until(
    `!!${doc}.querySelector('dialog[open]') && ${doc}.querySelector('dialog').innerText.includes('@demo')`,
  );
  await evaluate(
    `(()=>{const d=${doc};[...d.querySelectorAll('dialog button')].find(button=>button.textContent.trim()==='添加账号').click();return true})()`,
  );
  await until(`${doc}.querySelector('dialog').innerText.includes('Auth 登录')`);
  const accountLayout = await evaluate(
    `(()=>{const d=${doc},m=d.querySelector('dialog'),r=m.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:d.defaultView.innerWidth,height:d.defaultView.innerHeight,overflow:d.documentElement.scrollWidth>d.defaultView.innerWidth}})()`,
  );
  assert.ok(
    accountLayout.left >= 0 &&
      accountLayout.right <= accountLayout.width &&
      accountLayout.bottom <= accountLayout.height,
    JSON.stringify(accountLayout),
  );
  assert.equal(accountLayout.overflow, false);
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-platform-accounts-light.png`,
  );
  await evaluate(
    `${doc}.querySelector('dialog button[aria-label="关闭"]').click();true`,
  );
  console.log(
    "Task UI passed: independent platform accounts, token login, site and account switching, filters, GitHub/GitLab menus and details, remembered Skills/template, full prompt, matching sidebar icon size, light theme and 120% text.",
  );
} catch (error) {
  await request(
    `/screenshot?target=${targetId}&file=/tmp/agent-hub-auth-preview-failure.png`,
  );
  console.error(
    await evaluate(
      `document.querySelector('#task-preview')?.contentDocument?.body.innerText ?? document.body.innerText`,
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
