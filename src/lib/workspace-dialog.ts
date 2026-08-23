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

export async function selectSkillSourceDirectory(
  openDialog: OpenDirectory = open,
): Promise<string | null> {
  const selection = await openDialog({
    directory: true,
    multiple: false,
    title: "选择 Skill 来源目录",
  });

  return typeof selection === "string" ? selection : null;
}

export async function selectMarketplaceManifest(
  openDialog: OpenDirectory = open,
): Promise<string | null> {
  const selection = await openDialog({
    directory: false,
    multiple: false,
    title: "选择 Marketplace manifest",
    filters: [{ name: "Marketplace JSON", extensions: ["json"] }],
  });

  return typeof selection === "string" ? selection : null;
}
