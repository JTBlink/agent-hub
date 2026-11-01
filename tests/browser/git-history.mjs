// Requires Vite on :1420 and the shared web-access browser proxy on :3456.
import assert from "node:assert/strict";

async function request(path, body) {
  const response = await fetch("http://localhost:3456" + path, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
  return response.json();
}
const { targetId: target } = await request(
  "/new",
  "http://127.0.0.1:1420/tests/browser/git-history.html?theme=dark&language=zh",
);
try {
  const evaluate = async (code) => {
    const r = await request("/eval?target=" + target, code);
    if (r.error) throw Error(JSON.stringify(r.error));
    return r.value;
  };
  async function until(code) {
    const end = Date.now() + 10000;
    while (!(await evaluate(code))) {
      assert(Date.now() < end, code);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await until('document.querySelectorAll(".git-history-commit").length===3');
  assert(
    await evaluate(
      'Array.from(document.querySelectorAll(".git-history-commit > summary")).every(e => e.getBoundingClientRect().height <= parseFloat(getComputedStyle(e).lineHeight) + 9)',
    ),
    "Commit rows should occupy one line without a native marker row",
  );
  await evaluate(
    'document.querySelector(".git-history-commit > summary").click()',
  );
  await until(
    'document.querySelectorAll(".git-history-commit li button").length===3',
  );
  await evaluate(
    'document.querySelector(".git-history-commit li button").click()',
  );
  await until('!!document.querySelector(".git-panel .cm-content")');

  await evaluate(
    'document.querySelector(".git-history button[data-history-filter]").click()',
  );
  await until('!!document.querySelector(".git-history input")');
  await evaluate(
    '(()=>{const el=document.querySelector(".git-history input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,"regression");el.dispatchEvent(new Event("input",{bubbles:true}));return true})()',
  );
  await until('document.querySelectorAll(".git-history-commit").length===1');
  assert(
    await evaluate(
      'document.querySelector(".git-history-commit").innerText.includes("regression")',
    ),
  );
  for (const [theme, language, size] of [
    ["light", "en", "xlarge"],
    ["dark", "zh-TW", "default"],
  ]) {
    await request(
      "/navigate?target=" + target,
      `http://127.0.0.1:1420/tests/browser/git-history.html?theme=${theme}&language=${language}&text-size=${size}`,
    );
    await until('document.querySelectorAll(".git-history-commit").length===3');
    await evaluate(
      'document.querySelector(".git-history-commit > summary").dispatchEvent(new MouseEvent("mouseover",{bubbles:true}))',
    );
    await until("!!document.querySelector('[role=\"tooltip\"]')");
    await until(
      'document.querySelector(\'[role="tooltip"]\').innerText.includes("+18")',
    );
    assert(
      await evaluate(
        '(()=>{const card=document.querySelector(\'[role="tooltip"]\');const r=card.getBoundingClientRect();return r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight && /[0-9]{2}:[0-9]{2}/.test(card.querySelector("time").textContent)})()',
      ),
    );
    await evaluate(
      'document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true}))',
    );
    await until("!document.querySelector('[role=\"tooltip\"]')");
    await evaluate(
      'document.querySelector(".git-history-commit > summary").click()',
    );
    await until(
      '!!document.querySelector(".git-history-commit button[aria-current]") || document.querySelectorAll(".git-history-commit li button").length===3',
    );
    assert(
      await evaluate(
        'document.querySelector(".git-history").scrollWidth <= document.querySelector(".git-history").clientWidth',
      ),
    );
    assert(
      await evaluate(
        '(()=>{const e=document.querySelector(".git-history");return e.getBoundingClientRect().bottom<=innerHeight})()',
      ),
    );
    await evaluate(
      'document.querySelector(".git-history-commit li button").click()',
    );
    await until('!!document.querySelector(".git-panel .cm-content")');
    const collapse =
      language === "en" ? "Collapse all commits" : "收起全部提交";
    await evaluate(
      `document.querySelector('.git-history [aria-label="${collapse}"]').click()`,
    );
    await until(
      'document.querySelectorAll(".git-history-commit[open]").length===0',
    );
    await evaluate(
      'document.querySelector(".git-sidebar").style.setProperty("width", "180px", "important")',
    );
    assert(
      await evaluate(
        'document.querySelector(".git-history").scrollWidth <= document.querySelector(".git-history").clientWidth',
      ),
    );

    for (const [label, name] of language === "en"
      ? [
          ["Branches", "feature/parser"],
          ["Remotes", "origin/feature/parser"],
          ["Stashes", "stash@{0}: Example changes"],
          ["Tags", "v1.0.0"],
        ]
      : [
          ["分支", "feature/parser"],
          ["遠端", "origin/feature/parser"],
          ["暫存堆疊", "stash@{0}: Example changes"],
          ["標籤", "v1.0.0"],
        ]) {
      await evaluate(
        `document.querySelector('.git-history button[aria-label="${label}"]').click()`,
      );
      await until(
        `!!document.querySelector('.git-history summary[title="${name}"]')`,
      );
      await evaluate(
        `document.querySelector('.git-history summary[title="${name}"]').click()`,
      );
      if (label === "Tags" || label === "標籤") {
        await until(
          'document.querySelectorAll(".git-history-commit").length===3',
        );
        await evaluate(
          'document.querySelector(".git-history-commit > summary").click()',
        );
      }
      await until(
        'document.querySelectorAll(".git-history details li button").length===3',
      );
      assert(
        await evaluate(
          'document.querySelector(".git-history").scrollWidth <= document.querySelector(".git-history").clientWidth',
        ),
      );
      const collapseEntries =
        language === "en" ? "Collapse all entries" : "收起全部記錄";
      await evaluate(
        `document.querySelector('.git-history button[aria-label="${collapseEntries}"]').click()`,
      );
      await until(
        'document.querySelectorAll(".git-history details[open]").length===0',
      );
    }
    console.log(
      "PASS",
      theme,
      language,
      size,
      "tree, historical diff, collapse, width",
    );
  }
  await request(
    "/navigate?target=" + target,
    "http://127.0.0.1:1420/tests/browser/git-history.html?theme=dark&language=en&many-commits",
  );
  await until('document.querySelectorAll(".git-history-commit").length===30');
  const loadMore =
    'Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Load more commits")';
  await evaluate(loadMore + ".click()");
  await until('document.querySelectorAll(".git-history-commit").length===40');
  await evaluate(loadMore + ".click()");
  await until('document.querySelectorAll(".git-history-commit").length===45');
  assert(
    await evaluate(
      'document.querySelector(".git-history").innerText.includes("All commits loaded")',
    ),
  );
  assert(!(await evaluate(loadMore + " != null")));
  console.log("PASS recent history load more appends rows and reaches the end");
} finally {
  await request("/close?target=" + target);
}
