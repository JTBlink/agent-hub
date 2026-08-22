import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(
  fileURLToPath(new URL("../.scratch/prototypes/d04-ux", import.meta.url)),
);
const port = Number(process.env.AGENT_HUB_PROTOTYPE_PORT ?? 4173);

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

createServer((request, response) => {
  const path = new URL(request.url ?? "/", `http://${request.headers.host}`)
    .pathname;
  const file = resolve(root, path === "/" ? "index.html" : `.${path}`);
  if (!file.startsWith(`${root}/`) || !isFile(file)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`D04 prototype: http://127.0.0.1:${port}/?variant=A`);
});
