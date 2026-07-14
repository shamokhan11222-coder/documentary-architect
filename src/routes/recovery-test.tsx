import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runRecoveryTest } from "@/lib/recovery-test.functions";

export const Route = createFileRoute("/recovery-test")({
  component: RecoveryTestPage,
});

interface Row {
  module: string;
  endpoint: string;
  provider: string;
  status: number | "ok" | "error";
  ok: boolean;
  detail: string;
}

function RecoveryTestPage() {
  const runFn = useServerFn(runRecoveryTest);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setRows([]);
    try {
      const text = (await runFn()) as Row[];
      // Voice preview test — client-only, hits /api/tts (Lovable Gateway TTS)
      let voice: Row = {
        module: "Voice",
        endpoint: "/api/tts → ai.gateway.lovable.dev",
        provider: "lovable-gateway",
        status: "error",
        ok: false,
        detail: "",
      };
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Recovery test.", profile: "calm" }),
        });
        voice = { ...voice, status: res.status, ok: res.ok, detail: res.ok ? "audio returned" : (await res.text()).slice(0, 160) };
      } catch (e) {
        voice.detail = e instanceof Error ? e.message : String(e);
      }
      setRows([...text, voice]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", color: "#e5e7eb", background: "#0b0f19", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Text/Voice Recovery Test</h1>
      <p style={{ opacity: 0.7, marginBottom: 16 }}>
        Expected endpoint for every row: <code>ai.gateway.lovable.dev</code>
      </p>
      <button
        onClick={run}
        disabled={busy}
        style={{ padding: "8px 16px", borderRadius: 8, background: "#2563eb", color: "white", border: 0, cursor: "pointer" }}
      >
        {busy ? "Running…" : "Run recovery test"}
      </button>
      <table style={{ marginTop: 20, width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", opacity: 0.7 }}>
            <th style={{ padding: 6 }}>Module</th>
            <th style={{ padding: 6 }}>Endpoint</th>
            <th style={{ padding: 6 }}>Provider</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid #1f2937", background: r.ok ? "transparent" : "#3f1d1d" }}>
              <td style={{ padding: 6 }}>{r.module}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{r.endpoint}</td>
              <td style={{ padding: 6 }}>{r.provider}</td>
              <td style={{ padding: 6 }}>{String(r.status)}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12, opacity: 0.85 }}>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
