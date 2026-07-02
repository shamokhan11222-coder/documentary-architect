import { setSelectedTopicId, useSelectedTopicId, useTopics } from "@/lib/store";
import type { Topic } from "@/lib/types";

export function useSelectedProject(): { topics: Topic[]; selected: Topic | null; selectedId: string | null } {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  return { topics, selected, selectedId };
}

export function ProjectPicker() {
  const { topics, selectedId } = useSelectedProject();
  return (
    <select
      className="h-10 w-full max-w-sm rounded-xl border border-border bg-background/60 px-3.5 text-sm shadow-soft transition-all duration-200 focus-ring hover:border-brand/30"
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
  );
}
