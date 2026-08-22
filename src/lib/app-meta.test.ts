import { describe, expect, it } from "vitest";

import { APP_NAME, APP_TAGLINE } from "./app-meta";

describe("application metadata", () => {
  it("describes the AgentHub product", () => {
    expect(APP_NAME).toBe("AgentHub");
    expect(APP_TAGLINE).toContain("配置");
    expect(APP_TAGLINE).toContain("Skills");
  });
});
