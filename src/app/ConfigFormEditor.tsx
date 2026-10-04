import { useMemo } from "react";
import {
  parseConfigSource,
  splitKnownUnknown,
  type AgentFormSchema,
  type FieldDefinition,
} from "../lib/config-schema";
import { Icon } from "./AppIcons";
import { DropdownMenu } from "./DropdownMenu";

export const REDACTED = "••••••";

export function ConfigFormEditor({
  schema,
  formState,
  setFormState,
  source,
  format,
}: {
  schema: AgentFormSchema;
  formState: Record<string, unknown>;
  setFormState: (state: Record<string, unknown>) => void;
  source: string;
  format: string;
}) {
  const { known, unknown: unknownFields } = splitKnownUnknown(
    formState,
    schema,
  );

  const originalParsed = useMemo(() => {
    try {
      return parseConfigSource(format as "json" | "jsonc" | "toml", source);
    } catch {
      return {};
    }
  }, [source, format]);

  function updateField(key: string, value: unknown) {
    setFormState({ ...formState, [key]: value });
  }

  return (
    <div className="form-editor">
      {schema.fields.length > 0 && (
        <div className="form-section">
          {schema.fields.map((field) => (
            <FormField
              key={field.key}
              field={field}
              value={known[field.key]}
              originalValue={originalParsed[field.key]}
              onChange={(v) => updateField(field.key, v)}
            />
          ))}
        </div>
      )}
      {schema.fields.length === 0 && (
        <p className="form-warning" role="status">
          <Icon name="warning" size={14} />该 Agent
          暂无已知字段定义，所有字段显示在"其他字段"中。可切换到源码模式编辑。
        </p>
      )}
      <UnknownFieldsSection fields={unknownFields} />
    </div>
  );
}

export function FormField({
  field,
  value,
  originalValue,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  originalValue: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "boolean":
      return (
        <BooleanFieldRow field={field} value={value} onChange={onChange} />
      );
    case "enum":
      return <EnumFieldRow field={field} value={value} onChange={onChange} />;
    case "key-value-map":
      return (
        <KeyValueMapEditor
          field={field}
          value={value}
          originalValue={originalValue}
          onChange={onChange}
        />
      );
    case "nested-object":
      return (
        <NestedObjectEditor
          field={field}
          value={value}
          originalValue={originalValue}
          onChange={onChange}
        />
      );
    default:
      return <TextFieldRow field={field} value={value} onChange={onChange} />;
  }
}

export function TextFieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const strValue = typeof value === "string" ? value : "";
  const isMasked = field.sensitive && strValue === REDACTED;
  return (
    <div className="form-field-row">
      <div>
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      {isMasked ? (
        <span className="setting-value">已遮罩</span>
      ) : (
        <input
          className="form-input"
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function BooleanFieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const boolValue = value === true;
  return (
    <div className="form-field-row">
      <div>
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      <button
        type="button"
        className={`toggle ${boolValue ? "on" : ""}`}
        onClick={() => onChange(!boolValue)}
        aria-pressed={boolValue}
        aria-label={field.label}
      >
        <i />
      </button>
    </div>
  );
}

export function EnumFieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const strValue = typeof value === "string" ? value : "";
  return (
    <div className="form-field-row">
      <div>
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      <DropdownMenu
        className="form-dropdown"
        options={[
          { value: "", label: "未设置" },
          ...(field.enumValues ?? []).map((opt) => ({
            value: opt,
            label: opt,
          })),
        ]}
        value={strValue}
        onChange={(nextValue) => onChange(nextValue || undefined)}
        ariaLabel={field.label}
        menuHeading={field.label}
        menuCount={`${(field.enumValues?.length ?? 0) + 1} 个选项`}
      />
    </div>
  );
}

export function KeyValueMapEditor({
  field,
  value,
  originalValue,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  originalValue: unknown;
  onChange: (value: unknown) => void;
}) {
  const map =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const originalMap =
    originalValue &&
    typeof originalValue === "object" &&
    !Array.isArray(originalValue)
      ? (originalValue as Record<string, unknown>)
      : {};
  const entries = Object.entries(map);
  const isBooleanValues = field.kvValueType === "boolean";

  function updateEntry(oldKey: string, newKey: string, newValue: unknown) {
    const next: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      if (k === oldKey) next[newKey] = newValue;
      else next[k] = v;
    }
    onChange(next);
  }
  function removeEntry(key: string) {
    const next = { ...map };
    delete next[key];
    onChange(next);
  }
  function addEntry() {
    const next = { ...map };
    let newKey = "new_key";
    let i = 1;
    while (newKey in next) {
      newKey = `new_key_${i++}`;
    }
    next[newKey] = isBooleanValues ? true : "";
    onChange(next);
  }

  return (
    <div className="form-field-row kv-section">
      <div className="kv-header">
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      <div className="kv-editor">
        {entries.map(([key, val]) => {
          const isMasked =
            field.sensitive &&
            typeof val === "string" &&
            val === REDACTED &&
            key in originalMap;
          return (
            <div key={key} className="kv-row">
              <input
                className="form-input"
                type="text"
                value={key}
                onChange={(e) => updateEntry(key, e.target.value, val)}
                placeholder="Key"
              />
              {isBooleanValues ? (
                <button
                  type="button"
                  className={`toggle ${val === true ? "on" : ""}`}
                  onClick={() => updateEntry(key, key, !val)}
                  aria-pressed={val === true}
                  aria-label={`${key} 开关`}
                >
                  <i />
                </button>
              ) : isMasked ? (
                <span className="setting-value kv-masked">已遮罩</span>
              ) : (
                <input
                  className="form-input"
                  type="text"
                  value={typeof val === "string" ? val : String(val ?? "")}
                  onChange={(e) => updateEntry(key, key, e.target.value)}
                  placeholder="Value"
                />
              )}
              <button
                type="button"
                className="icon-button kv-remove"
                onClick={() => removeEntry(key)}
                aria-label={`删除 ${key}`}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="button button-ghost kv-add-button"
          onClick={addEntry}
        >
          <Icon name="plus" size={14} />
          添加
        </button>
      </div>
    </div>
  );
}

export function NestedObjectEditor({
  field,
  value,
  originalValue,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  originalValue: unknown;
  onChange: (value: unknown) => void;
}) {
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const origObj =
    originalValue &&
    typeof originalValue === "object" &&
    !Array.isArray(originalValue)
      ? (originalValue as Record<string, unknown>)
      : {};

  function updateChild(key: string, childValue: unknown) {
    onChange({ ...obj, [key]: childValue });
  }

  if (!field.nestedFields?.length) return null;

  return (
    <div className="form-field-row nested-group">
      <div className="nested-group-header">
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      <div className="nested-group-body">
        {field.nestedFields.map((child) => (
          <FormField
            key={child.key}
            field={child}
            value={obj[child.key]}
            originalValue={origObj[child.key]}
            onChange={(v) => updateChild(child.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

export function UnknownFieldsSection({
  fields,
}: {
  fields: Record<string, unknown>;
}) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;
  return (
    <div className="form-section unknown-fields">
      <div className="form-section-title">
        <strong>其他字段</strong>
        <span>以下字段未纳入表单，保存时会原样保留</span>
      </div>
      <pre className="source-preview">{JSON.stringify(fields, null, 2)}</pre>
    </div>
  );
}
