import { describe, expect, it } from "vitest";
import i18next from "i18next";
import { mapGitErrorMessage } from "./gitErrors";

const i18n = i18next.createInstance();
await i18n.init({
  lng: "en",
  fallbackLng: false,
  resources: {
    en: {
      translation: {
        settings: {
          gitErrorAuth: "http auth",
          gitErrorSshAuth: "ssh auth",
          gitErrorCredentialRead: "credential read",
          gitErrorCredentialMissing: "credential missing",
          gitErrorGeneric: "generic",
          gitErrorNetwork: "network",
        },
      },
    },
  },
});

describe("Git authentication errors", () => {
  it("distinguishes rejected HTTPS credentials from SSH key rejection", () => {
    expect(
      mapGitErrorMessage(
        "fatal: Authentication failed for 'https://example.invalid/repo.git'",
        i18n.t,
      ),
    ).toBe("http auth");
    expect(
      mapGitErrorMessage(
        "git@example.invalid: Permission denied (publickey).",
        i18n.t,
      ),
    ).toBe("ssh auth");
    expect(
      mapGitErrorMessage("remote: Invalid username or token.", i18n.t),
    ).toBe("http auth");
  });
  it("preserves authentication errors wrapped as network failures", () => {
    expect(
      mapGitErrorMessage(
        { kind: "network", message: "GitHub returned HTTP 401" },
        i18n.t,
      ),
    ).toBe("http auth");
    expect(
      mapGitErrorMessage(
        { kind: "network", message: "Failed to connect" },
        i18n.t,
      ),
    ).toBe("network");
  });
  it("does not label filesystem permissions or unavailable credentials as an expired token", () => {
    expect(
      mapGitErrorMessage(
        "fatal: cannot open '.git/FETCH_HEAD': Permission denied",
        i18n.t,
      ),
    ).toContain("generic");
    expect(
      mapGitErrorMessage(
        "fatal: could not read Username: terminal prompts disabled",
        i18n.t,
      ),
    ).toBe("credential missing");
    expect(mapGitErrorMessage("Cannot read local Git credential", i18n.t)).toBe(
      "credential read",
    );
  });
});
