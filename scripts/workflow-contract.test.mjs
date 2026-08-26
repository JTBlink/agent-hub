import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const readText = (url) => readFileSync(url, "utf8").replaceAll("\r\n", "\n");
const installers = readText(
  new URL("../.github/workflows/build-installers.yml", import.meta.url),
);
const ci = readText(new URL("../.github/workflows/ci.yml", import.meta.url));
const pages = readText(
  new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
);
const desktopIndex = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8",
);
const websiteIndex = readFileSync(
  new URL("../homepage/index.html", import.meta.url),
  "utf8",
);

describe("GitHub Actions workflow contract", () => {
  it("keeps the desktop and GitHub Pages entrypoints separate", () => {
    expect(desktopIndex).toContain('<div id="root"></div>');
    expect(desktopIndex).toContain(
      '<script type="module" src="/src/main.tsx"></script>',
    );
    expect(desktopIndex).not.toContain("Changelog / live feed");
    expect(websiteIndex).toContain("Changelog / live feed");
    expect(pages).toContain("npm run homepage:build -- _site/index.html");
  });

  it("uses official actions backed by the Node.js 24 runtime", () => {
    for (const workflow of [installers, ci]) {
      expect(workflow).not.toContain("actions/checkout@v4");
      expect(workflow).not.toContain("actions/setup-node@v4");
    }
    expect(installers).toContain("actions/checkout@v5");
    expect(installers).toContain("actions/setup-node@v5");
    expect(ci).toContain("actions/checkout@v5");
    expect(ci).toContain("actions/setup-node@v5");
  });

  it("supports manual and v-tag installer builds", () => {
    expect(installers).toContain("workflow_dispatch:");
    expect(installers).toMatch(/branches:\n\s+- main/);
    expect(installers).toMatch(/tags:\n\s+- "v\*"/);
    expect(installers).toContain("ref: ${{ github.ref }}");
    expect(installers).not.toContain("inputs.ref");
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

  it("routes installer builds through the shared Node orchestrator", () => {
    expect(installers).toContain(
      "run: npm run app:build -- ${{ matrix.tauri_args }}",
    );
    expect(installers).not.toContain("run: npm run tauri build --");
  });

  it("isolates production Apple secrets from manual builds", () => {
    expect(installers).toContain(
      "if: github.event_name == 'workflow_dispatch' || runner.os != 'macOS' || vars.ENABLE_APPLE_SIGNING != 'true'",
    );
    expect(installers).toContain(
      "if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') && runner.os == 'macOS' && vars.ENABLE_APPLE_SIGNING == 'true'",
    );
    expect(installers).not.toMatch(/^\s+APPLE_RELEASE_SIGNING:/m);
    expect(installers).toContain(
      "name: Validate Apple signing and notarization configuration",
    );
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

  it("runs platform configuration, recovery, and migration checks", () => {
    expect(installers).toContain(
      "name: Run cross-platform configuration and persistence tests",
    );
    expect(installers).toContain("--test agent_configs");
    expect(installers).toContain("--test diagnostic_recovery");
    expect(installers).toContain("--test persistence");
    expect(installers).toContain("agent-hub --smoke");
    expect(installers).toContain("--smoke");
  });

  it("captures the Windows GUI smoke exit code explicitly", () => {
    expect(installers).toContain(
      '$smoke = Start-Process -FilePath $executable -ArgumentList "--smoke" -Wait -PassThru',
    );
    expect(installers).toContain(
      'if ($smoke.ExitCode -ne 0) { throw "Installed AgentHub package smoke checks failed (exit code $($smoke.ExitCode))" }',
    );
    expect(installers).not.toContain(
      "& $executable --smoke\n          if ($LASTEXITCODE -ne 0)",
    );
  });

  it("validates notarization only for signed tag builds", () => {
    expect(installers).toContain("name: Verify macOS notarization");
    expect(installers).toContain("xcrun stapler validate");
    expect(installers).toContain("spctl --assess --type execute");
    const notarization = installers.match(
      /- name: Verify macOS notarization[\s\S]*?(?=\n      - name:|\n  package:)/,
    )?.[0];
    expect(notarization).toContain("github.event_name == 'push'");
    expect(notarization).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(notarization).toContain("vars.ENABLE_APPLE_SIGNING == 'true'");
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
    expect(installers).toContain(
      "if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')",
    );
    expect(installers).toContain("needs: [preflight, package]");
    expect(installers).toContain("contents: write");
    expect(installers).not.toContain("publish_release:");
    expect(installers).not.toContain("inputs.release_tag");
    expect(installers).toContain(
      "tag_name: ${{ needs.preflight.outputs.release_tag }}",
    );
    expect(installers).toContain(
      "name: AgentHub ${{ needs.preflight.outputs.release_tag }}",
    );
    expect(installers).toContain(
      "target_commitish: ${{ needs.preflight.outputs.resolved_sha }}",
    );
    expect(installers).toContain("generate_release_notes: false");
    expect(installers).toContain("release-assets/CHANGELOG.md");
    expect(installers).toContain("retention-days: 90");
    expect(installers).toContain("release-assets/SHA256SUMS");
    expect(installers).toContain("npm run release:verify -- release-assets");
    for (const extension of ["exe", "msi", "dmg", "AppImage", "deb"]) {
      expect(installers).toContain(`release-assets/*.${extension}`);
    }
  });

  it("does not ask the release action to update an existing release", () => {
    expect(installers).toContain(
      "name: Check whether GitHub Release already exists",
    );
    expect(installers).toContain("gh api --silent");
    expect(installers).toContain(
      "if: steps.existing_release.outputs.exists != 'true'",
    );
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
    expect(ci).toContain("npm run tasks:check");
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

  it("keeps production publishing behind immutable preflight output", () => {
    expect(installers).toContain(
      "resolved_sha: ${{ steps.resolve_ref.outputs.sha }}",
    );
    expect(installers).toContain(
      "ref: ${{ needs.preflight.outputs.resolved_sha }}",
    );
    expect(installers).toContain("fail_on_unmatched_files: true");
    expect(installers).toContain("contents: write");
  });
});
