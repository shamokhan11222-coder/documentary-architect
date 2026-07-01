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
      className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
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
