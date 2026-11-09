import type { AutomationDraft } from "./tauri";
import { automationPromptFile } from "./automation";

export const PROMPT_VARIANTS_PATH = "config/prompt-variants.json";
export const MAX_PROMPT_VARIANTS = 12;
export const MAX_PROMPT_BEHAVIOR_BYTES = 120;
export interface AutomationPromptVariant {
  id: string;
  name: string;
  content: string;
  /** Optional opaque task metadata; AgentHub does not interpret it. */
  behavior?: string;
}
export interface AutomationPrompts {
  activeId: string;
  variants: AutomationPromptVariant[];
  invalid: boolean;
}

/** The active body stays in the existing runtime prompt; only inactive bodies
 * are stored in the manifest, so there is never a second editable active copy. */
export function automationPrompts(
  draft: AutomationDraft,
  defaultName: string,
): AutomationPrompts {
  const content = automationPromptFile(draft)?.content ?? draft.content;
  const fallback = {
    activeId: "default",
    variants: [{ id: "default", name: defaultName, content }],
    invalid: false,
  };
  const file = draft.files?.find((file) => file.path === PROMPT_VARIANTS_PATH);
  if (!file) return fallback;
  try {
    const value: unknown = JSON.parse(file.content);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      ![1, 2].includes(value.version as number) ||
      !("active_id" in value) ||
      typeof value.active_id !== "string" ||
      !("variants" in value) ||
      !Array.isArray(value.variants) ||
      !value.variants.length ||
      value.variants.length > MAX_PROMPT_VARIANTS
    )
      throw new Error("Invalid prompt variants");
    const ids = new Set<string>();
    const activeId = value.active_id;
    const variants = value.variants.map(
      (entry: unknown): AutomationPromptVariant => {
        if (
          !entry ||
          typeof entry !== "object" ||
          !("id" in entry) ||
          typeof entry.id !== "string" ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) ||
          ids.has(entry.id) ||
          !("name" in entry) ||
          typeof entry.name !== "string" ||
          new TextEncoder().encode(entry.name).length > 800
        )
          throw new Error("Invalid prompt variant");
        ids.add(entry.id);
        const body = "content" in entry ? entry.content : undefined;
        if (
          entry.id === activeId ? body !== undefined : typeof body !== "string"
        )
          throw new Error("Invalid prompt body");
        const behavior =
          "behavior" in entry && typeof entry.behavior === "string"
            ? entry.behavior
            : "";
        if (
          new TextEncoder().encode(behavior).length > MAX_PROMPT_BEHAVIOR_BYTES ||
          Array.from(behavior).some((character) => {
            const code = character.codePointAt(0) ?? 0;
            return code <= 0x1f || code === 0x7f;
          })
        )
          throw new Error("Invalid prompt behavior");
        return {
          id: entry.id,
          name: entry.name,
          content: entry.id === activeId ? content : String(body),
          ...(behavior ? { behavior } : {}),
        };
      },
    );
    if (!ids.has(activeId)) throw new Error("Missing active prompt");
    return { activeId, variants, invalid: false };
  } catch {
    return { ...fallback, invalid: true };
  }
}

export function updateAutomationPrompts(
  draft: AutomationDraft,
  variants: AutomationPromptVariant[],
  activeId: string,
  persistManifest = true,
): Partial<AutomationDraft> {
  const active = variants.find((variant) => variant.id === activeId);
  if (!active || !variants.length) throw new Error("Missing active prompt");
  const prompt = automationPromptFile(draft);
  const files = (draft.files ?? []).filter(
    (file) => file.path !== PROMPT_VARIANTS_PATH,
  );
  const manifest = {
    version: variants.some((variant) => variant.behavior?.trim()) ? 2 : 1,
    active_id: activeId,
    variants: variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      ...(variant.behavior?.trim() ? { behavior: variant.behavior } : {}),
      ...(variant.id === activeId ? {} : { content: variant.content }),
    })),
  };
  return {
    ...(draft.provider === "hermes" ? { content: active.content } : {}),
    files: [
      ...files.map((file) =>
        file.path === prompt?.path
          ? { ...file, content: active.content }
          : file,
      ),
      ...(persistManifest
        ? [
            {
              path: PROMPT_VARIANTS_PATH,
              content: JSON.stringify(manifest, null, 2) + "\n",
            },
          ]
        : []),
    ],
  };
}
