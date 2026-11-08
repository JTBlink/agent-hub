// Release lookup is optional: the static page remains usable offline or on failure.
(async () => {
  try {
    const response = await fetch(
      "https://api.github.com/repos/JTBlink/agent-hub/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-cache",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return;
    const release = await response.json();
    const tag = release.tag_name;
    if (
      release.draft !== false ||
      release.prerelease !== false ||
      typeof tag !== "string" ||
      !/^v?\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(tag)
    )
      return;

    const version = tag.replace(/^v/, "");
    for (const element of document.querySelectorAll("[data-release-version]")) {
      element.textContent = version;
    }
    for (const element of document.querySelectorAll("[data-release-label]")) {
      element.textContent = "最新版本";
    }
    for (const element of document.querySelectorAll("[data-release-note]")) {
      element.textContent = `最新正式版本 ${version}。`;
    }
    for (const element of document.querySelectorAll("[data-release-link]")) {
      element.href = `https://github.com/JTBlink/agent-hub/releases/tag/${encodeURIComponent(tag)}`;
    }
  } catch {
    // Keep the build version when GitHub is unavailable or rate limited.
  }
})();
