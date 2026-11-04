import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider } from "./context/AppContext";
import { ThemeProvider, useThemeContext } from "./context/ThemeContext";
import { CloseActionGuard } from "./components/CloseActionGuard";
import { FirstRunRestoreDialog } from "./components/FirstRunRestoreDialog";
import type { RouteObject } from "react-router-dom";
import { AppRoutes } from "./app/AppRoutes";

function ThemedToaster() {
  const { resolvedTheme } = useThemeContext();
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      offset={{ bottom: "calc(var(--app-statusbar-height) + 12px)" }}
      mobileOffset={{ bottom: "calc(var(--app-statusbar-height) + 12px)" }}
      closeButton
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        },
      }}
    />
  );
}

export interface AppProps {
  /** Additional pages rendered inside the shared layout and providers. */
  extensionRoutes?: readonly RouteObject[];
}

function App({ extensionRoutes = [] }: AppProps) {
  return (
    <ThemeProvider>
      <AppProvider>
        <BrowserRouter>
          <AppRoutes extensionRoutes={extensionRoutes} />
          <CloseActionGuard />
          <FirstRunRestoreDialog />
        </BrowserRouter>
        <ThemedToaster />
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
