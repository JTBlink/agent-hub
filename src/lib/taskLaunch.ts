import { invoke } from "@tauri-apps/api/core";
import {
  ensureHerdrWorkspace,
  openHerdrWorkspace,
  startHerdrAgent,
  type HerdrOpenedWorkspace,
} from "./herdrControlApi";
import { getErrorMessage } from "./error";

export interface TaskLaunchInput {
  projectId: string;
  path: string;
  session: string;
  kind: string;
  name: string;
  prompt: string;
}
export interface TaskLaunchResult {
  attachment: HerdrOpenedWorkspace;
  warning: string | null;
}

/** After Agent startup is submitted, uncertain outcomes return an inspection target, never a retry. */
export async function launchTaskAgent(
  input: TaskLaunchInput,
): Promise<TaskLaunchResult> {
  const workspace = input.session
    ? await ensureHerdrWorkspace(input.session, input.projectId, input.path)
    : await invoke<HerdrOpenedWorkspace>("task_prepare_herdr_workspace", {
        projectId: input.projectId,
        path: input.path,
      });
  let result;
  try {
    result = await startHerdrAgent(workspace.target, {
      kind: input.kind,
      name: input.name,
      direction: "right",
      prompt: input.prompt,
    });
  } catch (error) {
    return {
      attachment: workspace,
      warning: getErrorMessage(error, "Herdr startup could not be confirmed"),
    };
  }
  try {
    const attachment = await openHerdrWorkspace(
      result.target.session,
      result.target.workspace_id,
      result.target.pane_id,
    );
    return { attachment, warning: result.warning };
  } catch (error) {
    return {
      attachment: { ...workspace, target: result.target },
      warning: [
        result.warning,
        getErrorMessage(error, "Herdr workspace could not be opened"),
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
}
