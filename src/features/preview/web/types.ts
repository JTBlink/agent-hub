import type { BrowserFrame, PickedElement } from "../api";
export type BrowserNavigation = (
  action: "back" | "forward" | "reload",
) => Promise<void>;
export interface BrowserSurfaceProps {
  tabId: string;
  initialId?: string;
  active: boolean;
  address: string;
  profile: string;
  picking: boolean;
  viewport: { width: number; height: number; mobile: boolean } | null;
  onReady: (id: string) => void;
  onFrame: (frame: BrowserFrame) => void;
  onCapture: (value: PickedElement) => void;
  onError: (message: string) => void;
  onUnavailable?: () => void;
  onBackend?: (backend: "chromium" | "native") => void;
  onNativeNavigation?: (handler: BrowserNavigation | null) => void;
  onPickingChange?: (picking: boolean) => void;
  onNewTab?: (url: string) => void;
  onNativeLocation?: (url: string) => void;
}
