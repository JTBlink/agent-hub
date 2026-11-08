import type { ComponentType } from "react";
import type { RouteObject } from "react-router-dom";
import type { SidebarPanelRequest } from "../../lib/sidebarSections";

/** A feature module owns its panel; the workbench owns navigation and layout. */
export interface FeatureModule {
  id: string;
  sidebar: {
    kind: "panel";
    id: string;
    labelKey: string;
    icon: ComponentType<{ className?: string }>;
    component: ComponentType<{
      active: boolean;
      request?: SidebarPanelRequest;
    }>;
    /** Activate within the selected project workspace instead of a standalone page. */
    workspace?: boolean;
  };
  routes?: readonly RouteObject[];
}
