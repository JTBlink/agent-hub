import { expect, it } from "vitest";
import { githubAuthChallenge } from "./authChallenge";
it("extracts the device prompt only for the selected host", () => {
  const prompt =
    "First copy your one-time code: DEMO-1234\nPress Enter to open https://github.com/login/device in your browser...";
  expect(githubAuthChallenge(prompt, "github.com")).toEqual({
    code: "DEMO-1234",
    url: "https://github.com/login/device",
    enterToOpen: true,
  });
  expect(githubAuthChallenge(prompt, "enterprise.example.invalid")).toBeNull();
  expect(githubAuthChallenge("token: private-value", "github.com")).toBeNull();
});
