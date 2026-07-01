import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTopics } from "@/lib/store";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Documentary Studio" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const topics = useTopics();

  function exportData() {
    const data = {
      topics: localStorage.getItem("docos.topics"),
      research: localStorage.getItem("docos.research"),
      story: localStorage.getItem("docos.story"),
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
    ["docos.topics", "docos.research", "docos.story", "docos.selectedTopic"].forEach(
      (k) => localStorage.removeItem(k),
    );
    window.dispatchEvent(new Event("storage"));
    toast.success("All data cleared");
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Private tool. Data is stored locally in this browser.
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">Storage</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {topics.length} saved topic(s). AI runs on Lovable AI (server-side key).
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportData}>
            Export backup
          </Button>
          <Button variant="destructive" onClick={clearAll}>
            Clear all data
          </Button>
        </div>
      </div>
    </div>
  );
}