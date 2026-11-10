import {
  EditorView,
  runScopeHandlers,
  type Panel,
  type ViewUpdate,
} from "@codemirror/view";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import i18n from "i18next";

/** CodeMirror owns matching, decorations and navigation; this panel only presents them. */
export class CodeSearchPanel implements Panel {
  dom = document.createElement("div");
  top = true;
  private input = document.createElement("input");
  private status = document.createElement("span");
  private toggles: {
    button: HTMLButtonElement;
    field: "caseSensitive" | "wholeWord" | "regexp";
  }[] = [];
  private matches: { from: number; to: number }[] = [];
  private truncated = false;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.dom.className = "cm-file-search";
    this.dom.setAttribute("role", "search");
    this.dom.setAttribute("aria-label", i18n.t("fileReader.find"));
    this.input.type = "text";
    this.input.setAttribute("main-field", "true");
    this.input.setAttribute("aria-label", i18n.t("fileReader.find"));
    this.input.placeholder = i18n.t("fileReader.find");
    this.input.addEventListener("input", (event) => {
      if (!(event instanceof InputEvent && event.isComposing)) this.change();
    });
    this.input.addEventListener("compositionend", () => this.change());
    this.dom.append(this.input);
    for (const [field, label, text] of [
      ["caseSensitive", "workspaceSearch.matchCase", "Aa"],
      ["wholeWord", "workspaceSearch.wholeWord", "ab"],
      ["regexp", "workspaceSearch.regex", ".*"],
    ] as const) {
      const button = this.button(text, i18n.t(label), () => {
        const query = getSearchQuery(this.view.state);
        this.change({ [field]: !query[field] });
      });
      this.toggles.push({ button, field });
    }
    this.status.setAttribute("role", "status");
    this.dom.append(this.status);
    this.button("↑", i18n.t("fileReader.findPrevious"), () =>
      findPrevious(this.view),
    );
    this.button("↓", i18n.t("fileReader.findNext"), () => findNext(this.view));
    this.button("×", i18n.t("fileReader.closeFind"), () =>
      closeSearchPanel(this.view),
    );
    this.dom.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter" && event.target === this.input) {
        event.preventDefault();
        event.stopPropagation();
        (event.shiftKey ? findPrevious : findNext)(this.view);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSearchPanel(this.view);
      } else if (runScopeHandlers(this.view, event, "search-panel")) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this.sync(true);
  }

  mount() {
    this.input.focus();
    this.input.select();
  }

  private button(text: string, label: string, action: () => unknown) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", action);
    this.dom.append(button);
    return button;
  }

  private change(options: Partial<SearchQuery> = {}) {
    const { selectionStart, selectionEnd } = this.input;
    const current = getSearchQuery(this.view.state);
    const query = new SearchQuery({
      search: this.input.value,
      caseSensitive: current.caseSensitive,
      wholeWord: current.wholeWord,
      regexp: current.regexp,
      literal: true,
      ...options,
    });
    this.view.dispatch({
      effects: setSearchQuery.of(query),
      selection: { anchor: this.view.state.selection.main.from },
    });
    if (query.valid) findNext(this.view);
    // Navigation selects the query field; typing must retain its insertion point.
    this.input.setSelectionRange(selectionStart, selectionEnd);
  }

  update(update: ViewUpdate) {
    this.sync(
      update.docChanged ||
        !getSearchQuery(update.startState).eq(getSearchQuery(update.state)),
    );
  }

  private sync(recount: boolean) {
    const query = getSearchQuery(this.view.state);
    this.input.value = query.search;
    this.input.setAttribute(
      "aria-invalid",
      String(!!query.search && !query.valid),
    );
    for (const { button, field } of this.toggles)
      button.setAttribute("aria-pressed", String(query[field]));
    if (recount) {
      this.matches = [];
      this.truncated = false;
      if (query.valid) {
        const cursor = query.getCursor(this.view.state);
        for (let match = cursor.next(); !match.done; match = cursor.next()) {
          if (this.matches.length === 10000) {
            this.truncated = true;
            break;
          }
          this.matches.push({ from: match.value.from, to: match.value.to });
        }
      }
    }
    const selection = this.view.state.selection.main;
    const index = this.matches.findIndex(
      (match) => match.from === selection.from && match.to === selection.to,
    );
    this.status.textContent = !query.search
      ? ""
      : !query.valid
        ? i18n.t("fileReader.invalidRegex")
        : this.truncated
          ? i18n.t("fileReader.findLimit", { count: 10000 })
          : i18n.t("fileReader.findCount", {
              current: index + 1,
              count: this.matches.length,
            });
  }
}
