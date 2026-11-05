import entries from "./catalog.json";
const list = document.querySelector("#entries");
const count = document.querySelector("#count");
const search = document.querySelector("#search");
const empty = document.querySelector("#empty");
const theme = document.querySelector("#theme");
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  theme.setAttribute("aria-pressed", String(dark));
  theme.textContent = dark ? "切换浅色主题" : "切换深色主题";
}
applyTheme(matchMedia("(prefers-color-scheme: dark)").matches);
theme.addEventListener("click", () =>
  applyTheme(!document.documentElement.classList.contains("dark")),
);
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function render() {
  const query = search.value.trim().toLocaleLowerCase();
  const visible = entries.filter((entry) =>
    `${entry.title} ${entry.id} ${entry.description} ${entry.status}`
      .toLocaleLowerCase()
      .includes(query),
  );
  list.replaceChildren();
  for (const entry of visible) {
    const row = node("article");
    const content = node("div", "", "content");
    const heading = node("div", "", "heading");
    heading.append(
      node("h2", entry.title),
      node("span", entry.status, entry.branch ? "status archived" : "status"),
    );
    const source = entry.branch
      ? `${entry.branch} · ${entry.commit}`
      : entry.source;
    const location = node("code", source, "source");
    location.title = source;
    heading.append(location);
    content.append(heading, node("p", entry.description));
    const actions = node("div", "", "actions");
    if (entry.path) {
      const link = node("a", "打开原型", "open");
      link.href = entry.path;
      link.setAttribute("aria-label", `打开${entry.title}原型`);
      actions.append(link);
      for (const layout of entry.layouts ?? []) {
        const variant = node("a", `方案 ${layout}`);
        variant.href = `${entry.path}?variant=${layout}`;
        actions.append(variant);
      }
    } else actions.append(node("span", "保留在历史分支", "archived-note"));
    row.append(content, actions);
    list.append(row);
  }
  count.textContent = `${visible.length} / ${entries.length} 个原型与设计存档`;
  empty.hidden = visible.length > 0;
}
search.addEventListener("input", render);
render();
