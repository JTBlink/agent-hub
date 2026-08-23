import type { SkillSourceBrowseResult } from "./backend";
import { openExternalUrl } from "./embedded-browser";
import type { SkillSourceMode } from "./skill-source-flow";

export function openExternalSkillSource(url: string) {
  return openExternalUrl(url);
}

export function sourceBrowserUrl(source: SkillSourceBrowseResult["source"]) {
  if (source.kind === "skills-sh") {
    return source.locator.startsWith("https://")
      ? source.locator
      : `https://skills.sh/${source.locator}`;
  }
  if (source.kind === "git" || source.kind === "preset-git") {
    return source.locator.replace(/\.git$/, "");
  }
  return undefined;
}

export function sourceInputBrowserUrl(mode: SkillSourceMode, locator: string) {
  const value = locator.trim();
  if (mode === "skills-sh" && value.startsWith("https://skills.sh/")) {
    return value;
  }
  if (mode === "skills-sh" && /^[^/\s]+\/[^/\s]+$/.test(value)) {
    return `https://skills.sh/${value}`;
  }
  if (mode === "git" && /^https:\/\//.test(value)) {
    return value.replace(/\.git$/, "");
  }
  return undefined;
}
