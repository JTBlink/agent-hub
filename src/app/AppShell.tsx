/**
 * Public shell entry point.
 *
 * Keep the entry module intentionally small: all stateful orchestration and
 * page implementations live in `AppShellView` so consumers have a stable
 * import while the shell can evolve internally.
 */
export { App } from "./AppShellView";
