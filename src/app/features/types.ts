import type { ComponentType } from "react";
import type { RouteObject } from "react-router-dom";

/** A feature module owns its panel; the workbench owns navigation and layout. */
export interface FeatureModule {
  id: string;
  sidebar: {
    kind: "panel";
    id: string;
    labelKey: string;
    icon: ComponentType<{ className?: string }>;
    component: ComponentType<{ active: boolean }>;
    /** Activate within the selected project workspace instead of a standalone page. */
    workspace?: boolean;
  };
  routes?: readonly RouteObject[];
}
