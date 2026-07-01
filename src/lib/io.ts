import { toast } from "sonner";

export function copyText(text: string, label = "Copied") {
  navigator.clipboard.writeText(text);
  toast.success(label);
}

export function slugify(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "");
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTxt(name: string, content: string) {
  download(name.endsWith(".txt") ? name : name + ".txt", content, "text/plain");
}

export function downloadJson(name: string, data: unknown) {
  download(
    name.endsWith(".json") ? name : name + ".json",
    JSON.stringify(data, null, 2),
    "application/json",
  );
}
