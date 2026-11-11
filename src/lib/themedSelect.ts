import {
  Children,
  Fragment,
  isValidElement,
  type OptionHTMLAttributes,
  type ReactNode,
} from "react";
import { getAppScale } from "./textScale";

export interface SelectOption {
  value: string;
  label: string;
  disabled: boolean;
  title?: string;
}
export function filterSelectOptions(options: SelectOption[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return options.filter((option) =>
    option.label.toLocaleLowerCase().includes(normalized),
  );
}
export function optionsFrom(children: ReactNode): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    if (child.type === Fragment) return optionsFrom(child.props.children);
    if (
      !isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child) ||
      child.type !== "option"
    )
      return [];
    const label =
      child.props.label ?? Children.toArray(child.props.children).join("");
    return [
      {
        value: String(child.props.value ?? label),
        label,
        disabled: !!child.props.disabled,
        title: child.props.title,
      },
    ];
  });
}

export function positionFor(
  element: HTMLElement | null,
  count: number,
  {
    fitContent = false,
    menu,
    maxHeight = Infinity,
    minWidth = 180,
  }: {
    fitContent?: boolean;
    menu?: HTMLElement | null;
    maxHeight?: number;
    minWidth?: number;
  } = {},
) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const scale = getAppScale();
  const widthLimit = window.innerWidth / scale;
  const heightLimit = window.innerHeight / scale;
  const below = heightLimit - rect.bottom / scale - 8;
  const above = rect.top / scale - 8;
  const contentHeight = fitContent
    ? Math.max(count * 36 + 10, (menu?.scrollHeight ?? 0) + 2)
    : Math.min(256, count * 36 + 10);
  const desired = Math.min(contentHeight, maxHeight);
  const upwards = below < desired && above > below;
  const height = Math.max(
    36,
    Math.min(desired, upwards ? above - 4 : below - 4),
  );
  const width = Math.min(
    Math.max(
      rect.width / scale,
      minWidth,
      fitContent && menu ? menu.getBoundingClientRect().width / scale : 0,
    ),
    widthLimit - 16,
  );
  return {
    left: Math.max(8, Math.min(rect.left / scale, widthLimit - width - 8)),
    top: Math.max(
      8,
      upwards ? rect.top / scale - height - 4 : rect.bottom / scale + 4,
    ),
    width,
    height,
  };
}
