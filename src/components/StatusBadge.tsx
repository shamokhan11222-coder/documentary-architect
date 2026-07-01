export type Status = "Not Started" | "In Progress" | "Completed" | "Needs Review";

const STYLES: Record<Status, string> = {
  "Not Started": "bg-muted text-muted-foreground",
  "In Progress": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  "Needs Review": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
