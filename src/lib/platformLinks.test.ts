import { expect, it } from "vitest";
import { platformUrl } from "./platformLinks";

it("resolves a relative platform link on the bound host and rejects foreign destinations", () => {
  const host = "code.example.invalid";
  expect(platformUrl("/team/repo/-/runners/32", host)).toBe(
    "https://code.example.invalid/team/repo/-/runners/32",
  );
  expect(
    platformUrl("https://other.example.invalid/team/repo", host),
  ).toBeNull();
  expect(
    platformUrl("https://user@code.example.invalid/team/repo", host),
  ).toBeNull();
  expect(platformUrl("http://code.example.invalid/team/repo", host)).toBeNull();
});
