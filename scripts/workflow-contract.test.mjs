import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const installers = readFileSync(
  new URL("../.github/workflows/build-installers.yml", import.meta.url),
  "utf8",
);
const ci = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

describe("GitHub Actions workflow contract", () => {
  it("supports manual and v-tag installer builds", () => {
    expect(installers).toContain("workflow_dispatch:");
    expect(installers).toMatch(/tags:\n\s+- "v\*"/);
    expect(installers).toContain("inputs.ref || github.ref");
    expect(installers).toContain(
      'if [[ "$GITHUB_EVENT_NAME" == "push" && "$GITHUB_REF" == refs/tags/v* ]]; then',
    );
    expect(installers).not.toContain("VERSION_REF=");
  });

  it("resolves a requested ref once and builds the same immutable commit", () => {
    expect(installers).toContain(
      "resolved_sha: ${{ steps.resolve_ref.outputs.sha }}",
    );
    expect(installers).toContain('echo "sha=$(git rev-parse HEAD)"');
    expect(
      installers.match(
        /ref: \$\{\{ needs\.preflight\.outputs\.resolved_sha \}\}/g,
      ),
    ).toHaveLength(3);
  });

  it.each([
    ["windows-latest", "--bundles nsis,msi", ".exe", ".msi"],
    ["macos-latest", "--target universal-apple-darwin", ".dmg", ".dmg"],
    ["ubuntu-24.04", "--bundles appimage,deb", ".AppImage", ".deb"],
  ])(
    "builds the documented installers on %s",
    (runner, args, first, second) => {
      expect(installers).toContain(`os: ${runner}`);
      expect(installers).toContain(args);
      expect(installers).toContain(`*${first}`);
      expect(installers).toContain(`*${second}`);
    },
  );

  it("isolates production Apple secrets from manual builds", () => {
    expect(installers).toContain(
      "if: github.event_name == 'workflow_dispatch' || runner.os != 'macOS' || vars.ENABLE_APPLE_SIGNING != 'true'",
    );
    expect(installers).toContain(
      "if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') && runner.os == 'macOS' && vars.ENABLE_APPLE_SIGNING == 'true'",
    );
    expect(installers).not.toMatch(/^\s+APPLE_RELEASE_SIGNING:/m);
  });

  it("documents optional Windows signing behind a tag-only switch", () => {
    expect(installers).toContain("vars.ENABLE_WINDOWS_SIGNING == 'true'");
    expect(installers).toContain("name: Sign Windows installers");
    expect(installers).toContain("signtool.exe");
    expect(installers).toContain("WINDOWS_CERTIFICATE_PASSWORD");
    expect(installers).toContain(
      "if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') && runner.os == 'Windows' && vars.ENABLE_WINDOWS_SIGNING == 'true'",
    );
  });

  it("assembles complete artifacts before publishing tag releases", () => {
    expect(installers).toContain(
      'run: npm run release:assemble -- release-assets "$BUILD_REF"',
    );
    expect(installers).toContain(
      "run: npm run release:verify -- release-assets",
    );
    expect(installers).toContain(
      "name: agent-hub-installers-${{ github.run_id }}",
    );
    expect(installers).toMatch(
      /release:\n[\s\S]*if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)[\s\S]*needs: package/,
    );
    expect(installers).toContain("contents: write");
    expect(installers).toContain("release-assets/SHA256SUMS");
    for (const extension of ["exe", "msi", "dmg", "AppImage", "deb"]) {
      expect(installers).toContain(`release-assets/*.${extension}`);
    }
  });

  it("never treats a manually selected tag as a production release", () => {
    for (const productionCondition of installers.matchAll(
      /^\s*if: .*startsWith\(github\.ref, 'refs\/tags\/v'\).*$/gm,
    )) {
      expect(productionCondition[0]).toContain("github.event_name == 'push'");
    }
  });

  it("runs the full quality gate on main, pull requests, and manually", () => {
    expect(ci).toContain("branches: [main]");
    expect(ci).toContain("pull_request:");
    expect(ci).toContain("workflow_dispatch:");
    for (const command of [
      "npm run format:check",
      "npm run lint",
      "npm run test",
      "npm run build",
      "cargo fmt",
      "cargo clippy",
      "cargo test",
    ]) {
      expect(ci).toContain(command);
    }
  });
});
