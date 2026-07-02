import { setSelectedTopicId, useProjectStatus, useRating } from "@/lib/store";
import type { Topic } from "@/lib/types";

const STAGES: { key: string; label: string }[] = [
  { key: "research", label: "Research" },
  { key: "story", label: "Story" },
  { key: "visual", label: "Visual" },
  { key: "prompts", label: "Prompts" },
  { key: "thumbnail", label: "Thumbnail" },
  { key: "seo", label: "SEO" },
  { key: "rating", label: "Rating" },
];

export function ProjectHeader({
  topics,
  selectedId,
}: {
  topics: Topic[];
  selectedId: string | null;
}) {
  const status = useProjectStatus(selectedId);
  const rating = useRating(selectedId);
  const selected = topics.find((t) => t.id === selectedId) ?? null;

  const s = status as unknown as Record<string, boolean>;
  const done = STAGES.filter((st) => s[st.key]).length;
  const pct = Math.round((done / STAGES.length) * 100);
  const current = STAGES.find((st) => !s[st.key])?.label ?? "Complete";

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          className="h-10 max-w-full rounded-xl border border-border bg-background/60 px-3.5 text-sm font-medium shadow-soft transition-all duration-200 focus-ring hover:border-brand/30"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedTopicId(e.target.value || null)}
        >
          <option value="">Select a project…</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.topic}
            </option>
          ))}
        </select>
        {selected && (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <Stat label="Stage" value={current} />
            <Stat label="Complete" value={`${pct}%`} />
            <Stat label="Est. runtime" value={selected.estimatedLength} />
            <Stat
              label="Rating"
              value={rating ? `${rating.overallScore}/10` : "—"}
            />
          </div>
        )}
      </div>
      {selected && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
