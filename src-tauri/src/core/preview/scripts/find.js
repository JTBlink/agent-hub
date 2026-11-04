(() => {
  const text = __TEXT__,
    backwards = __BACKWARDS__;
  if (!text) return { found: false, count: 0 };
  const found = window.find(text, false, backwards, true);
  const content = (document.body?.innerText || "").toLowerCase(),
    needle = text.toLowerCase();
  let count = 0,
    start = 0;
  while (count < 10000) {
    const index = content.indexOf(needle, start);
    if (index < 0) break;
    count++;
    start = index + needle.length;
  }
  return { found, count: found ? Math.max(1, count) : count };
})();
