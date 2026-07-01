import { ThumbsUp, ThumbsDown, Heart } from "lucide-react";
import { recordFeedback, useFeedbackFor } from "@/lib/preferences";
import type { FeedbackRating } from "@/lib/types";

/**
 * 👍 Good / ❤️ Favorite / 👎 Bad reaction row. Every reaction is remembered
 * permanently and fed back into future AI generations (Learn My Style).
 */
export function Feedback({
  kind,
  content,
  topicId,
  className = "",
}: {
  kind: string;
  content: string;
  topicId?: string;
  className?: string;
}) {
  const current = useFeedbackFor(kind, content);

  function set(rating: FeedbackRating) {
    recordFeedback(kind, rating, content, topicId);
  }

  const btn = (active: boolean) =>
    `inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent ${
      active ? "border-primary bg-primary/10 text-primary" : "border-border"
    }`;

  return (
    <div className={`flex items-center gap-1 ${className}`} title="Teach the AI your style">
      <button type="button" className={btn(current === "good")} onClick={() => set("good")} aria-label="Good">
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btn(current === "favorite")} onClick={() => set("favorite")} aria-label="Favorite">
        <Heart className={`h-3.5 w-3.5 ${current === "favorite" ? "fill-current" : ""}`} />
      </button>
      <button type="button" className={btn(current === "bad")} onClick={() => set("bad")} aria-label="Bad">
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
