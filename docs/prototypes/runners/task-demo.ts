import { makeProject } from "../../../tests/fixtures/workspace";
import {
  makeRepositoryTask,
  makeTaskMetadata,
  makeReviewMetadata,
} from "../../../tests/fixtures/repositoryTask";
import type { TaskBinding } from "../../../src/lib/tauri";
import { projects } from "./demo-data";
export const taskProjects = projects.map((p) => ({
  ...makeProject(),
  id: p.id,
  name: p.name,
  path: `~/projects/${p.id}`,
}));
export const bindings: TaskBinding[] = projects.map((p, index) => ({
  id: `demo-binding-${index}`,
  project_id: p.id,
  provider: p.platform === "github" ? "github" : "gitlab",
  host: p.host,
  repository: p.repository.replaceAll(" ", ""),
  launcher: null,
}));
const titles = [
  "优化项目终端的键盘操作",
  "返回列表时保留任务筛选条件",
  "完善仓库连接的错误提示",
  "检查命令面板的交互反馈",
];
export const demoTasks = taskProjects.flatMap((p, index) =>
  [false, true].flatMap((review) =>
    titles.map((title, i) =>
      makeRepositoryTask({
        key: `${p.id}/${review ? "review" : "issue"}/${i}`,
        binding_id: bindings[index].id,
        project_id: p.id,
        provider: bindings[index].provider,
        host: bindings[index].host,
        repository: bindings[index].repository,
        kind: review ? "review" : "issue",
        number: 121 + i,
        title: review ? `修复：${title}` : title,
        state: review && i === 3 ? "merged" : i === 2 ? "closed" : "open",
        assignees: ["demo"],
        updated_at: "2026-11-21T09:00:00Z",
        url: `https://${bindings[index].host}/${bindings[index].repository}/${review ? "pull" : "issues"}/${121 + i}`,
        metadata: makeTaskMetadata({
          author: "demo",
          labels: [i % 2 ? "enhancement" : "bug", "ready-for-agent"],
          comment_count: i + 1,
          milestone: "vNext",
          review: review
            ? makeReviewMetadata({
                source_branch: "feature/task-navigation",
                target_branch: "main",
                draft: false,
                merge_status: "can_be_merged",
                additions: 42,
                deletions: 12,
                changed_files: 3,
                reviewers: ["demo-reviewer"],
              })
            : null,
        }),
      }),
    ),
  ),
);
