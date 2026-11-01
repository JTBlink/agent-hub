export function TerminalStatus({
  message,
  notice,
}: {
  message: string;
  notice?: string;
}) {
  return (
    <div
      role="status"
      className="flex min-h-5 min-w-0 flex-1 items-center gap-2 text-xs text-muted"
    >
      <span className="min-w-0 flex-1 truncate" title={notice}>
        {message}
      </span>
    </div>
  );
}
