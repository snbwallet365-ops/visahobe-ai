"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CopyButton, Markdown } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { IconArrowUp, IconChevron, IconMic, IconPlus } from "@/components/icons";

interface Phase { key: string; label: string; phase: string; status: "running" | "done" }
interface Msg {
  role: "user" | "assistant";
  content: string;
  phases?: Phase[];
  attachments?: { name: string; size: number; type: string }[];
  sources?: { n: number; filename: string; page: number; score: number }[];
}

const MODELS = ["Auto", "Reasoning", "Fast", "Research", "Documents"];

const CHIPS = [
  { label: "Help me write", prompt: "একটি অস্ট্রেলিয়া ওয়ার্ক ভিসার কভার লেটার লিখে দিন" },
  { label: "Learn about", prompt: "ডেনমার্ক পজিটিভ লিস্ট স্কিম সম্পর্কে বিস্তারিত জানান" },
  { label: "Analyze image", prompt: "আমার পাসপোর্টের ছবি বিশ্লেষণ করে কী কী তথ্য দরকার বলুন" },
  { label: "Summarize text", prompt: "দুবাই ওয়ার্ক পারমিটের নিয়মগুলো সংক্ষেপে বলুন" },
];

const MORE_CHIPS = [
  { label: "Check eligibility", prompt: "আমার বয়স ২৯, ব্যাংকে ১৫ হাজার ডলার, জব অফার আছে — কানাডায় যোগ্যতা কত?" },
  { label: "Document checklist", prompt: "মালয়েশিয়া এমপ্লয়মেন্ট পাসের সম্পূর্ণ ডকুমেন্ট চেকলিস্ট দিন" },
  { label: "Compare countries", prompt: "কাতার ও বাহরাইনের ওয়ার্ক ভিসার তুলনা করুন" },
  { label: "Estimate cost", prompt: "জার্মানি ইইউ ব্লু কার্ডের মোট খরচ কত হবে?" },
];

const PHASE_ICON: Record<string, string> = {
  thinking: "◐", searching: "◑", acting: "◒", writing: "◓", reviewing: "◔",
};

