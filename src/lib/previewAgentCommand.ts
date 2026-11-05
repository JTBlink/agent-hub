/** POSIX shell text for copying only; commands are never evaluated by the renderer. */
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const words = (values: string[]) => values.map(quote).join(" ");
export function previewAgentCommand(input: {
  session: string;
  pane?: string;
  path: string;
  title: string;
  prompt: string;
  launch: { kind: string | null; program: string; arguments: string[] };
  native?: boolean;
}) {
  const { launch } = input;
  if (input.native)
    return `cd ${quote(input.path)}\n${words([launch.program, ...launch.arguments])}`;
  const base = `herdr --session ${quote(input.session)}`;
  // Mirror the transport's positional handling for dash-prefixed feedback.
  const prompt = quote(
    input.prompt.startsWith("-") ? `\n${input.prompt}` : input.prompt,
  );
  if (input.pane) return `${base} agent prompt ${quote(input.pane)} ${prompt}`;
  const lines = [
    `workspace=$(${base} workspace create --cwd ${quote(input.path)} --label ${quote(input.title)} --no-focus)`,
    `pane=$(printf '%s' "$workspace" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const v=JSON.parse(s);const p=(v.result??v).root_pane?.pane_id;if(!p)process.exit(1);process.stdout.write(p)})')`,
    `test -n "$pane" || exit 1`,
  ];
  if (launch.kind && launch.program === launch.kind) {
    // Names must be unique across live Agents, including separately copied previews.
    lines.push(`name="page-$(date +%s)-$$"`);
    lines.push(
      `${base} agent start "$name" --kind ${quote(launch.kind)} --pane "$pane" --timeout 30000 -- ${words(launch.arguments)} || exit 1`,
    );
  } else {
    lines.push(
      `${base} pane run "$pane" ${quote(words([launch.program, ...launch.arguments]))} || exit 1`,
    );
    lines.push(`${base} agent wait "$pane" --timeout 30000 || exit 1`);
  }
  lines.push(`${base} agent prompt "$pane" ${prompt}`);
  return lines.join("\n");
}
