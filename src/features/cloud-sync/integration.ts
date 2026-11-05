import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import { Backup } from "../../views/Backup";
import BackupDiff from "../../views/BackupDiff";
export { FirstRunRestoreDialog } from "../../components/FirstRunRestoreDialog";
export { BackupSettings } from "../../components/settings/BackupSettings";
export const cloudSyncEnabled = true;
export const cloudSyncRoutes: readonly RouteObject[] = [
  { path: "/backup", element: createElement(Backup) },
  { path: "/backup/diff", element: createElement(BackupDiff) },
];
