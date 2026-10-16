"use client";

import { useState } from "react";
import { Badge, CopyButton, Markdown, PageHeader } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { IconArrowUp, IconImage } from "@/components/icons";

interface Result { prompt: string; style: string; brief: string; seed: number }

const STYLES = ["Photoreal", "Illustration", "Infographic", "Document scan", "Social post", "Minimal"];

const PRESETS = [
  "Visa document checklist infographic for Australia",
  "Professional consultant office banner for social media",
  "Passport and boarding pass flat-lay, soft daylight",
  "Step-by-step work permit process diagram",
];

/** Deterministic pastel gradient preview generated from the prompt (no external image service). */
function seedFrom(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export default function ImagesPage() {
  const { push } = useToast();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(STYLES[0]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  async function generate(text?: string) {
    const p = (text ?? prompt).trim();
    if (!p || busy) return;
    setBusy(true);
    push("Composing visual brief...", "loading", 1200);
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `একটি ছবি তৈরির জন্য বিস্তারিত ভিজ্যুয়াল ব্রিফ লেখো।\nবিষয়: ${p}\nস্টাইল: ${style}\n\nচারটি অংশে দাও: ১) মূল দৃশ্য, ২) রঙ ও আলো, ৩) কম্পোজিশন ও অনুপাত, ৪) কী এড়াতে হবে।`,
          agentMode: false, canvasEnabled: false, taskType: "document-generation",
        }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "", acc = "";
      const seed = seedFrom(p + style);
      setResults((r) => [{ prompt: p, style, brief: "", seed }, ...r]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim().startsWith("data:")) continue;
          const ev = JSON.parse(part.trim().slice(5)) as { type: string; text?: string };
          if (ev.type === "delta" && ev.text) {
            acc += ev.text;
            setResults((r) => r.map((x, i) => (i === 0 ? { ...x, brief: acc } : x)));
          }
        }
      }
      setPrompt("");
      push("Visual brief ready", "success");
    } catch {
      push("Generation failed. Please try again.", "error");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Images"
        subtitle="Describe a visual and get a production-ready art brief plus a colour study"
        actions={<Badge tone="purple">{results.length} briefs</Badge>}
      />

      <div className="cx-scroll flex-1 overflow-y-auto px-5 py-6 lg:px-6">
        <div className="mx-auto max-w-[800px]">
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button key={s} onClick={() => setStyle(s)} className={`cx-chip ${style === s ? "cx-chip-on" : ""}`}>{s}</button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-[24px] border border-gray-300 bg-white px-4 py-3 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)]">
            <IconImage width={19} height={19} className="shrink-0 text-gray-500" />
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void generate(); }}
              placeholder="Describe the image you need..."
              className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-gray-400"
            />
            <button onClick={() => void generate()} disabled={busy || !prompt.trim()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black text-white hover:bg-gray-800 disabled:opacity-30">
              {busy ? <span className="cx-spin h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white" /> : <IconArrowUp width={16} height={16} />}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => <button key={p} className="cx-chip" onClick={() => void generate(p)}>{p}</button>)}
          </div>

          <div className="mt-6 space-y-4">
            {results.map((r, i) => {
              const h1 = r.seed % 360, h2 = (r.seed >> 7) % 360, h3 = (r.seed >> 13) % 360;
              return (
                <div key={i} className="cx-card cx-fade overflow-hidden">
                  <div
                    className="h-44 w-full"
                    style={{
                      background: `radial-gradient(circle at 25% 30%, hsl(${h1} 78% 84%), transparent 58%),
                                   radial-gradient(circle at 78% 25%, hsl(${h2} 74% 86%), transparent 55%),
                                   radial-gradient(circle at 50% 85%, hsl(${h3} 70% 88%), transparent 60%), #fff`,
                    }}
                  />
                  <div className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[14px] font-medium">{r.prompt}</div>
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral">{r.style}</Badge>
                        {r.brief && <CopyButton text={r.brief} />}
                      </div>
                    </div>
                    <div className="mt-3">
                      {r.brief ? <Markdown text={r.brief} /> : (
                        <div className="space-y-2">
                          <div className="cx-shimmer h-3 w-2/3 rounded-full" />
                          <div className="cx-shimmer h-3 w-1/2 rounded-full" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="cx-micro border-t border-[var(--color-line)] py-3 text-center text-xs text-gray-400">
        We are not affiliated with any owners or companies that developed the LLM models provided on this website.
      </footer>
    </div>
  );
}
