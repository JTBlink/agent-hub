import type { AutomationDraft, AutomationPackage } from "./tauri";
import { automationHerdrConfig } from "./automation";

export interface AutomationInstallSource {
  title: string;
  description: string;
  source: string;
  draft: AutomationDraft;
  package?: AutomationPackage;
  requiresAdmin?: boolean;
}

/** Show declared pins alongside the runtime prerequisites inferred by the core. */
export function automationRequirements(
  source: AutomationInstallSource,
): string[] {
  const requirements = new Set<string>();
  for (const requirement of source.package?.dependencies ??
    source.draft.package_options?.dependencies ??
    []) {
    if (requirement.kind === "command") requirements.add(requirement.name);
    else {
      requirements.add("Python 3");
      requirement.packages.forEach((value) => requirements.add(value));
    }
  }
  if (source.draft.files?.some((file) => file.path.endsWith(".py")))
    requirements.add("Python 3");
  if (automationHerdrConfig(source.draft)) requirements.add("Herdr");
  if (source.draft.provider === "hermes") requirements.add("Hermes");
  return [...requirements];
}
