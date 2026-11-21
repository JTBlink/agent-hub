import type { TaskBinding } from "./taskBrowserApi";

export function platformUrl(url: string, host: string) {
  try {
    const base = new URL(`https://${host}`);
    if (
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      return null;
    const target = new URL(url, base);
    return target.protocol === "https:" &&
      target.host === base.host &&
      !target.username &&
      !target.password
      ? target.href
      : null;
  } catch {
    return null;
  }
}

export function repositoryPlatformUrl(
  binding: Pick<TaskBinding, "host" | "repository">,
  suffix = "",
) {
  const repository = binding.repository
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return platformUrl(`/${repository}${suffix}`, binding.host);
}

export function runnerPlatformUrl(
  binding: TaskBinding,
  runnerUrl?: string | null,
) {
  const remote = runnerUrl && platformUrl(runnerUrl, binding.host);
  if (remote) return remote;
  return repositoryPlatformUrl(
    binding,
    binding.provider === "github"
      ? "/settings/actions/runners"
      : "/-/settings/ci_cd#js-runners-settings",
  );
}
