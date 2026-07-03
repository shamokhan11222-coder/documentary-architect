import { Link, useRouter } from "@tanstack/react-router";
import {
  Undo2,
  Redo2,
  History,
  Check,
  Cloud,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
} from "@/lib/store";
import { completionPercent, stageDone, type StageKey } from "@/lib/manager";
import { useStageHistory, type StageId } from "@/lib/stage-history";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type NavItem = { label: string; to: string; stage: StageId; done: StageKey; expert: string };

const NAV: NavItem[] = [
  { label: "Research", to: "/research", stage: "research", done: "research", expert: "Research Expert" },
  { label: "Story", to: "/story", stage: "story", done: "story", expert: "Story Architect" },
  { label: "Storyboard", to: "/visual", stage: "visual", done: "storyboard", expert: "Visual Director" },
  { label: "Voiceover", to: "/voice", stage: "voice", done: "voice", expert: "Voice Director" },
  { label: "Thumbnail", to: "/thumbnail", stage: "thumbnail", done: "thumbnail", expert: "Thumbnail Designer" },
  { label: "SEO", to: "/seo", stage: "seo", done: "seo", expert: "SEO Specialist" },
  { label: "Rating", to: "/rating", stage: "rating", done: "rating", expert: "Quality Reviewer" },
];

function savedLabel(savedAt: number | null): string {
  if (!savedAt) return "No changes yet";
  const s = Math.floor((Date.now() - savedAt) / 1000);
  if (s < 5) return "All changes saved";
  if (s < 60) return `Saved ${s}s ago`;
  const m = Math.floor(s / 60);
  return `Saved ${m}m ago`;
}

export function StageShell({
  stage,
  children,
  maxWidth = "max-w-5xl",
}: {
  stage: StageId;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const router = useRouter();
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;

  const idx = NAV.findIndex((n) => n.stage === stage);
  const current = NAV[idx] ?? NAV[0];
  const prev = idx > 0 ? NAV[idx - 1] : null;
  const next = idx < NAV.length - 1 ? NAV[idx + 1] : null;

  const percent = selectedId ? completionPercent(selectedId) : 0;
  const { canUndo, canRedo, undo, redo, entries, index, jumpTo, savedAt } = useStageHistory(
    stage,
    selectedId,
  );

  function goContinue() {
    if (next) router.navigate({ to: next.to });
    else router.navigate({ to: "/export" });
  }

  return (
    <div className="brand-gradient min-h-screen">
      {/* Top progress bar + connected control bar */}
      <div className="sticky top-0 z-20">
        <div className="h-1 w-full bg-muted/60">
          <div
            className="h-full bg-gradient-to-r from-brand to-brand/60 transition-[width] duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="glass border-b border-border/60">
          <div className={`mx-auto ${maxWidth} px-6 py-3`}>
            {/* Row: project + autosave + actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <select
                  className="h-9 max-w-[16rem] rounded-xl border border-border/60 bg-card/50 px-3 text-sm font-medium transition-colors hover:border-brand/40 focus:outline-none"
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
                <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground sm:flex">
                  {savedAt ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5" />
                  )}
                  {savedLabel(savedAt)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  aria-label="Undo"
                  title="Undo"
                  className="rounded-lg border border-border/60 bg-card/50 p-2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  aria-label="Redo"
                  title="Redo"
                  className="rounded-lg border border-border/60 bg-card/50 p-2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Redo2 className="h-4 w-4" />
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger className="rounded-lg border border-border/60 bg-card/50 p-2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none" title="History">
                    <History className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                    <DropdownMenuLabel>Edit history</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {entries.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">No history yet.</div>
                    )}
                    {entries
                      .map((e, i) => ({ e, i }))
                      .reverse()
                      .map(({ e, i }) => (
                        <DropdownMenuItem
                          key={i}
                          onClick={() => jumpTo(i)}
                          className={i === index ? "bg-brand/10 text-brand" : ""}
                        >
                          <span className="flex-1">{e.label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  onClick={() => window.dispatchEvent(new Event("open-ai-chat"))}
                  className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/15"
                  title={`Ask the ${current.expert}`}
                >
                  <Sparkles className="h-4 w-4" /> Ask AI
                </button>

                <Button size="sm" onClick={goContinue} className="btn-press ml-1">
                  Continue <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Stage navigation */}
            <div className="mt-3 flex items-center gap-2">
              {prev ? (
                <Link
                  to={prev.to}
                  aria-label={`Back to ${prev.label}`}
                  className="shrink-0 rounded-lg border border-border/60 bg-card/50 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span className="shrink-0 rounded-lg border border-transparent p-1.5 opacity-0">
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}

              <nav className="flex flex-1 items-center gap-1 overflow-x-auto pb-1">
                {NAV.map((n) => {
                  const active = n.stage === stage;
                  const done = selectedId ? stageDone(selectedId, n.done) : false;
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      className={`group flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                        active
                          ? "border-brand/40 bg-brand/12 text-brand shadow-[0_0_18px_-6px_color-mix(in_oklab,var(--brand)_70%,transparent)]"
                          : "border-border/60 bg-card/40 text-muted-foreground hover:border-brand/30 hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
                          done
                            ? "bg-emerald-500 text-white"
                            : active
                              ? "bg-brand text-brand-foreground"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {done ? <Check className="h-2.5 w-2.5" /> : NAV.indexOf(n) + 1}
                      </span>
                      {n.label}
                    </Link>
                  );
                })}
              </nav>

              {next ? (
                <Link
                  to={next.to}
                  aria-label={`Next: ${next.label}`}
                  className="shrink-0 rounded-lg border border-border/60 bg-card/50 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="shrink-0 rounded-lg border border-transparent p-1.5 opacity-0">
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stage content */}
      <div className={`mx-auto ${maxWidth} px-6 py-8`}>{children}</div>
    </div>
  );
}
