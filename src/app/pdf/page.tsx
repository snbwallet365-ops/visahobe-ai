"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, CopyButton, Markdown, PageHeader } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { IconArrowUp, IconPdf, IconPlus, IconTrash } from "@/components/icons";

interface IndexedDoc { id: number; filename: string; sizeBytes: number; pages: number; chars: number; chunkCount: number; status: string; summary: string; createdAt: string }
interface GeneratedDoc { id: number; title: string; kind: string; format: string; body: string; createdAt: string }
interface Client { id: number; fullName: string; email?: string | null; passportNo?: string | null; nationality?: string | null }
interface Source { n: number; filename: string; page: number; score: number; snippet: string }
interface Msg { role: "user" | "assistant"; content: string; sources?: Source[] }

const STAGES = ["Validating file type and size", "Extracting text and chunking document…", "Embedding chunks into the vector index", "Storing vectors with page metadata"];
const TEMPLATES = [
  { kind: "cover-letter", label: "Cover Letter", bn: "কভার লেটার", description: "A clear, embassy-ready cover letter" },
  { kind: "sponsorship-letter", label: "Sponsorship Letter", bn: "স্পন্সরশিপ লেটার", description: "Sponsor and financial support declaration" },
  { kind: "employment-contract", label: "Employment Contract", bn: "চাকরির চুক্তি", description: "Structured employment agreement" },
  { kind: "invoice", label: "Visa Service Invoice", bn: "ভিসা সার্ভিস ইনভয়েস", description: "Professional client invoice" },
] as const;
const DEMO_BODY = `Date: ${new Date().toLocaleDateString("en-GB")}\n\nTo,\nThe Visa Officer\nEmbassy / High Commission\n\nSubject: Application for a visa\n\nDear Sir/Madam,\n\nI am writing to respectfully submit my visa application. I confirm that the information and documents supplied with this application are complete and accurate.\n\nI intend to comply with all immigration conditions and return or maintain my lawful status according to the visa requirements. Please find the supporting documents attached for your review.\n\nThank you for your time and consideration.\n\nYours faithfully,\nApplicant Name\nPassport: Passport Number`;

