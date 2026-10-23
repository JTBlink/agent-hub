import { describe, expect, it } from "vitest";
import { compareDeclaredSkillVersions } from "./skillVersions";

describe("declared Skill version precedence", () => {
  it.each([
    ["0.4.2", "0.3.0", "central_newer"],
    ["1.9.0", "1.10.0", "source_newer"],
    ["v1.0.0-rc.1", "1.0.0", "source_newer"],
    ["1.0.0+a", "1.0.0+b", "same_version"],
    [null, "1.0.0", "unknown"],
    ["workspace", "1.0.0", "unknown"],
  ] as const)(
    "compares %s to %s without guessing",
    (installed, repository, expected) => {
      expect(compareDeclaredSkillVersions(installed, repository)).toBe(
        expected,
      );
    },
  );
});
