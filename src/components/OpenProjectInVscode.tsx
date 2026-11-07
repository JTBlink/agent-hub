import { openDirectoryInVscode } from "../lib/openInVscode";
import { VscodeButton } from "./VscodeButton";

export function OpenProjectInVscode({
  path,
  title,
}: {
  path: string;
  title?: string;
}) {
  return (
    <VscodeButton
      iconOnly
      disabled={!path}
      title={title}
      onOpen={() => openDirectoryInVscode(path)}
    />
  );
}
