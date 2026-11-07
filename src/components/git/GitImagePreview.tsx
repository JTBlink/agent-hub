import { useTranslation } from "react-i18next";
import {
  ImageComparison,
  ImagePreview,
  type ImageSource,
} from "../../features/image-preview";

/** Source control chooses revisions; the image module owns loading and rendering. */
export function GitImagePreview({
  projectId,
  worktreePath,
  path,
  staged,
  commitSha,
  revisionView,
  compareWorking,
  fileView,
  active = true,
}: {
  active?: boolean;
  projectId: string;
  worktreePath?: string;
  path: string;
  staged: boolean;
  commitSha?: string;
  revisionView?: boolean;
  compareWorking?: boolean;
  fileView: boolean;
}) {
  const { t } = useTranslation();
  const source = { projectId, worktreePath, path, sha: commitSha };
  if (fileView || revisionView) {
    const target: ImageSource = {
      ...source,
      revision: revisionView ? "commit" : "working",
    };
    return (
      <ImagePreview
        active={active}
        key={JSON.stringify(target)}
        source={target}
      />
    );
  }
  return (
    <ImageComparison
      active={active}
      original={{
        source: {
          ...source,
          revision: commitSha
            ? compareWorking
              ? "commit"
              : "parent"
            : staged
              ? "head"
              : "index",
        },
        label: t(
          commitSha
            ? compareWorking
              ? "git.commitVersion"
              : "git.parentVersion"
            : staged
              ? "git.headVersion"
              : "git.indexVersion",
        ),
      }}
      modified={{
        source: {
          ...source,
          revision:
            commitSha && !compareWorking
              ? "commit"
              : staged && !commitSha
                ? "index"
                : "working",
        },
        label: t(
          commitSha && !compareWorking
            ? "git.commitVersion"
            : staged && !commitSha
              ? "git.indexVersion"
              : "git.workingVersion",
        ),
      }}
    />
  );
}
