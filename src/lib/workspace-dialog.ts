import { open } from "@tauri-apps/plugin-dialog";

type OpenDirectory = typeof open;

export async function selectWorkspaceDirectory(
  openDialog: OpenDirectory = open,
): Promise<string | null> {
  const selection = await openDialog({
    directory: true,
    multiple: false,
    title: "选择工作空间目录",
  });

  return typeof selection === "string" ? selection : null;
}
