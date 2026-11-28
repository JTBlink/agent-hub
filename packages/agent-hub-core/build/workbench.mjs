import catalog from "../../../products/workbench.json" with { type: "json" };

const reserved = new Set(
  [
    "Q",
    "O",
    "W",
    "H",
    "Shift+H",
    "Shift+W",
    "Shift+N",
    "C",
    "V",
    "X",
    "Z",
    "Shift+Z",
    "Y",
    "A",
    "F",
    "S",
  ].map((key) => "Mod+" + key),
);

function section(input, defaultValue, label) {
  if (input === undefined) return { ...defaultValue };
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !Object.hasOwn(defaultValue, key))
  )
    throw new Error(`Invalid product ${label}`);
  return { ...defaultValue, ...input };
}

export function resolveWorkbench(input, selected, featureCatalog) {
  const layout = section(input.layout, catalog.defaults.layout, "layout");
  const extensions = input.sidebarModules ?? {};
  const denied = (id) =>
    Object.entries(featureCatalog.features).some(
      ([feature, definition]) =>
        definition.sidebar?.includes(id) && !selected.has(feature),
    );
  const validSlot = (slot) => {
    if (catalog.toolbarSlots.includes(slot)) return true;
    if (typeof slot !== "string" || !slot.startsWith("module:")) return false;
    const id = slot.slice(7);
    return (
      (Object.hasOwn(catalog.modules, id) || Object.hasOwn(extensions, id)) &&
      !denied(id)
    );
  };
  if (
    layout.version !== 1 ||
    !Array.isArray(layout.toolbar) ||
    new Set(layout.toolbar).size !== layout.toolbar.length ||
    layout.toolbar.some((slot) => !validSlot(slot)) ||
    !Number.isInteger(layout.sidebarWidth) ||
    layout.sidebarWidth < 180 ||
    layout.sidebarWidth > 600 ||
    typeof layout.startPage !== "string"
  )
    throw new Error("Invalid product layout version, toolbar or sidebar width");
  const builtin = Object.hasOwn(catalog.modules, layout.startPage)
    ? catalog.modules[layout.startPage]
    : undefined;
  const extension = Object.hasOwn(extensions, layout.startPage)
    ? extensions[layout.startPage]
    : undefined;
  const startPath = builtin?.path ?? extension?.route;
  if (!startPath || denied(layout.startPage))
    throw new Error("Product start page must be an enabled page");
  const appearance = section(
    input.appearance,
    catalog.defaults.appearance,
    "appearance",
  );
  if (
    !["blue", "teal", "violet"].includes(appearance.accent) ||
    !["small", "default", "large", "xlarge"].includes(appearance.textSize) ||
    ![null, "light", "dark", "system"].includes(appearance.theme) ||
    ![null, "navy"].includes(appearance.palette)
  )
    throw new Error("Invalid product accent, text size, theme or palette");
  const shortcuts = section(
    input.shortcuts,
    catalog.defaults.shortcuts,
    "shortcuts",
  );
  const keys = Object.values(shortcuts);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !/^Mod\+(?:Shift\+)?[A-Z,]$/.test(key) ||
        reserved.has(key),
    ) ||
    new Set(keys).size !== keys.length
  )
    throw new Error("Invalid, reserved or duplicate product shortcut");
  return {
    layout: builtin ? layout : { ...layout, startPath },
    appearance,
    shortcuts,
  };
}
