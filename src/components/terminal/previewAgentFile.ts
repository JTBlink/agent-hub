/** Backend Agent names retain file ownership independently of transient frontend tabs. */
export async function previewFileAgentName(
  projectId: string,
  workspacePath: string,
  filePath: string,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([projectId, workspacePath, filePath]),
    ),
  );
  return `file-${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 24)}`;
}
