import type { AgentDeliveryAdapter } from "../../lib/agentDelivery";
import { HerdrDeliveryTarget } from "./components/HerdrDeliveryTarget";
import { runHerdrAction } from "./api";
export const herdrDeliveryAdapter: AgentDeliveryAdapter = {
  id: "herdr",
  label: "Herdr",
  TargetPicker: ({ disabled, onChange }) => (
    <HerdrDeliveryTarget
      disabled={disabled}
      onChange={(target) =>
        onChange(
          target
            ? { send: (prompt) => runHerdrAction(target, "prompt", prompt) }
            : null,
        )
      }
    />
  ),
};
