import { githubPlatform } from "../../features/github/platform";
import { gitlabPlatform } from "../../features/gitlab/platform";
import type { TaskPlatform } from "./types";
export const taskPlatforms: readonly TaskPlatform[] = [
  githubPlatform,
  gitlabPlatform,
];
export const githubEnabled = true;
export const gitlabEnabled = true;
