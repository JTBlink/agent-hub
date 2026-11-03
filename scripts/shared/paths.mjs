import { fileURLToPath } from "node:url";

// Script modules resolve repository files independently of the caller's cwd.
export const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
