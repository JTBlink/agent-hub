import defaultContent from "../../products/default-content.json";

/** Host-owned project metadata; upstream service accounts are not inherited. */
export const PROJECT_URL = "https://github.com/JTBlink/agent-hub";
export const WEBSITE_URL = "https://jtblink.github.io/agent-hub/";
export const RELEASES_URL = `${PROJECT_URL}/releases`;
export const FEEDBACK_URL = `${PROJECT_URL}/issues`;
export const CONTENT_REPOSITORY = defaultContent.repository;
export const MANAGE_SKILLS_SOURCE = `https://github.com/${CONTENT_REPOSITORY}/tree/main/skills/productivity/agent-hub-cli`;

/**
 * Public GitHub OAuth App client ID used by the device flow.
 * Client IDs are not secrets and are intentionally shipped in the app.
 */
export const GITHUB_OAUTH_CLIENT_ID = "Ov23liuxI32ZuqaZKBbt";
