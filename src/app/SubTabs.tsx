import type { ReactNode } from "react";

export type SubTabOption<Value extends string> = {
  value: Value;
  label: string;
  badge?: ReactNode;
  icon?: ReactNode;
};

type SubTabsProps<Value extends string> = {
  value: Value;
  items: SubTabOption<Value>[];
  ariaLabel: string;
  onChange: (value: Value) => void;
};

export function SubTabs<Value extends string>({
  value,
  items,
  ariaLabel,
  onChange,
}: SubTabsProps<Value>) {
  return (
    <div className="sub-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.icon}
          {item.label}
          {item.badge}
        </button>
      ))}
    </div>
  );
}
