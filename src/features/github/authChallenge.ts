/** Parse only the CLI's device prompt. Never retain a token or an arbitrary output URL. */
export function githubAuthChallenge(screen: string, host: string) {
  const code = screen.match(/one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i)?.[1];
  if (!code) return null;
  const url = screen.match(/https:\/\/[^\s]+\/login\/device\b/)?.[0];
  if (!url) return null;
  try {
    const target = new URL(url);
    if (
      target.origin !== new URL(`https://${host}`).origin ||
      target.pathname !== "/login/device" ||
      target.username ||
      target.password
    )
      return null;
    return { code, url: target.href, enterToOpen: /press enter/i.test(screen) };
  } catch {
    return null;
  }
}
