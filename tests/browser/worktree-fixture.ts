import type { ProjectWorktree } from "../../src/lib/worktreeApi";
import { worktreeSearchFixture } from "./worktree-search-fixture";
/** Synthetic project data. Never reads files or creates real worktrees. */
const createdWorktrees = new Map<unknown, ProjectWorktree[]>();
const documents = new Map<string, string>();
function source(path: unknown) {
  if (path === "README.md")
    return [
      "# Demo workspace",
      "",
      "Each worktree has its own terminal sessions.",
      "",
      "## Project layout",
      "",
      "- src/ — application components and styles",
      "- docs/ — architecture and team notes",
      "- tests/ — behavior checks",
      "",
      "## Start working",
      "",
      "1. Choose the main checkout or an existing worktree.",
      "2. Open a terminal in the selected directory.",
      "3. Start the installed Agent for the current task.",
      "",
      "```sh",
      "npm install",
      "npm run dev",
      "npm test",
      "```",
      "",
      "## Working agreement",
      "",
      "Keep changes focused and inspect the diff before committing.",
      "Run the relevant checks and record any remaining limitations.",
      "",
      "```ts",
      "const ready = true;",
      "```",
      "",
      "## Shared skills",
      "",
      "Project skills live in .agents/skills/.",
      "Select a skill group for the current workspace when needed.",
    ].join("\n");
  if (typeof path === "string" && path.endsWith(".rs"))
    return 'pub fn parse(input: &str) -> Result<&str, &\'static str> {\n    if input.is_empty() { return Err("empty input"); }\n    Ok(input.trim())\n}\n';
  if (typeof path === "string" && path.endsWith(".css"))
    return ".workspace { display: flex; gap: 8px; }\n";
  if (typeof path === "string" && path.endsWith(".json"))
    return '{"name":"demo","version":"1.0.0"}\n';
  return "export function startWorkspace() {\n  return { ready: true };\n}\n";
}
export function worktreeFixture(command: string, raw: unknown) {
  const args = typeof raw === "object" && raw !== null ? raw : {};
  const projectId = "projectId" in args ? args.projectId : "project-0";
  const root =
    projectId === "project-1" ? "~/projects/demo-api" : "~/projects/demo-web";
  const path = "relativePath" in args ? args.relativePath : "";
  const documentKey = JSON.stringify([
    projectId,
    "worktreePath" in args ? args.worktreePath : root,
    path,
  ]);
  const searchPreview = worktreeSearchFixture(
    command,
    raw,
    (path) =>
      documents.get(
        JSON.stringify([
          projectId,
          "worktreePath" in args ? args.worktreePath : root,
          path,
        ]),
      ) ?? source(path),
    (path, content) =>
      documents.set(
        JSON.stringify([
          projectId,
          "worktreePath" in args ? args.worktreePath : root,
          path,
        ]),
        content,
      ),
  );
  if (searchPreview.handled) return searchPreview;
  switch (command) {
    case "create_project_worktree": {
      if (!("branch" in args) || !("destination" in args))
        throw new Error("Missing worktree fields");
      if (args.branch === "existing") throw new Error("Branch already exists");
      const tree = {
        path: String(args.destination),
        branch: String(args.branch),
        head: "abcdef1234",
        is_main: false,
        locked: false,
        available: true,
      };
      createdWorktrees.set(projectId, [
        ...(createdWorktrees.get(projectId) ?? []),
        tree,
      ]);
      return { handled: true, value: tree };
    }
    case "get_project_worktrees":
      return {
        handled: true,
        value: [
          ...(createdWorktrees.get(projectId) ?? []),
          {
            path: root,
            branch: "main",
            head: "abcdef1234",
            is_main: true,
            locked: false,
            available: true,
          },
          {
            path: `${root}-worktrees/feature-editor`,
            branch: "feature/editor-layout",
            head: "1234567890",
            is_main: false,
            locked: false,
            available: true,
          },
          {
            path: `${root}-worktrees/review`,
            branch: null,
            head: "deadcafe1234",
            is_main: false,
            locked: true,
            available: true,
          },
          ...(new URLSearchParams(location.search).has("longWorktrees")
            ? Array.from({ length: 7 }, (_, index) => ({
                path: `${root}-worktrees/${index === 0 ? "feature-workspace-navigation-and-branch-controls" : `checkout-${index}`}`,
                branch: `feature/checkout-${index}`,
                head: "abcdef1234",
                is_main: false,
                locked: false,
                available: true,
              }))
            : []),
        ],
      };
    case "get_worktree_files": {
      const path = "relativePath" in args ? args.relativePath : "";
      return {
        handled: true,
        value:
          path === "src"
            ? [
                {
                  name: "app.ts",
                  path: "src/app.ts",
                  is_dir: false,
                  is_symlink: false,
                },
                {
                  name: "styles.css",
                  path: "src/styles.css",
                  is_dir: false,
                  is_symlink: false,
                },
              ]
            : [
                {
                  name: ".agents",
                  path: ".agents",
                  is_dir: true,
                  is_symlink: false,
                },
                { name: "docs", path: "docs", is_dir: true, is_symlink: false },
                { name: "src", path: "src", is_dir: true, is_symlink: false },
                {
                  name: "README.md",
                  path: "README.md",
                  is_dir: false,
                  is_symlink: false,
                },
                {
                  name: "package.json",
                  path: "package.json",
                  is_dir: false,
                  is_symlink: false,
                },
              ],
      };
    }
    case "read_worktree_file":
      return {
        handled: true,
        value: documents.get(documentKey) ?? source(path),
      };
    case "write_worktree_file": {
      if (
        !("content" in args) ||
        typeof args.content !== "string" ||
        !("expectedContent" in args) ||
        args.expectedContent !== (documents.get(documentKey) ?? source(path))
      )
        throw new Error("File changed on disk");
      documents.set(documentKey, args.content);
      return { handled: true, value: null };
    }
    case "get_project_skills":
    case "get_project_agent_targets":
      return { handled: true, value: [] };
    case "get_project_library_status":
      return {
        handled: true,
        value: {
          skills: [],
          files_to_commit: [],
          management_files: [],
          ignored_paths: [],
        },
      };
    case "touch_project_visited":
      return { handled: true, value: null };
    default:
      return { handled: false };
  }
}
