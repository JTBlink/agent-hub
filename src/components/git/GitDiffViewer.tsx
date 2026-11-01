import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { EditorView } from "@codemirror/view";
import { parseGitDiff } from "../../lib/gitDiff";
import { gitDiffNavigation } from "../../lib/gitDiffNavigation";
import { ScrollOverview } from "../ScrollOverview";
import { DiffCodePane } from "./DiffCodePane";
import { GitDiffToolbar } from "./GitDiffToolbar";
import { UnifiedDiffPane } from "./UnifiedDiffPane";
import { useDiffRowHeights } from "./useDiffRowHeights";
import { useDiffOverview } from "./useDiffOverview";

export function GitDiffViewer({
  patch,
  staged,
  historical = false,
  path = "changes.diff",
  onOpenFile,
}: {
  patch: string;
  staged: boolean;
  historical?: boolean;
  path?: string;
  onOpenFile?: () => void;
}) {
  const { t } = useTranslation();
  const { rows, truncated } = useMemo(() => parseGitDiff(patch), [patch]);
  const targets = useMemo(() => gitDiffNavigation(rows, patch), [rows, patch]);
  const [split, setSplit] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [whitespace, setWhitespace] = useState(false);
  const [overview, setOverview] = useState(true);
  const [position, setPosition] = useState({ patch, index: -1 });
  const active = position.patch === patch ? position.index : -1;
  const right = useRef<HTMLElement>(null);
  const [originalView, setOriginalView] = useState<EditorView | null>(null);
  const [updatedView, setUpdatedView] = useState<EditorView | null>(null);
  const original = originalView?.scrollDOM ?? null;
  const updated = updatedView?.scrollDOM ?? null;
  const id = useId();
  const connectRight = useCallback(
    (view: EditorView | null) => {
      right.current = view?.scrollDOM ?? null;
      setUpdatedView(view);
      if (right.current) right.current.id = id;
    },
    [id],
  );
  const rowHeights = useDiffRowHeights(rows, wrap && split, original, updated);
  const getMarks = useDiffOverview(
    rows,
    split,
    originalView,
    updatedView,
    rowHeights,
  );
  useEffect(() => {
    if (!split || !original || !updated) return;
    const syncLeft = () => {
      if (Math.abs(updated.scrollTop - original.scrollTop) > 0.5)
        updated.scrollTop = original.scrollTop;
    };
    const syncRight = () => {
      if (Math.abs(original.scrollTop - updated.scrollTop) > 0.5)
        original.scrollTop = updated.scrollTop;
    };
    original.addEventListener("scroll", syncLeft);
    updated.addEventListener("scroll", syncRight);
    return () => {
      original.removeEventListener("scroll", syncLeft);
      updated.removeEventListener("scroll", syncRight);
    };
  }, [split, original, updated]);
  const navigate = (direction: number) => {
    if (!targets.length) return;
    const index =
      active < 0
        ? direction > 0
          ? 0
          : targets.length - 1
        : (active + direction + targets.length) % targets.length;
    const target = targets[index];
    const view =
      split && target.right === undefined ? originalView : updatedView;
    const offset = split ? (target.right ?? target.left) : target.unified;
    if (!view || offset === undefined) return;
    const from = Math.min(offset, view.state.doc.length);
    view.dispatch({
      selection: { anchor: from },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    view.focus();
    setPosition({ patch, index });
  };
  const leftLabel = t(
    historical
      ? "git.parentVersion"
      : staged
        ? "git.headVersion"
        : "git.indexVersion",
  );
  const rightLabel = t(
    historical
      ? "git.commitVersion"
      : staged
        ? "git.indexVersion"
        : "git.workingVersion",
  );
  const renderOverview = () =>
    overview && (
      <ScrollOverview
        scrollRef={right}
        contentKey={`${split}:${patch}`}
        controls={id}
        label={t("git.changeOverview")}
        hint={t("git.overviewHint")}
        getMarks={getMarks}
      />
    );
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label={t("git.diff")}
      onKeyDown={(event) => {
        if (event.altKey && event.key === "F5") {
          event.preventDefault();
          navigate(event.shiftKey ? -1 : 1);
        }
      }}
    >
      <GitDiffToolbar
        path={path}
        split={split}
        wrap={wrap}
        whitespace={whitespace}
        overview={overview}
        count={targets.length}
        active={active}
        onSplit={() => {
          setSplit(!split);
          setPosition({ patch, index: -1 });
        }}
        onWrap={() => setWrap(!wrap)}
        onWhitespace={() => setWhitespace(!whitespace)}
        onOverview={() => setOverview(!overview)}
        onNavigate={navigate}
        onOpenFile={onOpenFile}
      />
      {!rows.length ? (
        <p role="status" className="p-6 text-xs text-muted">
          {t("git.noDiff")}
        </p>
      ) : split ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <section
            className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border-subtle"
            aria-label={leftLabel}
          >
            <div className="shrink-0 border-b border-border-subtle bg-bg-secondary px-3 py-1.5 text-xs text-muted">
              {leftLabel}
            </div>
            <DiffCodePane
              rows={rows}
              side="left"
              path={path}
              label={leftLabel}
              onViewReady={setOriginalView}
              wrap={wrap}
              whitespace={whitespace}
              rowHeights={rowHeights}
            />
          </section>
          <section
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            aria-label={rightLabel}
          >
            <div className="shrink-0 border-b border-border-subtle bg-bg-secondary px-3 py-1.5 text-xs text-muted">
              {rightLabel}
            </div>
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <DiffCodePane
                rows={rows}
                side="right"
                path={path}
                label={rightLabel}
                onViewReady={connectRight}
                wrap={wrap}
                whitespace={whitespace}
                rowHeights={rowHeights}
              />
              {renderOverview()}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <UnifiedDiffPane
            patch={patch}
            path={path}
            wrap={wrap}
            whitespace={whitespace}
            onViewReady={connectRight}
          />
          {renderOverview()}
        </div>
      )}
      {truncated && split && (
        <p role="status" className="shrink-0 p-3 text-xs text-muted">
          {t("git.diffTruncated")}
        </p>
      )}
    </div>
  );
}
