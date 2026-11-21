import type { Runner } from "./demo-data";
import { states } from "./demo-data";
export function Status({ runner }: { runner: Runner }) {
  return (
    <span className={`status ${runner.state}`}>
      <span className="dot" />
      {states[runner.state]}
    </span>
  );
}
