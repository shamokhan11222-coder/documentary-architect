import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTopics, useSelectedTopicId, exportProject, useTaste, clearTaste } from "@/lib/store";
import { getGateStatus, lockSite } from "@/lib/gate.functions";
import { Steps } from "@/components/Steps";
import { downloadJson, slugify } from "@/lib/io";
import { toggleTheme, useTheme } from "@/lib/theme";
import { CREDIT_MODES, useCreditConfig, setCreditMode, type CreditMode } from "@/lib/credit-mode";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Documentary Studio" }] }),
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
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Steps current="export" />
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Private tool. Data is stored locally in this browser.
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">Credit Saver Mode</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Controls how aggressively DOCU OS spends AI credits. Finished work is
            always reused — this only shapes new generation.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
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
                    "rounded-lg border p-3 text-left transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium">{cfg.label}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{cfg.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">Theme</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Currently {theme === "dark" ? "dark" : "light"} mode.
          </p>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={toggleTheme}>
              Switch to {theme === "dark" ? "light" : "dark"} mode
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">Configuration</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the settings that shape every generation.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">Storage</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {topics.length} saved topic(s). AI runs on Lovable AI (server-side key).
          </p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">AI Taste Memory</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Liked {taste.liked.length} · Rejected {taste.rejected.length} · Completed{" "}
            {taste.completed.length}. The Home feed learns from this.
          </p>
          <div className="mt-3">
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
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">Current project</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {selected ? selected.topic : "No project selected."}
          </p>
          <div className="mt-3">
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
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportData}>
            Export All (backup)
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
          ? "A password gate is active on this deployment. Visitors must unlock before using DOCU OS."
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