import { Navigate, useRoutes } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { createAppRoutes } from "./routeDefinitions";

export function AppRoutes({
  extensionRoutes = [],
}: {
  extensionRoutes?: readonly RouteObject[];
}) {
  return (
    useRoutes(createAppRoutes(extensionRoutes)) ?? <Navigate to="/" replace />
  );
}
