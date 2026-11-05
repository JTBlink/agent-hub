import type { FeatureModule } from "../../app/features/types";
import { HerdrIcon } from "./components/HerdrIcon";
import { SidebarHerdr } from "./components/LazySidebarHerdr";

export const herdrModule: FeatureModule = {
  id: "herdr",
  sidebar: {
    kind: "panel",
    id: "herdr",
    labelKey: "herdr.title",
    icon: HerdrIcon,
    component: SidebarHerdr,
    workspace: true,
  },
};
