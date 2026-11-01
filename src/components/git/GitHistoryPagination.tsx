import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../../lib/error";

/** Consistent loading, failure recovery and load-more actions for every history list. */
export function GitHistoryPagination({
  loading,
  exhausted = false,
  error,
  hasMore,
  onLoadMore,
  onRetry,
}: {
  loading: boolean;
  exhausted?: boolean;
  error?: unknown;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {loading && (
        <p role="status" className="px-4 py-2 text-xs text-muted">
          {t("common.loading")}
        </p>
      )}
      {error != null && (
        <div role="alert" className="px-4 py-2 text-xs text-danger">
          <p>{getErrorMessage(error, t("common.error"))}</p>
          <button
            type="button"
            disabled={loading}
            className="app-button-ghost mt-1 px-2"
            onClick={onRetry}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {!loading && error == null && hasMore && (
        <button
          type="button"
          className="app-button-ghost mx-2 my-1 px-2 text-xs"
          onClick={onLoadMore}
        >
          {t("git.loadMoreCommits")}
        </button>
      )}
      {!loading && error == null && exhausted && (
        <p role="status" className="px-4 py-2 text-xs text-muted">
          {t("git.allCommitsLoaded")}
        </p>
      )}
    </>
  );
}
