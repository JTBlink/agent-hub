/** Host-owned project metadata; upstream service accounts are not inherited. */
export const PROJECT_URL = "https://github.com/JTBlink/agent-hub";
export const RELEASES_URL = `${PROJECT_URL}/releases`;
export const FEEDBACK_URL = `${PROJECT_URL}/blob/main/docs/agents/issue-tracker.md`;
export const MANAGE_SKILLS_SOURCE = `${PROJECT_URL}/tree/main/skills/manage-skills`;

/** Optional public client ID supplied to both Vite and Cargo at build time. */
export const GITHUB_OAUTH_CLIENT_ID =
  import.meta.env.VITE_AGENTHUB_GITHUB_OAUTH_CLIENT_ID?.trim() ?? "";
