import type { TaskProvider } from "../../../src/lib/taskBrowserApi";

const gitlab = {
  platform: "gitlab",
  host: "gitlab.example.invalid",
} as const;
const github = { platform: "github", host: "github.com" } as const;

type RunnerSource = { platform: TaskProvider; host: string };
export type Runner = {
  id: number;
  name: string;
  os: string;
  state: "online" | "offline" | "unknown";
  work: string;
  scope: string;
  tags: string[];
  seen: string;
  paused?: boolean;
} & RunnerSource;

const gitlabRunners: Omit<Runner, keyof RunnerSource>[] = [
  {
    id: 128,
    name: "linux-build-01",
    os: "Linux",
    state: "online",
    work: "空闲",
    scope: "实例",
    tags: ["linux-ci", "docker", "amd64"],
    seen: "8 秒前",
  },
  {
    id: 129,
    name: "linux-build-02",
    os: "Linux",
    state: "online",
    work: "忙碌",
    scope: "实例",
    tags: ["linux-ci", "docker", "amd64"],
    seen: "12 秒前",
  },
  {
    id: 206,
    name: "macos-arm64-01",
    os: "macOS",
    state: "online",
    work: "空闲",
    scope: "群组",
    tags: ["macos-ci", "arm64"],
    seen: "16 秒前",
  },
  {
    id: 214,
    name: "windows-desktop-01",
    os: "Windows",
    state: "online",
    work: "忙碌",
    scope: "项目",
    tags: ["windows-ci", "windows-gui"],
    seen: "21 秒前",
  },
  {
    id: 218,
    name: "linux-release-01",
    os: "Linux",
    state: "online",
    work: "未知",
    scope: "项目",
    tags: ["linux-ci", "release"],
    seen: "28 秒前",
    paused: true,
  },
  {
    id: 241,
    name: "macos-signing-02",
    os: "macOS",
    state: "offline",
    work: "—",
    scope: "项目",
    tags: ["macos-ci", "signing"],
    seen: "2 小时前",
  },
  {
    id: 252,
    name: "windows-test-02",
    os: "Windows",
    state: "offline",
    work: "—",
    scope: "群组",
    tags: ["windows-ci", "amd64"],
    seen: "昨天 18:42",
  },
  {
    id: 263,
    name: "linux-staging-03",
    os: "Linux",
    state: "offline",
    work: "—",
    scope: "项目",
    tags: ["linux-ci", "staging"],
    seen: "3 天前",
    paused: true,
  },
  {
    id: 271,
    name: "linux-new-04",
    os: "Linux",
    state: "unknown",
    work: "未知",
    scope: "项目",
    tags: ["linux-ci"],
    seen: "尚未连接",
  },
  {
    id: 280,
    name: "web-deploy-01",
    os: "Linux",
    state: "offline",
    work: "—",
    scope: "项目",
    tags: ["web-deploy", "linux-ci"],
    seen: "45 分钟前",
  },
];

export const states = { online: "在线", offline: "离线", unknown: "未知" };

// Membership is explicit: shared runners can be available to several projects.
export const projects = [
  {
    id: "workspace",
    name: "Workspace",
    repository: "demo / workspace",
    ...gitlab,
    runnerIds: [128, 129, 206, 214, 218, 241, 252, 263, 271],
  },
  {
    id: "web-console",
    name: "Web Console",
    repository: "demo / web-console",
    ...gitlab,
    runnerIds: [128, 129, 252, 280],
  },
  {
    id: "desktop-client",
    name: "Desktop Client",
    repository: "demo / desktop-client",
    ...github,
    runnerIds: [128, 802],
  },
];
export const runners: Runner[] = [
  ...gitlabRunners.map((runner) => ({ ...runner, ...gitlab })),
  {
    ...github,
    id: 128,
    name: "desktop-macos-01",
    os: "macOS",
    state: "online",
    work: "空闲",
    scope: "仓库",
    tags: ["self-hosted", "macOS", "ARM64"],
    seen: "平台未提供",
  },
  {
    ...github,
    id: 802,
    name: "desktop-windows-01",
    os: "Windows",
    state: "offline",
    work: "—",
    scope: "仓库",
    tags: ["self-hosted", "Windows", "X64"],
    seen: "平台未提供",
  },
];

export function runnerKey(runner: Runner) {
  return `${runner.platform}:${runner.host}:${runner.id}`;
}

export function projectHasRunner(
  project: (typeof projects)[number],
  runner: Runner,
) {
  return (
    project.platform === runner.platform &&
    project.host === runner.host &&
    project.runnerIds.includes(runner.id)
  );
}
