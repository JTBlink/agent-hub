import type { GitStatus } from "../../src/lib/gitApi";

const snapshots = new Map<string, GitStatus>();
const patch = `diff --git a/src/parser.rs b/src/parser.rs
--- a/src/parser.rs
+++ b/src/parser.rs
@@ -1,4 +1,7 @@
 pub fn parse(input: &str) -> Result<&str, &'static str> {
-    let value = input;
-    Ok(value)
+    if input.is_empty() {
+        return Err("empty input");
+    }
+    let value = input.trim();
+    Ok(value)
 }
`;
/** Stateful synthetic Git data. Never modifies a real index, file or commit. */
export function gitFixture(
  command: string,
  raw: unknown,
): { handled: boolean; value?: unknown } {
  if (
    ![
      "get_project_git_status",
      "get_project_git_diff",
      "set_project_git_staged",
      "commit_project_git",
    ].includes(command)
  )
    return { handled: false };
  const args = typeof raw === "object" && raw !== null ? raw : {};
  const key = JSON.stringify([
    "projectId" in args ? args.projectId : "",
    "worktreePath" in args ? args.worktreePath : "",
  ]);
  let snapshot = snapshots.get(key);
  if (!snapshot) {
    snapshot = {
      branch: "feature/parser",
      head: "abcdef1234567890",
      upstream: "origin/feature/parser",
      ahead: 2,
      behind: 1,
      state: "Clean",
      truncated: false,
      files: [
        {
          path: "README.md",
          staged: true,
          unstaged: false,
          conflicted: false,
          status: "modified",
        },
        {
          path: "src/parser.rs",
          staged: false,
          unstaged: true,
          conflicted: false,
          status: "modified",
        },
        {
          path: "src/components/Workspace.tsx",
          staged: false,
          unstaged: true,
          conflicted: false,
          status: "modified",
        },
        {
          path: "src/components/Toolbar.tsx",
          staged: false,
          unstaged: true,
          conflicted: false,
          status: "added",
        },
        {
          path: "src/styles/workspace.css",
          staged: false,
          unstaged: true,
          conflicted: false,
          status: "modified",
        },
        {
          path: "docs/architecture/workspace.md",
          staged: false,
          unstaged: true,
          conflicted: false,
          status: "added",
        },
        {
          path: "tests/parser.rs",
          staged: false,
          unstaged: true,
          conflicted: false,
          status: "modified",
        },
      ],
      commits: [
        {
          sha: "abcdef1234567890",
          summary: "Handle empty parser input",
          author: "example",
          time: 1793408400,
        },
        {
          sha: "123456abcdef7890",
          summary: "Add parser regression coverage",
          author: "example",
          time: 1793322000,
        },
        {
          sha: "abcdef9876543210",
          summary: "Refine workspace navigation",
          author: "example",
          time: 1793235600,
        },
      ],
    };
    snapshots.set(key, snapshot);
  }
  if (command === "get_project_git_status")
    return { handled: true, value: structuredClone(snapshot) };
  if (command === "get_project_git_diff") {
    if (new URLSearchParams(location.search).has("wrap-diff"))
      return {
        handled: true,
        value: `@@ -1,5 +1,6 @@\n start\n-${"old source ".repeat(25)}\n-old short\n+new short\n+${"updated source ".repeat(30)}\n+extra line\n middle\n-end\n+finish\n`,
      };
    if (new URLSearchParams(location.search).has("long-diff")) {
      const body = Array.from({ length: 480 }, (_, index) =>
        index % 80 === 40
          ? `-const previous${index} = ${index};\n+const updated${index} = ${index + 1};`
          : index % 80 === 5
            ? ` const longLine${index} = "${"example-source-".repeat(18)}";`
            : ` const line${index} = ${index};`,
      ).join("\n");
      return {
        handled: true,
        value: `diff --git a/demo.ts b/demo.ts\n--- a/demo.ts\n+++ b/demo.ts\n@@ -1,480 +1,480 @@\n${body}\n`,
      };
    }
    return { handled: true, value: patch };
  }
  if (command === "set_project_git_staged") {
    const paths =
      "paths" in args && Array.isArray(args.paths) ? args.paths : [];
    for (const file of snapshot.files)
      if (paths.includes(file.path)) {
        file.staged = "staged" in args && args.staged === true;
        file.unstaged = !file.staged;
      }
  }
  if (command === "commit_project_git") {
    snapshot.files = snapshot.files.filter((file) => !file.staged);
    snapshot.commits.unshift({
      sha: "fedcba1234567890",
      summary: "message" in args ? String(args.message) : "Example commit",
      author: "example",
      time: 1793494800,
    });
  }
  return { handled: true, value: null };
}
