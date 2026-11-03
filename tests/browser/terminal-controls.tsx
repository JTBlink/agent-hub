import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TerminalNewMenu } from "../../src/components/terminal/TerminalNewMenu";
import { TerminalTabs } from "../../src/components/terminal/TerminalTabs";
import { TerminalPanelTools } from "../../src/components/terminal/TerminalPanelTools";
import { createTerminalTab } from "../../src/lib/terminalLayout";
import { GitEditorTabsContext } from "../../src/hooks/gitEditorVisibility";
import { GitEditorTab } from "../../src/components/git/GitEditorTab";
import { GitGraph } from "lucide-react";
import "../../src/i18n";
import "../../src/index.css";

export function Fixture() {
  const [tabs, setTabs] = useState(() => [
    { ...createTerminalTab("demo"), herdrSession: "default" },
    { ...createTerminalTab("demo"), herdrSession: "default" },
  ]);
  const [launches, setLaunches] = useState(0);
  const [active, setActive] = useState(tabs[0].id);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [graphOpen, setGraphOpen] = useState(true);
  const [graphActive, setGraphActive] = useState(false);
  return (
    <>
      <div
        className="flex h-9 w-full items-center border-b border-border bg-bg-secondary"
        data-launches={launches}
        data-terminal-controls
      >
        <TerminalTabs
          tabs={tabs}
          projects={[]}
          activeId={graphActive ? "" : active}
          scoped
          onSelect={(tab) => {
            setActive(tab.id);
            setGraphActive(false);
          }}
          onClose={() => {}}
          onRename={(tab, title) =>
            setTabs((items) =>
              items.map((item) =>
                item.id === tab.id
                  ? { ...item, title: title || undefined }
                  : item,
              ),
            )
          }
        >
          <div ref={setContainer} className="contents" />
        </TerminalTabs>
        <TerminalPanelTools
          hasTerminal
          herdrBusy={false}
          canSplit={false}
          updateVersion="1.2.3"
          onHerdr={() => setLaunches((value) => value + 1)}
          onSplit={() => {}}
        />
      </div>
      <div data-new-terminal-fixture>
        <TerminalNewMenu
          disabled={false}
          tools={["codex", "claude_code", "opencode", "hermes"].map((key) => ({
            key,
            installed: true,
          }))}
          onNew={() => {}}
        />
      </div>
      {graphOpen && (
        <GitEditorTabsContext.Provider
          value={{
            container,
            active: graphActive,
            onSelect: () => setGraphActive(true),
          }}
        >
          <GitEditorTab
            label="Git Graph"
            icon={<GitGraph size={14} />}
            onClose={() => {
              setGraphOpen(false);
              setGraphActive(false);
            }}
          />
        </GitEditorTabsContext.Provider>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
