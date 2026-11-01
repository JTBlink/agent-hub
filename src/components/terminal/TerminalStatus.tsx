export function TerminalStatus({
  message,
  notice,
  error = false,
}: {
  message: string;
  notice?: string;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex min-h-5 min-w-0 flex-1 items-center gap-2 text-xs ${error ? "text-danger" : "text-muted"}`}
    >
      <span className="min-w-0 flex-1 truncate" title={notice}>
        {message}
      </span>
    </div>
  );
}
