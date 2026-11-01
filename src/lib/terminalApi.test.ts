import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { closeTerminal, createTerminal } from "./terminalApi";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), Channel: class {} }));

it("waits for a closing PTY to release its slot before opening its replacement", async () => {
  let release = () => {};
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "terminal_close")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (command === "terminal_create")
      return { id: "replacement", cwd: "<workspace>" };
  });
  const closing = closeTerminal("previous");
  const creating = createTerminal("demo", { rows: 24, cols: 80 }, () => {});
  expect(invoke).not.toHaveBeenCalledWith("terminal_create", expect.anything());
  release();
  await closing;
  await expect(creating).resolves.toMatchObject({ id: "replacement" });
});
