// Requires Vite on :1420 and the shared browser CDP proxy on :3456.
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
  "http://127.0.0.1:1420/tests/browser/git-graph-refs.html",
);
const evaluate = async (code) =>
  (await request(`/eval?target=${targetId}`, code)).value;
try {
  const deadline = Date.now() + 30000;
  while (
    !(await evaluate(
      'document.querySelectorAll("[data-commit-index]").length === 4',
    ))
  ) {
    assert.ok(Date.now() < deadline, "Graph preview did not load");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const theme of ["dark", "light"])
    for (const scale of [1, 1.2]) {
      await evaluate(
        `document.documentElement.classList.toggle('dark', ${theme === "dark"}); document.documentElement.style.zoom='${scale}'; document.documentElement.style.setProperty('--app-scale','${scale}');document.getElementById('root').style.width='900px';true`,
      );
      assert.equal(
        await evaluate(`(() => {
          const labels = [...document.querySelectorAll('[data-commit-index], [data-graph-ref]')];
          return labels.every(label => parseFloat(getComputedStyle(label).fontSize) === 13) &&
            labels.every(label => label.getBoundingClientRect().height <= 30 * ${scale}) &&
            [...document.querySelectorAll('[data-commit-index]')].every(button =>
              Math.abs(button.closest('tr').getBoundingClientRect().height - 30 * ${scale}) < 1);
        })()`),
        true,
        `${theme} ${scale}: readable commit/ref text fits the fixed graph rows`,
      );
      assert.equal(
        await evaluate(`(() => {
      const rows = [...document.querySelectorAll('[data-commit-index]')].map(button => button.closest('tr'));
      const x = rows.map(row => Number(row.querySelector('circle').getAttribute('cx')));
      return x[0] > x[2] && x[1] > x[0] &&
        rows[0].querySelectorAll('[data-graph-ref]').length === 1 &&
        rows[2].querySelectorAll('[data-graph-ref]').length === 2 &&
        [...document.querySelectorAll('[data-graph-ref]')].every(badge => badge.scrollWidth <= badge.clientWidth + 1) &&
        document.querySelector('tbody tr svg circle').getAttribute('cx') === String(x[2]);
    })()`),
        true,
        `${theme} ${scale}: full labels and HEAD connection`,
      );
      const ratios = await evaluate(`(async () => {
      const { GRAPH_COLORS, graphBadgeBackground } = await import('/src/lib/gitGraphRefs.ts');
      const canvas = document.createElement('canvas');canvas.width=canvas.height=1;
      const context = canvas.getContext('2d');
      const luminance = color => {
        context.fillStyle=color;context.fillRect(0,0,1,1);
        const [r,g,b] = [...context.getImageData(0,0,1,1).data].slice(0,3).map(value => {
          const c=value/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;
        });return 0.2126*r+0.7152*g+0.0722*b;
      };
      return GRAPH_COLORS.map(color => {
        const sample=document.createElement('span');sample.style.color=color;
        sample.style.background=graphBadgeBackground(color);
        document.body.append(sample);const style=getComputedStyle(sample);
        const a=luminance(style.color),b=luminance(style.backgroundColor);sample.remove();
        return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
      });
    })()`);
      assert.ok(
        ratios.every((ratio) => ratio >= 4.5),
        `${theme}: insufficient branch text contrast: ${ratios}`,
      );
      console.log(
        `PASS: ${theme}, ${scale}; merged/full labels, HEAD connection, all palette text contrast >= 4.5`,
      );
    }
} finally {
  await request(`/close?target=${targetId}`);
}
