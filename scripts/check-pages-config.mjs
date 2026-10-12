import { execFileSync } from "node:child_process";

const repository = process.argv[2] ?? process.env.GITHUB_REPOSITORY;

try {
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("Specify the GitHub repository as <owner/repository>.");
  }
  const site = JSON.parse(
    execFileSync("gh", ["api", `repos/${repository}/pages`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (site.build_type !== "workflow") {
    throw new Error(
      "GitHub Pages must use GitHub Actions as its publishing source. Set Settings > Pages > Build and deployment > Source to GitHub Actions; publishing the repository root serves the desktop development entrypoint instead of the website.",
    );
  }
  console.log("GitHub Pages publishing source verified: GitHub Actions.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
