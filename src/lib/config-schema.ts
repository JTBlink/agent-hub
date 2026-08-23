import type { Agent, ConfigFormat } from "./backend";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

// ---------------------------------------------------------------------------
// Field schema types
// ---------------------------------------------------------------------------

export type FieldType =
  | "text"
  | "boolean"
  | "enum"
  | "key-value-map"
  | "nested-object";

export interface FieldDefinition {
  key: string;
  label: string;
  description?: string;
  type: FieldType;
  enumValues?: string[];
  nestedFields?: FieldDefinition[];
  sensitive?: boolean;
  kvValueType?: FieldType;
}

export interface AgentFormSchema {
  agent: Agent;
  format: ConfigFormat;
  fields: FieldDefinition[];
}

// ---------------------------------------------------------------------------
// Per-agent schemas
// ---------------------------------------------------------------------------

const CLAUDE_CODE_SCHEMA: AgentFormSchema = {
  agent: "claude-code",
  format: "json",
  fields: [
    {
      key: "theme",
      label: "主题",
      type: "enum",
      enumValues: ["dark", "light", "system"],
    },
    {
      key: "effortLevel",
      label: "努力等级",
      type: "enum",
      enumValues: ["low", "medium", "high", "xhigh", "max"],
    },
    {
      key: "skipDangerousModePermissionPrompt",
      label: "跳过危险模式权限提示",
      type: "boolean",
    },
    {
      key: "env",
      label: "环境变量",
      description: "传递给 Claude Code 的环境变量",
      type: "key-value-map",
      sensitive: true,
    },
    {
      key: "enabledPlugins",
      label: "已启用插件",
      description: "插件 ID → 启用状态",
      type: "key-value-map",
      kvValueType: "boolean",
    },
    {
      key: "statusLine",
      label: "状态栏",
      type: "nested-object",
      nestedFields: [
        { key: "command", label: "命令", type: "text" },
        {
          key: "type",
          label: "类型",
          type: "enum",
          enumValues: ["command"],
        },
      ],
    },
  ],
};

const CODEX_SCHEMA: AgentFormSchema = {
  agent: "codex",
  format: "toml",
  fields: [],
};

const OPENCODE_SCHEMA: AgentFormSchema = {
  agent: "opencode",
  format: "jsonc",
  fields: [{ key: "$schema", label: "Schema URL", type: "text" }],
};

export const AGENT_SCHEMAS: Record<Agent, AgentFormSchema> = {
  "claude-code": CLAUDE_CODE_SCHEMA,
  codex: CODEX_SCHEMA,
  opencode: OPENCODE_SCHEMA,
};

// ---------------------------------------------------------------------------
// Parse / serialize helpers
// ---------------------------------------------------------------------------

function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    if (inString) {
      if (text[i] === "\\" && i + 1 < text.length) {
        result += text[i] + text[i + 1];
        i += 2;
        continue;
      }
      if (text[i] === '"') inString = false;
      result += text[i];
      i++;
      continue;
    }
    if (text[i] === '"') {
      inString = true;
      result += text[i];
      i++;
      continue;
    }
    if (text[i] === "/" && i + 1 < text.length) {
      if (text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (text[i + 1] === "*") {
        i += 2;
        while (i + 1 < text.length && !(text[i] === "*" && text[i + 1] === "/"))
          i++;
        i += 2;
        continue;
      }
    }
    result += text[i];
    i++;
  }
  return result;
}

export function parseConfigSource(
  format: ConfigFormat,
  raw: string,
): Record<string, unknown> {
  switch (format) {
    case "json":
      return JSON.parse(raw) as Record<string, unknown>;
    case "jsonc":
      return JSON.parse(stripJsoncComments(raw)) as Record<string, unknown>;
    case "toml":
      return parseToml(raw) as Record<string, unknown>;
    default:
      throw new Error(`表单模式不支持 ${format} 格式`);
  }
}

export function serializeConfig(
  format: ConfigFormat,
  obj: Record<string, unknown>,
): string {
  switch (format) {
    case "json":
    case "jsonc":
      return JSON.stringify(obj, null, 2) + "\n";
    case "toml":
      return stringifyToml(obj as Parameters<typeof stringifyToml>[0]) + "\n";
    default:
      throw new Error(`表单模式不支持 ${format} 格式`);
  }
}

// ---------------------------------------------------------------------------
// Unknown-field detection
// ---------------------------------------------------------------------------

export function splitKnownUnknown(
  obj: Record<string, unknown>,
  schema: AgentFormSchema,
): { known: Record<string, unknown>; unknown: Record<string, unknown> } {
  const knownKeys = new Set(schema.fields.map((f) => f.key));
  const known: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (knownKeys.has(k)) known[k] = v;
    else rest[k] = v;
  }
  return { known, unknown: rest };
}
