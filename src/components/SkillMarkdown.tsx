import type { Components } from "react-markdown";
import { parseSkillDocument } from "../lib/skillDocument";
import { SkillDocumentMetadata } from "./SkillDocumentMetadata";
import { MarkdownContent } from "./MarkdownContent";

export function SkillMarkdown({
  content,
  className,
  components,
}: {
  content: string;
  className?: string;
  components?: Components;
}) {
  const { body, fields, rawMetadata } = parseSkillDocument(content);
  return (
    <MarkdownContent
      content={body}
      className={className}
      components={components}
    >
      <SkillDocumentMetadata fields={fields} rawMetadata={rawMetadata} />
    </MarkdownContent>
  );
}
