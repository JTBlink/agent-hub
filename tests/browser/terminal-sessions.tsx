import { createRoot } from "react-dom/client";
import { TerminalSessions } from "../../src/components/terminal/TerminalSessions";
import { createTerminalTab } from "../../src/lib/terminalLayout";
import { makeProject } from "../fixtures/workspace";
import "../../src/i18n";
import "../../src/index.css";

const project = {
  ...makeProject(),
  name: "Demo project with a long descriptive name",
};
const tabs = Array.from({ length: 8 }, (_, index) =>
  createTerminalTab(
    project.id,
    undefined,
    "~/projects/demo/worktrees/" + "long-directory-name-".repeat(8) + index,
  ),
);
createRoot(document.getElementById("root")!).render(
  <div
    style={{ position: "fixed", right: "9rem", top: "3rem" }}
    data-sessions-fixture
  >
    <TerminalSessions
      tabs={tabs}
      projects={[project]}
      activeId={tabs[0].id}
      onSelect={() => {}}
      onClose={() => {}}
    />
  </div>,
);