const kb = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export default function PdfSpacePage() {
  const { push, dismiss } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"builder" | "library" | "ask">("builder");
  const [indexed, setIndexed] = useState<IndexedDoc[]>([]);
  const [generated, setGenerated] = useState<GeneratedDoc[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["kind"]>("cover-letter");
  const [clientId, setClientId] = useState<number | "">("");
  const [country, setCountry] = useState("Australia");
  const [visaType, setVisaType] = useState("Work Visa");
  const [title, setTitle] = useState("Visa Application Cover Letter");
  const [body, setBody] = useState(DEMO_BODY);
  const [selected, setSelected] = useState<number[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState(0);
  const [drag, setDrag] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function loadAll() {
    const responses = await Promise.allSettled([
      fetch("/api/pdf").then((r) => r.json()),
      fetch("/api/documents").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]);
    const pdf = responses[0].status === "fulfilled" ? responses[0].value : {};
    const docs = responses[1].status === "fulfilled" ? responses[1].value : {};
    const cs = responses[2].status === "fulfilled" ? responses[2].value : {};
    setIndexed(pdf.docs ?? []); setGenerated(docs.documents ?? []); setClients(cs.clients ?? []);
    setSelected((old) => old.length ? old : (pdf.docs ?? []).map((d: IndexedDoc) => d.id));
  }
  useEffect(() => { void loadAll(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const totalChunks = indexed.reduce((sum, d) => sum + d.chunkCount, 0);
  const selectedClient = clients.find((c) => c.id === clientId);
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const previewSrc = previewId ? `/api/documents/${previewId}?format=print` : "";

  function updateTemplate(kind: (typeof TEMPLATES)[number]["kind"]) {
    setTemplate(kind);
    const item = TEMPLATES.find((t) => t.kind === kind);
    setTitle(item ? `${item.label} — ${selectedClient?.fullName ?? "Applicant"}` : "Visa Document");
    setBody(DEMO_BODY);
  }

  async function upload(file: File) {
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) { push("Only PDF files are accepted.", "error"); return; }
    if (file.size > 20 * 1024 * 1024) { push("File exceeds the 20MB limit.", "error"); return; }
    setUploading(true); setStage(0);
    const toast = push(STAGES[1], "loading");
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 900);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/pdf", { method: "POST", body: fd }); const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      push(`Indexed successfully — ${data.pages} pages · ${data.chunkCount} chunks`, "success", 4500);
      await loadAll();
    } catch (error) { push(error instanceof Error ? error.message : "Upload failed.", "error"); }
    finally { clearInterval(timer); dismiss(toast); setUploading(false); }
  }

  async function removeIndexed(id: number) {
    await fetch(`/api/pdf?id=${id}`, { method: "DELETE" });
    setIndexed((old) => old.filter((d) => d.id !== id)); setSelected((old) => old.filter((x) => x !== id)); push("Source PDF removed.", "success");
  }

  async function generate() {
    if (!clientId) { push("Select a client before generating a final document.", "error"); return; }
    try {
      const res = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: template, clientId, country, visaType }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "Could not generate document");
      setGenerated((old) => [data.document, ...old]); setPreviewId(data.document.id); setTitle(data.document.title); setBody(data.document.body); push("Professional document generated and ready to preview.", "success", 4500);
    } catch (error) { push(error instanceof Error ? error.message : "Generation failed.", "error"); }
  }

  async function saveCustom() {
    if (!clientId) { push("Select a client before saving.", "error"); return; }
    try {
      const res = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: template, clientId, country, visaType }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "Could not save");
      setGenerated((old) => [data.document, ...old]); setPreviewId(data.document.id); push("Document saved to your library.", "success");
    } catch (error) { push(error instanceof Error ? error.message : "Save failed.", "error"); }
  }

  async function ask(text?: string) {
    const q = (text ?? input).trim(); if (!q || busy) return;
    if (!selected.length) { push("Select at least one indexed PDF first.", "error"); return; }
    setMessages((old) => [...old, { role: "user", content: q }, { role: "assistant", content: "" }]); setInput(""); setBusy(true);
    const patch = (fn: (m: Msg) => Msg) => setMessages((old) => { const copy = [...old]; copy[copy.length - 1] = fn(copy[copy.length - 1]); return copy; });
    try {
      const res = await fetch("/api/pdf/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, docIds: selected }) });
      if (!res.ok || !res.body) throw new Error("Query failed");
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const parts = buffer.split("\n\n"); buffer = parts.pop() ?? ""; for (const part of parts) { if (!part.trim().startsWith("data:")) continue; const ev = JSON.parse(part.trim().slice(5)) as { type: string; text?: string; sources?: Source[] }; if (ev.type === "delta" && ev.text) patch((m) => ({ ...m, content: m.content + ev.text })); if (ev.type === "sources") patch((m) => ({ ...m, sources: ev.sources })); } }
    } catch { patch((m) => ({ ...m, content: m.content + "\n\n_Query failed. Please try again._" })); }
    finally { setBusy(false); }
  }

  return <div className="flex h-screen flex-col bg-[#fafafa]">
    <PageHeader title="PDF Space" subtitle="Visa Documents Builder Pro · create, review and export embassy-ready documents" actions={<div className="flex items-center gap-2"><Badge tone="blue">{indexed.length} source PDFs</Badge><Badge tone="purple">{generated.length} generated</Badge><button className="cx-btn cx-btn-dark" onClick={() => fileRef.current?.click()}><IconPlus width={15} height={15} /> Upload PDF</button></div>} />
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { Array.from(e.target.files ?? []).forEach((f) => void upload(f)); e.target.value = ""; }} />
    <div className="border-b border-[var(--color-line)] bg-white px-5 py-2.5"><div className="mx-auto flex max-w-[1420px] items-center gap-1"><button className={`rounded-lg px-4 py-2 text-[13px] font-medium ${tab === "builder" ? "bg-black text-white" : "text-gray-500 hover:bg-gray-100"}`} onClick={() => setTab("builder")}>Builder</button><button className={`rounded-lg px-4 py-2 text-[13px] font-medium ${tab === "library" ? "bg-black text-white" : "text-gray-500 hover:bg-gray-100"}`} onClick={() => setTab("library")}>Source Library <span className="ml-1 opacity-60">{indexed.length}</span></button><button className={`rounded-lg px-4 py-2 text-[13px] font-medium ${tab === "ask" ? "bg-black text-white" : "text-gray-500 hover:bg-gray-100"}`} onClick={() => setTab("ask")}>Ask your PDFs</button><div className="ml-auto hidden text-[11.5px] text-gray-400 md:block">Secure workspace · max 20MB per PDF · export in PDF, DOCX or print</div></div></div>
    {tab === "builder" && <div className="mx-auto grid min-h-0 w-full max-w-[1420px] flex-1 gap-5 overflow-y-auto p-5 xl:grid-cols-[300px_minmax(360px,1fr)_minmax(420px,1.1fr)]">
      <aside className="space-y-4"><section className="cx-card p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-[13px] font-semibold">1. Choose a template</h2><p className="mt-0.5 text-[11.5px] text-gray-500">Start with a professional structure</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] text-gray-500">{TEMPLATES.length} templates</span></div><div className="space-y-2">{TEMPLATES.map((item) => <button key={item.kind} onClick={() => updateTemplate(item.kind)} className={`w-full rounded-xl border p-3 text-left transition ${template === item.kind ? "border-black bg-[#f8fafc] shadow-sm" : "border-gray-200 hover:border-gray-400"}`}><div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-lg text-xs ${template === item.kind ? "bg-black text-white" : "bg-gray-100"}`}>▤</span><div><div className="text-[12.5px] font-semibold">{item.label}</div><div className="text-[11px] text-gray-500">{item.bn}</div></div></div><div className="mt-2 text-[11px] leading-relaxed text-gray-500">{item.description}</div></button>)}</div></section><section className="cx-card p-4"><h2 className="text-[13px] font-semibold">2. Applicant details</h2><p className="mt-0.5 text-[11.5px] text-gray-500">Connect a client profile for merge-ready output</p><label className="mt-3 block text-[11px] font-medium text-gray-500">CLIENT PROFILE<select value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")} className="cx-input mt-1 w-full"><option value="">Select a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></label><label className="mt-3 block text-[11px] font-medium text-gray-500">DESTINATION COUNTRY<input value={country} onChange={(e) => setCountry(e.target.value)} className="cx-input mt-1 w-full" /></label><label className="mt-3 block text-[11px] font-medium text-gray-500">VISA TYPE<input value={visaType} onChange={(e) => setVisaType(e.target.value)} className="cx-input mt-1 w-full" /></label>{selectedClient && <div className="mt-3 rounded-lg bg-gray-50 p-2.5 text-[11px] text-gray-500">Using <strong className="text-gray-800">{selectedClient.fullName}</strong>{selectedClient.passportNo ? ` · ${selectedClient.passportNo}` : ""}</div>}</section></aside>
      <section className="flex min-h-[720px] flex-col rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="text-[14px] font-semibold">Document editor</h2><p className="mt-0.5 text-[11.5px] text-gray-500">Edit content before saving or exporting</p></div><div className="flex items-center gap-2"><Badge tone="green">Autosave ready</Badge><span className="text-[11px] text-gray-400">{wordCount} words</span></div></div><div className="space-y-4 p-5"><label className="block text-[11px] font-medium tracking-wide text-gray-500">DOCUMENT TITLE<input value={title} onChange={(e) => setTitle(e.target.value)} className="cx-input mt-1.5 w-full text-[15px] font-medium" /></label><textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[535px] w-full resize-y rounded-xl border border-gray-200 bg-[#fdfdfd] p-5 font-[inherit] text-[13.5px] leading-7 text-gray-800 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-100" spellCheck /> </div><div className="mt-auto flex flex-wrap items-center gap-2 border-t border-gray-100 bg-[#fcfcfc] px-5 py-3"><button className="cx-btn cx-btn-dark" onClick={() => void generate()}>Generate final document</button><button className="cx-btn" onClick={() => void saveCustom()}>Save to library</button><button className="cx-btn" onClick={() => { setBody(DEMO_BODY); push("Editor reset to the selected template.", "success"); }}>Reset template</button></div></section>
      <section className="flex min-h-[720px] flex-col rounded-2xl border border-gray-200 bg-[#eef0f3] shadow-sm"><div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4"><div><h2 className="text-[14px] font-semibold">Live PDF preview</h2><p className="mt-0.5 text-[11.5px] text-gray-500">Review the final page before download</p></div>{previewId && <div className="flex gap-2"><a className="cx-btn px-3 py-1.5 text-[11px]" href={`/api/documents/${previewId}?format=pdf`} download>PDF</a><a className="cx-btn px-3 py-1.5 text-[11px]" href={`/api/documents/${previewId}?format=docx`} download>DOCX</a></div>}</div><div className="cx-scroll flex-1 overflow-y-auto p-5">{previewId ? <iframe title="Generated document preview" src={previewSrc} className="h-[640px] w-full rounded-lg border border-gray-200 bg-white shadow-md" /> : <div className="mx-auto min-h-[640px] max-w-[520px] rounded-sm bg-white p-10 shadow-lg"><div className="mb-8 border-b-2 border-black pb-4"><div className="text-[10px] uppercase tracking-[0.22em] text-gray-400">VisaHOBe.ai · Official document</div><h1 className="mt-3 text-[25px] font-semibold leading-tight text-gray-900">{title || "Untitled document"}</h1><div className="mt-2 text-[11px] text-gray-400">{country} · {visaType} · Draft preview</div></div><div className="whitespace-pre-wrap text-[13px] leading-7 text-gray-700">{body || "Start typing in the editor to preview your document."}</div><div className="mt-12 border-t border-gray-200 pt-3 text-[10px] text-gray-400">Prepared with VisaHOBe.ai · Review all facts before submission</div></div>}</div><div className="border-t border-gray-200 bg-white px-5 py-3 text-[11px] text-gray-400">{previewId ? "Generated preview loaded from the server" : "Draft preview · generate a final document to unlock PDF/DOCX download"}</div></section>
    </div>}
    {tab === "library" && <div className="mx-auto grid min-h-0 w-full max-w-[1200px] flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-2"><section><div className="mb-4 flex items-center justify-between"><div><h2 className="cx-display text-xl font-semibold">Source PDF library</h2><p className="text-[12.5px] text-gray-500">Upload official guides and index them for grounded answers.</p></div><Badge tone="blue">{totalChunks} chunks indexed</Badge></div><div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); Array.from(e.dataTransfer.files).forEach((f) => void upload(f)); }} onClick={() => fileRef.current?.click()} className={`mb-4 cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center ${drag ? "border-black bg-gray-100" : "border-gray-300 bg-white hover:bg-gray-50"}`}><IconPdf width={28} height={28} className="mx-auto mb-2 text-gray-400" /><p className="text-[13px] font-semibold">Drop PDF files here or browse</p><p className="mt-1 text-[11.5px] text-gray-500">PDF only · max 20MB · page-aware citations</p></div>{uploading && <div className="cx-card mb-4 p-4"><div className="flex items-center gap-2 text-[12px] font-medium"><span className="cx-spin h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-black" />{STAGES[stage]}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="cx-progress h-full bg-black" /></div></div>}<div className="space-y-2">{indexed.length ? indexed.map((d) => <div key={d.id} className="cx-card flex items-center gap-3 p-4"><button onClick={() => setSelected((old) => old.includes(d.id) ? old.filter((x) => x !== d.id) : [...old, d.id])} className={`grid h-5 w-5 place-items-center rounded border text-xs ${selected.includes(d.id) ? "border-black bg-black text-white" : "border-gray-300"}`}>{selected.includes(d.id) ? "✓" : ""}</button><IconPdf width={20} height={20} className="text-gray-400" /><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{d.filename}</div><div className="mt-1 text-[11px] text-gray-500">{d.pages} pages · {d.chunkCount} chunks · {kb(d.sizeBytes)}</div></div><Badge tone={d.status === "ready" ? "green" : "amber"}>{d.status}</Badge><button onClick={() => void removeIndexed(d.id)} className="text-gray-400 hover:text-red-600" title="Remove"><IconTrash width={15} height={15} /></button></div>) : <div className="cx-card p-8 text-center text-sm text-gray-500">No source PDFs yet. Upload an embassy guide to begin.</div>}</div></section><section><div className="mb-4"><h2 className="cx-display text-xl font-semibold">Generated documents</h2><p className="text-[12.5px] text-gray-500">Your polished visa documents in one place.</p></div><div className="space-y-2">{generated.length ? generated.map((d) => <button key={d.id} onClick={() => { setPreviewId(d.id); setTitle(d.title); setBody(d.body); setTab("builder"); }} className="cx-card flex w-full items-center gap-3 p-4 text-left transition hover:border-gray-500"><span className="grid h-9 w-9 place-items-center rounded-lg bg-gray-100 text-sm">▤</span><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">{d.title}</div><div className="mt-1 text-[11px] text-gray-500">{d.kind} · {new Date(d.createdAt).toLocaleDateString()}</div></div><span className="text-[11px] text-gray-400">Open →</span></button>) : <div className="cx-card p-8 text-center text-sm text-gray-500">Generated documents will appear here after you create one.</div>}</div></section></div>}
    {tab === "ask" && <div className="mx-auto flex min-h-0 w-full max-w-[900px] flex-1 flex-col p-5"><div className="flex-1 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">{messages.length === 0 ? <div className="flex h-full min-h-[480px] flex-col items-center justify-center text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-black text-white"><IconPdf width={25} height={25} /></div><h2 className="cx-display mt-5 text-2xl font-semibold">Ask your indexed PDFs</h2><p className="mt-2 max-w-md text-[13px] text-gray-500">Every answer is grounded in your selected source documents and cited with page numbers.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{["Summarize this document", "List every requirement", "Find deadlines and fees", "What documents are missing?"].map((q) => <button key={q} className="cx-chip" onClick={() => void ask(q)}>{q}</button>)}</div></div> : <div className="mx-auto max-w-[760px] space-y-6">{messages.map((m, i) => <div key={i}>{m.role === "user" ? <div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-br-md bg-gray-100 px-4 py-3 text-[14px]">{m.content}</div></div> : <div>{m.sources?.length ? <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11.5px]">{m.sources.map((s) => <div key={s.n} className="mb-2 last:mb-0"><strong>[{s.n}] {s.filename} · p.{s.page}</strong><div className="text-gray-500">{s.snippet}</div></div>)}</div> : null}{m.content ? <><Markdown text={m.content} /><div className="mt-2"><CopyButton text={m.content} /></div></> : <div className="cx-shimmer h-4 w-2/3 rounded" />}</div>}</div>)}<div ref={endRef} /></div>}</div><div className="mt-4 flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-3 shadow-sm"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void ask(); }} placeholder="Ask a question about the selected PDFs…" className="flex-1 bg-transparent text-[14px] outline-none" /><button onClick={() => void ask()} disabled={busy || !input.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-black text-white disabled:opacity-30">{busy ? <span className="cx-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" /> : <IconArrowUp width={16} height={16} />}</button></div></div>}
  </div>;
}
