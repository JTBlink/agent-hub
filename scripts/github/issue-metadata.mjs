import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const pendingLabels = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
];
const triageLabels = new Set([...pendingLabels, "wontfix"]);

export function targetVersion(body = "") {
  return (
    body.match(
      /^(?:Target version|目标版本)\s*[:：]\s*`?(Unreleased|v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`?\s*$/im,
    )?.[1] ?? null
  );
}

export function issueLabels(issue) {
  const labels = issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
  if (issue.state === "closed") {
    const retained = labels.filter((label) => !triageLabels.has(label));
    return issue.state_reason === "not_planned"
      ? [...retained, "wontfix"]
      : retained;
  }
  const retained = labels.filter((label) => label !== "wontfix");
  return retained.some((label) => pendingLabels.includes(label))
    ? retained
    : [...retained, "needs-triage"];
}

function sameLabels(a, b) {
  return [...a].sort().join("\n") === [...b].sort().join("\n");
}

export async function ensureMilestone(api, title, state) {
  const milestones = await api.listMilestones();
  let milestone = milestones.find((item) => item.title === title);
  if (!milestone) {
    milestone = await api.request("POST", "/milestones", {
      title,
      state: state ?? "open",
      description:
        title === "Unreleased"
          ? "待发布工作；发布时按关闭提交的版本归属自动归档。"
          : "对应版本 " + title,
    });
    milestones.push(milestone);
  } else if (state && milestone.state !== state) {
    milestone = await api.request("PATCH", "/milestones/" + milestone.number, {
      state,
    });
    const index = milestones.findIndex(
      (item) => item.number === milestone.number,
    );
    milestones[index] = milestone;
  }
  return milestone;
}

export async function syncIssue(api, issue, previousBody) {
  if (issue.pull_request) return;
  const labels = issueLabels(issue);
  const currentLabels = issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
  const update = {};
  if (!sameLabels(labels, currentLabels)) update.labels = labels;
  const specified = targetVersion(issue.body ?? "");
  const changed =
    previousBody !== undefined &&
    specified !== targetVersion(previousBody ?? "");
  if (!issue.milestone || (changed && specified)) {
    const milestone = await ensureMilestone(api, specified ?? "Unreleased");
    if (issue.milestone?.number !== milestone.number)
      update.milestone = milestone.number;
  }
  if (Object.keys(update).length)
    await api.request("PATCH", "/issues/" + issue.number, update);
}

export async function closingCommitIncluded(api, issue, tag) {
  const events = await api.paginate("/issues/" + issue.number + "/events");
  const closing = [...events]
    .reverse()
    .find((event) => event.event === "closed");
  if (!closing?.commit_id) return false;
  const comparison = await api.request(
    "GET",
    "/compare/" +
      encodeURIComponent(closing.commit_id) +
      "..." +
      encodeURIComponent(tag),
    undefined,
    [404],
  );
  return comparison?.status === "ahead" || comparison?.status === "identical";
}

export async function syncRelease(api, tag) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) return;
  const released = await ensureMilestone(api, tag, "closed");
  const unreleased = await ensureMilestone(api, "Unreleased", "open");
  for (const issue of await api.paginate(
    "/issues?state=open&milestone=" + released.number,
  )) {
    if (!issue.pull_request) {
      await api.request("PATCH", "/issues/" + issue.number, {
        milestone: unreleased.number,
      });
      await syncIssue(api, { ...issue, milestone: unreleased });
    }
  }
  for (const issue of await api.paginate(
    "/issues?state=closed&milestone=" + unreleased.number,
  )) {
    if (!issue.pull_request && (await closingCommitIncluded(api, issue, tag))) {
      await api.request("PATCH", "/issues/" + issue.number, {
        milestone: released.number,
      });
      await syncIssue(api, { ...issue, milestone: released });
    }
  }
}

export async function runEvent(api, eventName, event) {
  if (eventName === "issues") {
    const issue = await api.request("GET", "/issues/" + event.issue.number);
    await syncIssue(api, issue, event.changes?.body?.from);
  } else if (eventName === "release" && event.action === "published") {
    await syncRelease(api, event.release.tag_name);
  } else if (eventName === "push" && event.ref?.startsWith("refs/tags/")) {
    // Releases created with GITHUB_TOKEN do not start another release workflow.
    // The packaging job invokes this only after the release was published.
    await syncRelease(api, event.ref.slice("refs/tags/".length));
  } else if (eventName === "workflow_dispatch") {
    const releases = (await api.paginate("/releases"))
      .filter((release) => !release.draft && !release.prerelease)
      .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
    for (const issue of await api.paginate("/issues?state=all"))
      await syncIssue(api, issue);
    for (const release of releases) await syncRelease(api, release.tag_name);
  }
}

function githubApi(repository, token) {
  let milestones;
  const base =
    (process.env.GITHUB_API_URL ?? "https://api.github.com") +
    "/repos/" +
    repository;
  async function request(method, path, body, allowed = []) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (allowed.includes(response.status)) return null;
      if (response.ok) return response.status === 204 ? null : response.json();
      if (
        (response.status === 429 ||
          response.status >= 500 ||
          (response.status === 403 && response.headers.has("retry-after"))) &&
        attempt < 3
      ) {
        const seconds = Math.min(
          30,
          Number(response.headers.get("retry-after")) || 2 ** attempt,
        );
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        continue;
      }
      throw new Error(
        "GitHub " + method + " " + path + " returned " + response.status,
      );
    }
  }
  async function paginate(path) {
    const all = [];
    for (let page = 1; ; page += 1) {
      const result = await request(
        "GET",
        path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page,
      );
      all.push(...result);
      if (result.length < 100) return all;
    }
  }
  return {
    request,
    paginate,
    async listMilestones() {
      milestones ??= await paginate("/milestones?state=all");
      return milestones;
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const {
    GITHUB_REPOSITORY,
    GITHUB_TOKEN,
    GITHUB_EVENT_NAME,
    GITHUB_EVENT_PATH,
  } = process.env;
  if (
    !GITHUB_REPOSITORY ||
    !GITHUB_TOKEN ||
    !GITHUB_EVENT_NAME ||
    !GITHUB_EVENT_PATH
  ) {
    throw new Error(
      "GitHub Actions repository, token and event environment is required",
    );
  }
  const event = JSON.parse(await readFile(GITHUB_EVENT_PATH, "utf8"));
  await runEvent(
    githubApi(GITHUB_REPOSITORY, GITHUB_TOKEN),
    GITHUB_EVENT_NAME,
    event,
  );
}
