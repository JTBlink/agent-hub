import capabilities from "../../../products/capabilities.json";
/** Default developer entry. Product builds replace this with their generated config. */
export const productConfig = {
  id: "standard",
  features: capabilities.products.standard,
  hash: "development",
  baseCommit: "",
  sidebar: {
    primary: [
      "projects",
      "search",
      "git",
      "tasks",
      "automation",
      "preview",
      "skills",
      "discover",
      "herdr",
    ],
    bottom: ["dashboard", "backup", "settings"],
    defaultPanel: "skills",
  },
} as const;
