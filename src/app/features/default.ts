import type { FeatureModule } from "./types";
import { herdrModule } from "../../features/herdr/module";

/** Standard product modules; product builds generate their own static entry. */
export const featureModules: readonly FeatureModule[] = [herdrModule];
