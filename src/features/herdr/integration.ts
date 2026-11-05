/** Compile-time integration entry; products without Herdr never import this module. */
export const herdrEnabled = true;
export * from "./lib/herdrControlApi";
export * from "./lib/herdrToolsApi";
export * from "../../lib/terminalAgents";
export * from "./terminal/api";
export { useHerdrShortcut } from "./terminal/useHerdrShortcut";
export { useHerdrSessions } from "./terminal/useHerdrSessions";
export { useHerdrAttachment } from "./terminal/useHerdrAttachment";
export { HerdrTerminalTools } from "./terminal/HerdrTerminalTools";
export { SidebarHerdr } from "./components/LazySidebarHerdr";
export { HerdrIcon } from "./components/HerdrIcon";
export { AutomationHerdrFields } from "./components/AutomationHerdrFields";
export { herdrDeliveryAdapter } from "./deliveryAdapter";
