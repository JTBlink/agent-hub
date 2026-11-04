import { createRoutesFromElements, Route } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Dashboard } from "../views/Dashboard";
import { MySkills } from "../views/MySkills";
import { WorkspaceView } from "../views/WorkspaceView";
import {
  CODING_WORKSPACE_CONFIG,
  LOBSTER_WORKSPACE_CONFIG,
} from "../views/workspaceConfigs";
import { Discover } from "../views/Discover";
import { Settings } from "../views/Settings";
import { ProjectSkills } from "../views/ProjectSkills";
import { Backup } from "../views/Backup";
import BackupDiff from "../views/BackupDiff";
import { Help } from "../views/Help";
import { Tasks } from "../views/Tasks";
import { Git } from "../views/Git";
import { Automation } from "../views/Automation";

/** Compose shared pages and optional host pages under the same application layout. */
export function createAppRoutes(
  extensionRoutes: readonly RouteObject[] = [],
): RouteObject[] {
  const children = createRoutesFromElements(
    <>
      <Route path="/" element={<Dashboard />} />
      <Route path="/my-skills" element={<MySkills />} />
      <Route
        path="/global-workspace"
        element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />}
      />
      <Route
        path="/global-workspace/:agentKey"
        element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />}
      />
      <Route
        path="/lobster-workspace"
        element={<WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />}
      />
      <Route
        path="/lobster-workspace/:agentKey"
        element={<WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />}
      />
      <Route path="/discover" element={<Discover />} />
      <Route path="/install" element={<Discover />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/git" element={<Git />} />
      <Route path="/terminal" element={null} />
      <Route path="/preview" element={null} />
      <Route path="/automation" element={<Automation />} />
      <Route path="/backup" element={<Backup />} />
      <Route path="/backup/diff" element={<BackupDiff />} />
      <Route path="/project/:id" element={null} />
      <Route path="/project/:id/skills" element={<ProjectSkills />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/help" element={<Help />} />
      <Route path="/help/:articleId" element={<Help />} />
    </>,
  );
  return [{ element: <Layout />, children: [...children, ...extensionRoutes] }];
}
