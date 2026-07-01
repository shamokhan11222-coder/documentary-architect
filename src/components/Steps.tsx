import { Link } from "@tanstack/react-router";
import { useSelectedTopicId, useTopics, useProjectStatus } from "@/lib/store";

type StepKey =
  | "topic"
  | "research"
  | "story"
  | "visual"
  | "thumbnail"
  | "seo"
  | "rating"
  | "export";

const STEPS: { key: StepKey; label: string; to: string }[] = [
  { key: "topic", label: "Project", to: "/topics" },
  { key: "research", label: "Research", to: "/research" },
  { key: "story", label: "Story", to: "/story" },
  { key: "visual", label: "Storyboard", to: "/visual" },
  { key: "thumbnail", label: "Thumbnail", to: "/thumbnail" },
  { key: "seo", label: "SEO", to: "/seo" },
  { key: "rating", label: "Rating", to: "/rating" },
  { key: "export", label: "Export", to: "/settings" },
];

export function Steps({ current }: { current: StepKey }) {
  const selectedId = useSelectedTopicId();
  const topics = useTopics();
  const hasTopic = !!topics.find((t) => t.id === selectedId);
  const status = useProjectStatus(selectedId);

  function done(key: StepKey): boolean {
    if (key === "topic") return hasTopic;
    if (key === "export") return false;
    return (status as unknown as Record<string, boolean>)[key] ?? false;
  }

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1 text-xs">
      {STEPS.map((s, i) => {
        const isCurrent = s.key === current;
        const isDone = done(s.key);
        return (
          <div key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/50">→</span>}
            <Link
              to={s.to}
              className={[
                "rounded-md px-2 py-1 transition-colors",
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : isDone
                    ? "bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25"
                    : "text-muted-foreground hover:bg-accent",
              ].join(" ")}
            >
              {s.label}
              {isDone && !isCurrent ? " ✓" : ""}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
