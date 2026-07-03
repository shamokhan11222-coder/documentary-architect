import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTopics, useSelectedTopicId, exportProject, useTaste, clearTaste } from "@/lib/store";
import { getGateStatus, lockSite } from "@/lib/gate.functions";
import { downloadJson, slugify } from "@/lib/io";
import { toggleTheme, useTheme } from "@/lib/theme";
import { CREDIT_MODES, useCreditConfig, setCreditMode, type CreditMode } from "@/lib/credit-mode";
import { Gauge, Palette, SlidersHorizontal, Database, Brain, FolderOpen, Archive, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Stickmax Studio" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const taste = useTaste();
  const theme = useTheme();
  const credit = useCreditConfig();

  function exportData() {
    const data = {
      topics: localStorage.getItem("docos.topics"),
      research: localStorage.getItem("docos.research"),
      story: localStorage.getItem("docos.story"),
      visual: localStorage.getItem("docos.visual"),
      prompts: localStorage.getItem("docos.prompts"),
      thumbnails: localStorage.getItem("docos.thumbnails"),
      seo: localStorage.getItem("docos.seo"),
      rating: localStorage.getItem("docos.rating"),
      taste: localStorage.getItem("docos.taste"),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "documentary-studio-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    if (!confirm("Delete ALL topics, research and scripts? This cannot be undone."))
      return;
    [
      "docos.topics",
      "docos.research",
      "docos.story",
      "docos.visual",
      "docos.prompts",
      "docos.thumbnails",
      "docos.seo",
      "docos.rating",
      "docos.taste",
      "docos.selectedTopic",
      "docos.pipeline",
      "docos.voice",
    ].forEach((k) => localStorage.removeItem(k));
    window.dispatchEvent(new Event("storage"));
    toast.success("All data cleared");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:py-14">
      <div className="animate-[fade-up_0.5s_var(--ease-out-quint)_both]">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Settings</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Tune how Stickmax works. Everything stays private in this browser.
        </p>
      </div>

      <div className="mt-8 space-y-5">
        <section className="glass-panel rounded-2xl p-6 animate-[fade-up_0.5s_var(--ease-out-quint)_both]" style={{ animationDelay: "40ms" }}>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Gauge className="h-[18px] w-[18px] text-brand" /> Credit Saver Mode
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Controls how aggressively Stickmax Studio spends AI credits. Finished work is
            always reused — this only shapes new generation.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(Object.keys(CREDIT_MODES) as CreditMode[]).map((id) => {
              const cfg = CREDIT_MODES[id];
              const active = credit.id === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setCreditMode(id);
                    toast.success(`${cfg.label} enabled`);
                  }}
                  className={[
                    "rounded-xl border p-3.5 text-left transition-all duration-200 focus-ring",
                    active
                      ? "border-brand/60 bg-brand/10 shadow-[0_0_22px_-6px_color-mix(in_oklab,var(--brand)_65%,transparent)]"
                      : "border-border/70 hover:-translate-y-0.5 hover:border-brand/35 hover:bg-accent/50",
                  ].join(" ")}
                >
                  <div className={`text-sm font-medium ${active ? "text-brand" : ""}`}>{cfg.label}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{cfg.description}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6 animate-[fade-up_0.5s_var(--ease-out-quint)_both]" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Palette className="h-[18px] w-[18px] text-brand" /> Theme
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Currently {theme === "dark" ? "dark" : "light"} mode.
          </p>
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={toggleTheme}>
              Switch to {theme === "dark" ? "light" : "dark"} mode
            </Button>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6 animate-[fade-up_0.5s_var(--ease-out-quint)_both]" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center gap-2 text-base font-semibold">
            <SlidersHorizontal className="h-[18px] w-[18px] text-brand" /> Configuration
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Manage the settings that shape every generation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" asChild>
              <Link to="/api-keys">AI Providers</Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/visual-dna">Visual DNA</Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/voice">Voice Settings</Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/instructions">AI Instructions</Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/export">Export</Link>
            </Button>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6 animate-[fade-up_0.5s_var(--ease-out-quint)_both]" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Database className="h-[18px] w-[18px] text-brand" /> Storage
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {topics.length} saved topic(s). AI runs on Lovable AI (server-side key).
          </p>
        </section>

        <section className="glass-panel rounded-2xl p-6 animate-[fade-up_0.5s_var(--ease-out-quint)_both]" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Brain className="h-[18px] w-[18px] text-brand" /> AI Taste Memory
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Liked {taste.liked.length} · Rejected {taste.rejected.length} · Completed{" "}
            {taste.completed.length}. The Home feed learns from this.
          </p>
          <div className="mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearTaste();
                toast.success("Taste memory reset");
              }}
            >
              Reset taste memory
            </Button>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6 animate-[fade-up_0.5s_var(--ease-out-quint)_both]" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center gap-2 text-base font-semibold">
            <FolderOpen className="h-[18px] w-[18px] text-brand" /> Current project
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {selected ? selected.topic : "No project selected."}
          </p>
          <div className="mt-4">
            <Button
              size="sm"
              disabled={!selected}
              onClick={() =>
                selected &&
                downloadJson(slugify(selected.topic) + "-project", exportProject(selected.id))
              }
            >
              Export current project
            </Button>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" onClick={exportData}>
            <Archive className="h-4 w-4" /> Export All (backup)
          </Button>
          <Button variant="destructive" onClick={clearAll}>
            Clear all data
          </Button>
        </div>

        <PrivateAccess />
      </div>
    </div>
  );
}

function PrivateAccess() {
  const getStatus = useServerFn(getGateStatus);
  const lock = useServerFn(lockSite);
  const [status, setStatus] = useState<{ enabled: boolean; unlocked: boolean } | null>(null);

  useEffect(() => {
    getStatus().then(setStatus).catch(() => setStatus(null));
  }, [getStatus]);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-sm font-medium">Private access</div>
      <p className="mt-1 text-sm text-muted-foreground">
        {status?.enabled
          ? "A password gate is active on this deployment. Visitors must unlock before using Stickmax Studio."
          : "The site is open. To make the deployed app private, set a SITE_PASSWORD environment variable — the login gate then turns on automatically."}
      </p>
      {status?.enabled && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await lock();
              toast.success("Locked. You'll need the password next time.");
              window.location.href = "/unlock";
            }}
          >
            Lock this browser
          </Button>
        </div>
      )}
    </div>
  );
}