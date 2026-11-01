import { expect, it } from "vitest";
import { groupGitGraphRefs } from "./gitGraphRefs";

it("combines matching local and remote refs without shortening long branch names", () => {
  const name = "docs/example-long-branch-name-with-several-path-segments";
  const badges = groupGitGraphRefs([
    { name, remote: false, kind: "branch", current: true },
    { name: `origin/${name}`, remote: true, remote_name: "origin" },
    {
      name: `team/upstream/${name}`,
      remote: true,
      remote_name: "team/upstream",
    },
    { name: "origin/HEAD", remote: true, remote_name: "origin" },
    { name: "v1.0.0", remote: false, kind: "tag" },
    { name: "origin/unmatched", remote: true, remote_name: "origin" },
  ]);
  expect(badges).toHaveLength(4);
  expect(badges[0]).toEqual({
    name,
    kind: "branch",
    current: true,
    remotes: ["origin", "team/upstream"],
    fullNames: [name, `origin/${name}`, `team/upstream/${name}`],
  });
  expect(badges.find((badge) => badge.name === "origin/HEAD")?.kind).toBe(
    "remote",
  );
  expect(badges.find((badge) => badge.name === "v1.0.0")?.kind).toBe("tag");
  expect(badges.find((badge) => badge.name === "origin/unmatched")?.kind).toBe(
    "remote",
  );
});

it("keeps divergent remote refs separate and never folds a remote branch into a tag", () => {
  const local = groupGitGraphRefs([
    { name: "topic", remote: false, kind: "branch" },
  ]);
  const remote = groupGitGraphRefs([
    { name: "origin/topic", remote: true, remote_name: "origin" },
  ]);
  expect(local[0].remotes).toEqual([]);
  expect(remote[0].name).toBe("origin/topic");
  expect(
    groupGitGraphRefs([
      { name: "topic", remote: false, kind: "tag" },
      { name: "origin/topic", remote: true },
    ]),
  ).toHaveLength(2);
});
