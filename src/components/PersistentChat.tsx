"use client";

import { useState } from "react";
import { IconArrowUp, IconChat, IconChevron } from "@/components/icons";

export default function PersistentChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setOpen(true);
    setMessages((old) => [...old, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, agentMode: true, canvasEnabled: false }),
      });
      if (!response.ok || !response.body) throw new Error("Chat request failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim().startsWith("data:")) continue;
          try {
            const event = JSON.parse(part.trim().slice(5)) as { type?: string; text?: string };
            if (event.type === "delta" && event.text) {
              setMessages((old) => {
                const copy = [...old];
                copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + event.text };
                return copy;
              });
            }
          } catch { /* Ignore incomplete SSE frames. */ }
        }
      }
    } catch {
      setMessages((old) => {
        const copy = [...old];
        copy[copy.length - 1] = { role: "assistant", content: "সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।" };
        return copy;
      });
    } finally { setBusy(false); }
  }

  return <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:bottom-5 sm:px-5 lg:pl-[260px]">
    <div className="pointer-events-auto w-full max-w-[760px]">
      {open && <div className="mb-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_16px_50px_-16px_rgba(0,0,0,.28)]">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><div><div className="text-[13px] font-semibold text-gray-900">VisaHOBe AI Assistant</div><div className="text-[11px] text-gray-500">Ask from any workspace section</div></div><button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900" aria-label="Collapse chat"><IconChevron /></button></div>
        <div className="max-h-[260px] space-y-3 overflow-y-auto px-4 py-3">{messages.length === 0 ? <p className="py-8 text-center text-[12.5px] text-gray-500">How can I help with your visa workflow?</p> : messages.map((message, index) => <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${message.role === "user" ? "rounded-br-md bg-black text-white" : "rounded-bl-md bg-gray-100 text-gray-800"}`}>{message.content || <span className="cx-spin inline-block h-3 w-3 rounded-full border-2 border-gray-300 border-t-gray-900" />}</div></div>)}</div>
      </div>}
      <div className="flex items-center gap-2 rounded-[22px] border border-gray-200 bg-white/95 px-3 py-2 shadow-[0_8px_28px_-12px_rgba(0,0,0,.35)] backdrop-blur-xl sm:px-4 sm:py-2.5"><button onClick={() => setOpen((old) => !old)} className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${open ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`} aria-label="Open AI chat"><IconChat width={16} height={16} /></button><input value={input} onChange={(event) => setInput(event.target.value)} onFocus={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Enter") void send(); }} placeholder="Ask VisaHOBe AI anything…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-gray-400 sm:text-[14px]" /><button onClick={() => void send()} disabled={busy || !input.trim()} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-25" aria-label="Send message"><IconArrowUp width={15} height={15} /></button></div>
    </div>
  </div>;
}