export default function ChatWorkspace({ mode = "chat" }: { mode?: "chat" | "pdf" | "search" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { push, dismiss } = useToast();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("Auto");
  const [modelOpen, setModelOpen] = useState(false);
  const [seeMore, setSeeMore] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [files, setFiles] = useState<{ name: string; size: number; type: string; preview?: string }[]>([]);
  const [pdfIds, setPdfIds] = useState<number[]>([]);

  const endRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore a conversation from ?c=
  useEffect(() => {
    const c = Number(params.get("c"));
    if (!Number.isFinite(c) || c <= 0) return;
    fetch(`/api/conversations?id=${c}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.messages) return;
        setConversationId(c);
        setMessages(j.messages.map((m: { role: string; content: string }) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        })));
      })
      .catch(() => {});
  }, [params]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  /* ── PDF Space RAG pipeline ── */
  async function handlePDFUpload(file: File) {
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      push("Only PDF files are supported here.", "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      push("File exceeds the 20MB limit.", "error");
      return;
    }
    const t1 = push("Extracting text and chunking document...", "loading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/pdf", { method: "POST", body: fd });
      const j = await res.json();
      dismiss(t1);
      if (!res.ok) { push(j.error ?? "Upload failed.", "error"); return; }
      const t2 = push("Embedding chunks into the vector index...", "loading");
      setTimeout(() => {
        dismiss(t2);
        push(`PDF Ready for Query — ${j.chunkCount} chunks, ${j.pages} pages`, "success", 4200);
      }, 700);
      setPdfIds((x) => [...new Set([...x, j.docId])]);
      window.dispatchEvent(new CustomEvent("pdf-updated"));
    } catch {
      dismiss(t1);
      push("Network error during upload.", "error");
    }
  }

  function onPick(list: File[]) {
    for (const f of list) {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) void handlePDFUpload(f);
      else setFiles((prev) => [...prev, {
        name: f.name, size: f.size, type: f.type,
        preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      }]);
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const attachments = files.map((f) => ({ name: f.name, size: f.size, type: f.type }));
    setMessages((m) => [...m, { role: "user", content, attachments }, { role: "assistant", content: "", phases: [] }]);
    setInput("");
    setFiles([]);
    setBusy(true);
    if (areaRef.current) areaRef.current.style.height = "auto";

    const usePdf = mode === "pdf" && pdfIds.length > 0;
    const useSearch = mode === "search" || model === "Research";

    try {
      if (usePdf) {
        const res = await fetch("/api/pdf/query", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: content, docIds: pdfIds }),
        });
        await consume(res, patchLast);
      } else {
        if (useSearch) {
          patchLast((m) => ({ ...m, phases: [{ key: "s", label: "Searching sources", phase: "searching", status: "running" }] }));
          try {
            const r = await fetch("/api/research", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: content }),
            }).then((x) => x.json());
            patchLast((m) => ({
              ...m,
              phases: [{ key: "s", label: `${(r.sources ?? []).length} sources found`, phase: "searching", status: "done" }],
              sources: (r.sources ?? []).map((s: { title: string }, i: number) => ({ n: i + 1, filename: s.title, page: 0, score: 1 })),
            }));
          } catch { /* continue */ }
        }
        const res = await fetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            agentMode: model === "Auto" || model === "Reasoning",
            canvasEnabled: false,
            conversationId,
            attachments,
            taskType: model === "Fast" ? "fast-chat" : model === "Documents" ? "document-generation" : undefined,
          }),
        });
        await consume(res, patchLast, (id) => {
          setConversationId(id);
          if (!conversationId) router.replace(`/chat?c=${id}`);
        });
      }
    } catch {
      patchLast((m) => ({ ...m, content: m.content + "\n\n_Connection interrupted. Please try again._" }));
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;
  const chips = seeMore ? [...CHIPS, ...MORE_CHIPS] : CHIPS;

  return (
    <div className="relative flex h-screen flex-col">
      {/* ── Top header ── */}
      <header className="absolute right-0 top-0 z-20 flex items-center gap-3 px-5 py-4 lg:px-6">
        <div className="relative">
          <button onClick={() => setModelOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] text-[#374151] hover:bg-[var(--color-hover)]">
            {model} <IconChevron />
          </button>
          {modelOpen && (
            <div className="cx-glass cx-in absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl py-1">
              {MODELS.map((m) => (
                <button key={m} onClick={() => { setModel(m); setModelOpen(false); }}
                  className={`block w-full px-3.5 py-2 text-left text-[13.5px] hover:bg-[var(--color-hover)] ${m === model ? "font-medium" : "text-[#374151]"}`}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="cx-btn cx-btn-dark px-4 py-2">Sign In</button>
      </header>

      {/* ── Main ── */}
      <div className="cx-scroll flex flex-1 flex-col overflow-y-auto">
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-5 pb-24 pt-20">
            <h1 className="cx-fade cx-display mb-8 text-[24px] font-medium text-[#111827]">
              {mode === "pdf" ? "Ask anything about your PDFs" : mode === "search" ? "What would you like to research?" : "How can I help you?"}
            </h1>
            <Composer
              {...{ input, setInput, areaRef, fileRef, send, busy, files, setFiles, onPick, mode }}
            />
            <div className="mt-4 flex max-w-[800px] flex-wrap justify-center gap-2">
              {chips.map((c) => (
                <button key={c.label} className="cx-chip" onClick={() => void send(c.prompt)}>{c.label}</button>
              ))}
              {!seeMore && (
                <button className="cx-chip" onClick={() => setSeeMore(true)}>+ See More</button>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[800px] flex-1 px-5 pb-6 pt-20">
            <div className="space-y-7">
              {messages.map((m, i) => (
                <div key={i} className="cx-fade">
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#f3f4f6] px-4 py-2.5 text-[14.5px] leading-relaxed text-[#111827]">
                        {m.content}
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.attachments.map((a) => (
                              <span key={a.name} className="rounded-full bg-white px-2.5 py-0.5 text-[11.5px] text-[#4b5563]">{a.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {m.phases && m.phases.length > 0 && (
                        <div className="mb-3 space-y-1 rounded-xl border border-[var(--color-line)] bg-white px-4 py-2.5">
                          {m.phases.map((p) => (
                            <div key={p.key} className="flex items-center gap-2 text-[12.5px]">
                              <span className={p.status === "running" ? "cx-spin inline-block" : ""}>{PHASE_ICON[p.phase] ?? "•"}</span>
                              <span className={p.status === "done" ? "text-gray-500" : "text-[#111827]"}>{p.label}</span>
                              {p.status === "done" && <span className="text-[#16a34a]">✓</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {m.content ? (
                        <>
                          <Markdown text={m.content} />
                          {m.sources && m.sources.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {m.sources.map((s) => (
                                <span key={s.n} className="cx-pill">
                                  [{s.n}] {s.filename}{s.page ? ` · p.${s.page}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {!busy && <div className="mt-2.5"><CopyButton text={m.content} /></div>}
                        </>
                      ) : (
                        <div className="space-y-2 pt-1">
                          <div className="cx-shimmer h-3 w-2/3 rounded-full" />
                          <div className="cx-shimmer h-3 w-1/2 rounded-full" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky composer when conversation active ── */}
      {!empty && (
        <div className="border-t border-[var(--color-line)] bg-[var(--color-canvas)] px-5 pb-3 pt-3">
          <div className="mx-auto flex max-w-[800px] flex-col items-center">
            <Composer {...{ input, setInput, areaRef, fileRef, send, busy, files, setFiles, onPick, mode }} />
          </div>
        </div>
      )}

      {/* ── Footer disclaimer ── */}
      <footer className="cx-micro pb-4 pt-2 text-center text-xs text-gray-400">
        We are not affiliated with any owners or companies that developed the LLM models provided on this website.
      </footer>
    </div>
  );
}

/* ─────────── Shared composer ─────────── */

function Composer({
  input, setInput, areaRef, fileRef, send, busy, files, setFiles, onPick, mode,
}: {
  input: string;
  setInput: (v: string) => void;
  areaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileRef: React.RefObject<HTMLInputElement | null>;
  send: (t?: string) => void | Promise<void>;
  busy: boolean;
  files: { name: string; size: number; type: string; preview?: string }[];
  setFiles: React.Dispatch<React.SetStateAction<{ name: string; size: number; type: string; preview?: string }[]>>;
  onPick: (files: File[]) => void;
  mode: string;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="w-full max-w-[800px]">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="cx-pill">
              {f.preview ? <img src={f.preview} alt="" className="h-5 w-5 rounded object-cover" /> : null}
              {f.name}
              <button className="ml-1 text-gray-400 hover:text-gray-700" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onPick(Array.from(e.dataTransfer.files)); }}
        className={`flex items-center gap-2 rounded-[24px] border bg-white px-4 py-3 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] transition-colors ${
          drag ? "border-gray-900" : "border-gray-300"
        }`}
      >
        <input
          ref={fileRef} type="file" multiple className="hidden"
          accept={mode === "pdf" ? "application/pdf,.pdf" : undefined}
          onChange={(e) => { onPick(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
        <button onClick={() => fileRef.current?.click()} className="shrink-0 rounded-full p-1 text-gray-500 hover:bg-[var(--color-hover)] hover:text-gray-900" title="Upload file">
          <IconPlus width={19} height={19} />
        </button>
        <textarea
          ref={areaRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const el = areaRef.current;
            if (el) { el.style.height = "auto"; el.style.height = `${Math.min(150, el.scrollHeight)}px`; }
          }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={drag ? "Drop your PDF here…" : "Type a message..."}
          className="max-h-40 flex-1 resize-none bg-transparent text-[14.5px] leading-6 outline-none placeholder:text-gray-400"
        />
        <button className="shrink-0 rounded-full p-1 text-gray-500 hover:bg-[var(--color-hover)] hover:text-gray-900" title="Voice input">
          <IconMic width={18} height={18} />
        </button>
        <button
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          title="Send"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black text-white transition-opacity hover:bg-gray-800 disabled:opacity-30"
        >
          {busy
            ? <span className="cx-spin h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white" />
            : <IconArrowUp width={16} height={16} />}
        </button>
      </div>
    </div>
  );
}

/* ─────────── SSE consumer ─────────── */

async function consume(
  res: Response,
  patchLast: (fn: (m: Msg) => Msg) => void,
  onConv?: (id: number) => void,
) {
  if (!res.body) throw new Error("no stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const ev = JSON.parse(line.slice(5).trim()) as {
        type: string; text?: string; label?: string; key?: string; phase?: string;
        status?: "running" | "done"; conversationId?: number;
        sources?: { n: number; filename: string; page: number; score: number }[];
      };
      if (ev.type === "delta" && ev.text) patchLast((m) => ({ ...m, content: m.content + ev.text }));
      else if (ev.type === "phase") {
        patchLast((m) => {
          const phases = [...(m.phases ?? [])];
          const i = phases.findIndex((p) => p.key === ev.key);
          const next: Phase = { key: ev.key!, label: ev.label!, phase: ev.phase!, status: ev.status! };
          if (i >= 0) phases[i] = next; else phases.push(next);
          return { ...m, phases };
        });
      } else if (ev.type === "sources") patchLast((m) => ({ ...m, sources: ev.sources }));
      else if (ev.type === "done" && ev.conversationId && onConv) onConv(ev.conversationId);
    }
  }
}
