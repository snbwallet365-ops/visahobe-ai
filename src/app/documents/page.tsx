"use client";

import { useEffect, useMemo, useState } from "react";
import type { Client, DocumentRow } from "@/db/schema";
import { COUNTRIES } from "@/lib/visa-data";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents";
import { Badge, CopyButton, Empty, Markdown, PageHeader, Stat } from "@/components/ui";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [country, setCountry] = useState(COUNTRIES[0].country);
  const [visaType, setVisaType] = useState(COUNTRIES[0].visaTypes[0]);
  const [kind, setKind] = useState<DocumentKind>("cover-letter");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<DocumentRow | null>(null);

  const rule = useMemo(() => COUNTRIES.find((c) => c.country === country)!, [country]);
  const kindMeta = DOCUMENT_KINDS.find((d) => d.key === kind)!;

  const load = async () => {
    const [d, c] = await Promise.all([
      fetch("/api/documents").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]);
    setDocs(d.documents ?? []);
    setClients(c.clients ?? []);
    const params = new URLSearchParams(window.location.search);
    const preset = params.get("client");
    if (preset) setClientId(Number(preset));
    else if ((c.clients ?? []).length) setClientId((p: number | "") => (p === "" ? c.clients[0].id : p));
    const pc = params.get("country");
    if (pc && COUNTRIES.some((x) => x.country === pc)) setCountry(pc);
    const pv = params.get("visa");
    if (pv) setVisaType(pv);
  };
  useEffect(() => { void load(); }, []);

  async function generate() {
    if (!clientId) return;
    setBusy(true);
    const j = await fetch("/api/documents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, clientId, country, visaType }),
    }).then((r) => r.json());
    setBusy(false);
    if (j.document) setActive(j.document);
    void load();
  }

  async function remove(id: number) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (active?.id === id) setActive(null);
    void load();
  }

  return (
    <div>
      <PageHeader
        title="ডকুমেন্ট স্টুডিও"
        subtitle="কভার লেটার, চুক্তি, ইনভয়েস ও বাংলা নির্দেশিকা — PDF, DOCX ও DOC ফরম্যাটে"
        actions={<Badge tone="blue">{docs.length.toLocaleString("bn-BD")}টি তৈরি হয়েছে</Badge>}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="টেমপ্লেট" value={DOCUMENT_KINDS.length.toLocaleString("bn-BD")} hint="PDF · DOCX · DOC" />
          <Stat label="তৈরি ডকুমেন্ট" value={docs.length.toLocaleString("bn-BD")} />
          <Stat label="সমর্থিত দেশ" value={COUNTRIES.length.toLocaleString("bn-BD")} />
        </div>

        <div className="cx-card p-5">
          <div className="mb-3 text-[14px] font-semibold">নতুন ডকুমেন্ট তৈরি করুন</div>
          <div className="grid gap-3 sm:grid-cols-5">
            <select className="cx-input" value={clientId} onChange={(e) => setClientId(Number(e.target.value))}>
              <option value="">ক্লায়েন্ট…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>
            <select className="cx-input" value={country} onChange={(e) => {
              setCountry(e.target.value);
              const r = COUNTRIES.find((x) => x.country === e.target.value)!;
              setVisaType(r.visaTypes[0]);
            }}>
              {COUNTRIES.map((c) => <option key={c.country} value={c.country}>{c.flag} {c.countryBn}</option>)}
            </select>
            <select className="cx-input" value={visaType} onChange={(e) => setVisaType(e.target.value)}>
              {rule.visaTypes.map((v, i) => <option key={v} value={v}>{rule.visaTypesBn[i]}</option>)}
            </select>
            <select className="cx-input" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
              {DOCUMENT_KINDS.map((d) => <option key={d.key} value={d.key}>{d.labelBn}</option>)}
            </select>
            <button className="cx-btn cx-btn-dark" disabled={busy || !clientId} onClick={() => void generate()}>
              {busy ? "তৈরি হচ্ছে…" : "তৈরি করুন"}
            </button>
          </div>
          <div className="mt-3 text-[12px] text-[var(--color-muted)]">
            {kindMeta.note} · {kindMeta.lang === "bn" ? "বাংলা ডকুমেন্টের জন্য DOCX বা DOC সবচেয়ে ভালো" : "দূতাবাসে জমার জন্য PDF ব্যবহার করুন"}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[330px_1fr]">
          <div className="space-y-2">
            {docs.length === 0 ? <Empty>এখনও কোনো ডকুমেন্ট তৈরি হয়নি।</Empty> : docs.map((d) => (
              <button key={d.id} onClick={() => setActive(d)}
                className={`cx-card w-full px-4 py-3 text-left transition-colors hover:bg-[var(--color-soft)] ${active?.id === d.id ? "border-[#a8c7fa] bg-[#f8faff]" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-medium">{d.title}</span>
                  <Badge tone={d.format === "docx" ? "purple" : "neutral"}>{d.format.toUpperCase()}</Badge>
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--color-muted)]">
                  {DOCUMENT_KINDS.find((k) => k.key === d.kind)?.labelBn ?? d.kind} · {new Date(d.createdAt).toLocaleString("bn-BD")}
                </div>
              </button>
            ))}
          </div>

          <div className="cx-card min-h-[420px] p-6">
            {active ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] pb-3">
                  <div className="text-[14.5px] font-semibold">{active.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <a className="cx-btn px-3 py-1 text-[12px]" href={`/api/documents/${active.id}?format=pdf`}>⬇ PDF</a>
                    <a className="cx-btn px-3 py-1 text-[12px]" href={`/api/documents/${active.id}?format=docx`}>⬇ DOCX</a>
                    <a className="cx-btn px-3 py-1 text-[12px]" href={`/api/documents/${active.id}?format=doc`}>⬇ DOC</a>
                    <a className="cx-btn px-3 py-1 text-[12px]" href={`/api/documents/${active.id}?format=print`} target="_blank" rel="noreferrer">🖨️ A4 প্রিন্ট</a>
                    <CopyButton text={active.body} />
                    <button className="cx-btn px-3 py-1 text-[12px]" onClick={() => void remove(active.id)}>মুছুন</button>
                  </div>
                </div>
                <Markdown text={active.body} />
              </>
            ) : (
              <div className="grid h-full place-items-center text-center text-[13.5px] text-[var(--color-muted)]">
                বাঁ পাশ থেকে একটি ডকুমেন্ট বেছে নিন অথবা নতুন একটি তৈরি করুন।
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
