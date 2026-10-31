import type { RepositoryTask, TaskBinding } from "../../src/lib/tauri";

const bindings: TaskBinding[] = ["github", "gitlab"].map((provider, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  project_id: `project-${index}`,
  provider: provider === "github" ? "github" : "gitlab",
  host: provider === "github" ? "github.com" : "gitlab.example.invalid",
  repository: index ? "demo/platform/demo-api" : "demo/demo-web",
  launcher: null,
}));
const callbacks = new Map<string, (event: unknown) => void>();
const sequences = new Map<string, number>();
let nextTerminal = 0;
let installed = !new URLSearchParams(location.search).has("herdr-missing");
function emit(id: string, text: string) {
  const sequence = (sequences.get(id) || 0) + 1;
  sequences.set(id, sequence);
  const bytes = new TextEncoder().encode(text);
  callbacks.get(id)?.({
    kind: "output",
    seq: sequence,
    data: btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")),
  });
}
function task(
  binding: TaskBinding,
  index: number,
  review: boolean,
): RepositoryTask {
  return {
    key: `${binding.id}/${index}`,
    binding_id: binding.id,
    project_id: binding.project_id,
    provider: binding.provider,
    host: binding.host,
    repository: binding.repository,
    kind: review ? "review" : "issue",
    number: 120 + index,
    title: [
      "Improve project terminal keyboard input",
      "Keep task filters when returning from details",
      "Clarify repository connection errors",
      "Review the command palette interaction",
    ][index % 4],
    state: index % 3 ? "open" : "closed",
    updated_at: "2026-10-31T09:00:00Z",
    assignees: ["demo"],
    url: `https://${binding.host}/${binding.repository}/issues/${120 + index}`,
  };
}
/** Synthetic IPC only: never starts a process, downloads a tool or reads credentials. */
export function taskTerminalFixture(
  command: string,
  raw: unknown,
): { handled: boolean; value?: unknown } {
  const args = typeof raw === "object" && raw !== null ? raw : {};
  if (command === "task_bindings") return { handled: true, value: bindings };
  if (command === "task_list") {
    const binding =
      bindings.find(
        (binding) => "bindingId" in args && binding.id === args.bindingId,
      ) || bindings[0];
    const review =
      "filters" in args &&
      typeof args.filters === "object" &&
      args.filters !== null &&
      "kind" in args.filters &&
      args.filters.kind === "review";
    return {
      handled: true,
      value: {
        items: Array.from({ length: 4 }, (_, index) =>
          task(binding, index + 1, review),
        ),
        identity: "demo",
        has_more: false,
        limited: false,
      },
    };
  }
  if (command === "task_detail") {
    const query =
      "query" in args && typeof args.query === "object" && args.query !== null
        ? args.query
        : {};
    const binding =
      bindings.find(
        (binding) => "binding_id" in query && binding.id === query.binding_id,
      ) || bindings[0];
    const index =
      "number" in query && typeof query.number === "number"
        ? query.number - 120
        : 1;
    return {
      handled: true,
      value: {
        summary: task(
          binding,
          index,
          "kind" in query && query.kind === "review",
        ),
        body: "## Expected behavior\n\nKeep the terminal spacious and preserve the current input.\n\n- Open the correct project\n- Inspect and copy the task context\n- Continue work in a normal Shell",
        comments: [
          {
            id: 1,
            author: "demo",
            body: "Please verify keyboard navigation and the narrow layout.",
            updated_at: "2026-10-31T09:00:00Z",
          },
        ],
        has_more_comments: false,
      },
    };
  }
  if (
    command === "task_cancel" ||
    command === "terminal_ack" ||
    command === "terminal_resize"
  )
    return { handled: true };
  if (command === "terminal_project_directory")
    return { handled: true, value: "~/projects/demo-web" };
  if (command === "terminal_create") {
    const id = `preview-${++nextTerminal}`;
    if (
      "events" in args &&
      typeof args.events === "object" &&
      args.events !== null &&
      "onmessage" in args.events &&
      typeof args.events.onmessage === "function"
    ) {
      const channel = args.events;
      callbacks.set(id, (event) => {
        if (typeof channel.onmessage === "function") channel.onmessage(event);
      });
    }
    setTimeout(
      () =>
        emit(
          id,
          "\x1b[36mAgentHub terminal · synthetic preview\x1b[0m\r\n~/projects/demo-web $ ",
        ),
      80,
    );
    return {
      handled: true,
      value: {
        id,
        project_id: "project-0",
        cwd: "~/projects/demo-web",
        exited: false,
      },
    };
  }
  if (command === "terminal_write") {
    if (
      "id" in args &&
      typeof args.id === "string" &&
      "data" in args &&
      typeof args.data === "string"
    )
      emit(args.id, args.data.replace(/\r/g, "\r\n~/projects/demo-web $ "));
    return { handled: true };
  }
  if (command === "terminal_close") {
    if ("id" in args && typeof args.id === "string") callbacks.delete(args.id);
    return { handled: true };
  }
  if (command === "terminal_launch_state")
    return {
      handled: true,
      value: { ready: true, revision: 0, herdr_active: false },
    };
  if (command === "terminal_launch_herdr") {
    if ("id" in args && typeof args.id === "string")
      emit(
        args.id,
        "\r\n\x1b[36mHerdr TUI · synthetic preview\x1b[0m\r\n  This preview does not start Herdr.\r\n",
      );
    return { handled: true, value: true };
  }
  if (command === "herdr_detect")
    return {
      handled: true,
      value: installed
        ? { path: "<managed>/herdr", version: "0.9.4", managed: true }
        : null,
    };
  if (command === "herdr_install" || command === "herdr_update")
    return {
      handled: true,
      value: new Promise((resolve) =>
        setTimeout(() => {
          installed = true;
          resolve({ path: "<managed>/herdr", version: "0.9.5", managed: true });
        }, 1500),
      ),
    };
  if (command === "herdr_check_update")
    return {
      handled: true,
      value: { latest_version: "0.9.5", has_update: true, managed: true },
    };
  if (
    command === "plugin:clipboard-manager|write_text" ||
    command === "plugin:opener|open_url"
  )
    return { handled: true };
  return { handled: false };
}
