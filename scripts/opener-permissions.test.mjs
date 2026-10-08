import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("local Skills folder opening", () => {
  it("allows opening shared hidden and custom Skills paths with the default file manager", () => {
    const capability = read("../src-tauri/capabilities/default.json");
    const config = read("../src-tauri/tauri.conf.json");
    expect(capability.windows).toEqual(["main"]);
    expect(capability.remote).toBeUndefined();
    expect(capability.permissions).toContainEqual({
      identifier: "opener:allow-open-path",
      allow: [{ path: "**" }],
    });
    expect(config.plugins.opener.requireLiteralLeadingDot).toBe(false);
    expect(capability.permissions).toContainEqual({
      identifier: "opener:allow-open-url",
      allow: [{ url: "vscode://file/*" }],
    });
  });
});
