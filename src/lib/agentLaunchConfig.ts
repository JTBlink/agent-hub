/** Portable launch data only. Installation, paths and credentials retain their existing owners. */
export interface AgentLaunchDocument {
  schema_version: number;
  default_agent: string;
  instructions: Record<string, string>;
}
export interface AgentLaunchSnapshot {
  document: AgentLaunchDocument;
  revision: string;
  defaults: Record<string, string>;
}

export const launchShortcuts: Record<
  string,
  { label: string; flag: string }[]
> = {
  codex: [
    { label: "fullAccess", flag: "--dangerously-bypass-approvals-and-sandbox" },
    { label: "search", flag: "--search" },
    { label: "scrollback", flag: "--no-alt-screen" },
  ],
  claude_code: [
    { label: "fullAccess", flag: "--dangerously-skip-permissions" },
    { label: "continue", flag: "--continue" },
    { label: "verbose", flag: "--verbose" },
  ],
  opencode: [
    { label: "continue", flag: "--continue" },
    { label: "logs", flag: "--print-logs" },
  ],
  hermes: [
    { label: "fullAccess", flag: "--yolo" },
    { label: "continue", flag: "--continue" },
    { label: "tui", flag: "--tui" },
  ],
};

/** Locate complete argv tokens without rewriting quoted values or unrelated spacing. */
function tokens(command: string) {
  const result: { start: number; end: number; raw: string }[] = [];
  let quote = "",
    start = -1,
    escaped = false;
  for (let i = 0; i <= command.length; i++) {
    const c = command[i];
    if (start < 0) {
      if (c === undefined || /\s/.test(c)) continue;
      start = i;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === undefined || /\s/.test(c)) {
      result.push({ start, end: i, raw: command.slice(start, i) });
      start = -1;
    }
  }
  return quote || escaped ? null : result;
}
export function shortcutSelected(command: string, flag: string) {
  const parsed = tokens(command);
  if (!parsed) return false;
  const end = parsed.findIndex((token) => token.raw === "--");
  return parsed
    .slice(1, end < 0 ? undefined : end)
    .some((token) => token.raw === flag);
}
export function toggleLaunchShortcut(command: string, flag: string) {
  const parsed = tokens(command);
  if (!parsed) return command; // Never rewrite an unfinished quoted draft.
  const end = parsed.findIndex((token) => token.raw === "--");
  const matches = parsed
    .slice(1, end < 0 ? undefined : end)
    .filter((token) => token.raw === flag);
  if (!matches.length) {
    const index = end < 0 ? command.length : parsed[end].start;
    return `${command.slice(0, index).trimEnd()} ${flag}${end < 0 ? "" : ` ${command.slice(index)}`}`;
  }
  let next = command;
  for (const token of matches.reverse())
    next = next.slice(0, token.start) + next.slice(token.end);
  return next.trim();
}
