/** Read a literal script location from a simple external command without executing it.
 * Shell expressions and interpreter options are deliberately left unresolved. */
export function externalAutomationScriptDirectory(
  command: string,
  workdir: string | null,
): string | null {
  const word = (text: string) => {
    const match = text
      .trimStart()
      .match(/^(?:'([^']*)'|"([^"$`\\]*)"|([^\s'"\\$`;&|<>()]+))(?=\s|$)/);
    return match
      ? {
          value: match[1] ?? match[2] ?? match[3],
          rest: text.trimStart().slice(match[0].length),
        }
      : null;
  };
  const first = word(command.trim().replace(/^&\s+/, ""));
  if (!first) return null;
  const executable = first.value.replace(/\\/g, "/").split("/").pop() ?? "";
  const script =
    /^(?:ba|da|z|k)?sh$|^(?:python[\d.]*|node|ruby|perl|pwsh|powershell)(?:\.exe)?$/i.test(
      executable,
    )
      ? word(first.rest)?.value
      : first.value;
  if (!script || !/\.(?:sh|ps1|py|[cm]?js|rb|pl|bat|cmd)$/i.test(script))
    return null;
  const path = script.replace(/\\/g, "/");
  const absolute = (value: string) => /^(?:\/|[A-Za-z]:\/|~\/)/.test(value);
  const resolved = absolute(path)
    ? path
    : workdir && absolute(workdir.replace(/\\/g, "/"))
      ? `${workdir.replace(/\\/g, "/").replace(/\/$/, "")}/${path}`
      : null;
  if (!resolved) return null;
  const parent = resolved.slice(0, resolved.lastIndexOf("/"));
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent || "/";
}
