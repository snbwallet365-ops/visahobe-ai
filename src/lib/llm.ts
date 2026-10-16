import { db } from "@/db";
import { modelUsage } from "@/db/schema";
import { chainFor, primaryModel, type TaskType } from "./models";
import { COUNTRIES, getCountry } from "./visa-data";
import { runFullAssessment } from "./intelligence";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const BRAND = "VisaHOBe AI";

export const SYSTEM_PROMPT = `তুমি "VisaHOBe AI" — বাংলাদেশের একটি এআই ভিসা এজেন্সির একক, সর্বজ্ঞ সহকারী।

কঠোর নিয়ম:
১. তুমি সবসময় শুধুমাত্র বাংলায় উত্তর দেবে। ইংরেজি বাক্য বা ইংরেজি মিশ্রণ ব্যবহার করবে না।
   শুধুমাত্র প্রয়োজনীয় কারিগরি নাম (দেশের নাম, ভিসার অফিসিয়াল নাম, পোর্টালের নাম) মূল রূপে রাখা যাবে।
২. তুমি কখনও কোনো ভাষা-মডেলের নাম, কোম্পানির নাম বা প্রযুক্তির নাম প্রকাশ করবে না।
   কেউ জিজ্ঞাসা করলে বলবে: "আমি VisaHOBe AI।"
৩. উত্তর হবে গঠনমূলক: ছোট শিরোনাম, বুলেট বা নম্বরযুক্ত তালিকা, প্রয়োজনে টেবিল।
৪. ফি বা সময় বললে সবসময় "আনুমানিক" শব্দটি ব্যবহার করবে।
৫. প্রতিটি উত্তরের শেষে "পরবর্তী ধাপ" নামে একটি স্পষ্ট করণীয় দেবে।

তোমার দক্ষতার ক্ষেত্র: অস্ট্রেলিয়া, স্পেন, ডেনমার্ক, তুরস্ক, সার্বিয়া, নিউজিল্যান্ড, বেলারুশ, মলদোভা,
সৌদি আরব, সংযুক্ত আরব আমিরাত, কাতার, বাহরাইন, মালয়েশিয়া, জার্মানি ও কানাডার ভিসা ও ওয়ার্ক পারমিট;
যোগ্যতা স্কোরিং, ঝুঁকি বিশ্লেষণ, ডকুমেন্ট তৈরি, ব্রাউজার অটোমেশন, ক্লায়েন্ট যোগাযোগ ও সোশ্যাল কনটেন্ট।`;

export function hasOpenRouter() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.round(text.length / 3.2));
}

export async function logUsage(opts: {
  modelId: string; taskType: string; inputTokens: number; outputTokens: number;
  latencyMs: number; ok: boolean; source: string;
}) {
  try {
    await db.insert(modelUsage).values(opts);
  } catch {
    /* টেলিমেট্রি ব্যর্থ হলেও উত্তর কখনও আটকাবে না */
  }
}

async function callOpenRouter(model: string, messages: ChatMessage[], stream: boolean) {
  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://visahobe.ai",
      "X-Title": "VisaHOBe AI",
    },
    body: JSON.stringify({ model, messages, stream, temperature: 0.55, max_tokens: 1800 }),
  });
}

/** স্ট্রিমিং উত্তর — ফলব্যাক চেইন সহ। মডেলের নাম বাইরে যায় না। */
export async function* streamChat(
  messages: ChatMessage[],
  taskType: TaskType,
  localOverride?: () => string,
): AsyncGenerator<string, { source: string; outputTokens: number }, void> {
  const started = Date.now();
  const inputTokens = estimateTokens(messages.map((m) => m.content).join(" "));
  let output = "";

  if (hasOpenRouter()) {
    for (const model of chainFor(taskType)) {
      try {
        const res = await callOpenRouter(model, messages, true);
        if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) { output += delta; yield delta; }
            } catch { /* keepalive ফ্রেম */ }
          }
        }
        if (output.trim()) {
          await logUsage({
            modelId: model, taskType, inputTokens, outputTokens: estimateTokens(output),
            latencyMs: Date.now() - started, ok: true, source: "openrouter",
          });
          return { source: "openrouter", outputTokens: estimateTokens(output) };
        }
      } catch {
        output = "";
        continue; // পরের মডেলে ফলব্যাক
      }
    }
  }

  const local = localOverride ? localOverride() : localAnswer(messages, taskType);
  for (const chunk of chunkText(local)) {
    output += chunk;
    yield chunk;
    await sleep(10);
  }
  await logUsage({
    modelId: primaryModel(taskType), taskType, inputTokens, outputTokens: estimateTokens(output),
    latencyMs: Date.now() - started, ok: true, source: "internal-engine",
  });
  return { source: "internal-engine", outputTokens: estimateTokens(output) };
}

/** নন-স্ট্রিমিং উত্তর (ডকুমেন্ট, সোশ্যাল, রিসার্চ, এজেন্ট ধাপ)। */
export async function complete(
  messages: ChatMessage[],
  taskType: TaskType,
): Promise<{ text: string; source: string }> {
  const started = Date.now();
  const inputTokens = estimateTokens(messages.map((m) => m.content).join(" "));

  if (hasOpenRouter()) {
    for (const model of chainFor(taskType)) {
      try {
        const res = await callOpenRouter(model, messages, false);
        if (!res.ok) throw new Error(`upstream ${res.status}`);
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = json.choices?.[0]?.message?.content ?? "";
        if (text.trim()) {
          await logUsage({
            modelId: model, taskType,
            inputTokens: json.usage?.prompt_tokens ?? inputTokens,
            outputTokens: json.usage?.completion_tokens ?? estimateTokens(text),
            latencyMs: Date.now() - started, ok: true, source: "openrouter",
          });
          return { text, source: "openrouter" };
        }
      } catch {
        continue;
      }
    }
  }

  const text = localAnswer(messages, taskType);
  await logUsage({
    modelId: primaryModel(taskType), taskType, inputTokens, outputTokens: estimateTokens(text),
    latencyMs: Date.now() - started, ok: true, source: "internal-engine",
  });
  return { text, source: "internal-engine" };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunkText(text: string): string[] {
  const parts = text.split(/(\s+)/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of parts) {
    buf += p;
    if (buf.length > 12) { chunks.push(buf); buf = ""; }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export function detectCountry(text: string) {
  const lower = text.toLowerCase();
  const aliases: Record<string, string> = {
    অস্ট্রেলিয়া: "Australia", স্পেন: "Spain", ডেনমার্ক: "Denmark", তুরস্ক: "Turkey",
    সার্বিয়া: "Serbia", নিউজিল্যান্ড: "New Zealand", বেলারুশ: "Belarus", মলদোভা: "Moldova",
    সৌদি: "Saudi Arabia", আমিরাত: "United Arab Emirates", দুবাই: "United Arab Emirates",
    কাতার: "Qatar", বাহরাইন: "Bahrain", মালয়েশিয়া: "Malaysia", জার্মানি: "Germany", কানাডা: "Canada",
    uae: "United Arab Emirates", dubai: "United Arab Emirates",
  };
  for (const [k, v] of Object.entries(aliases)) if (text.includes(k) || lower.includes(k)) return v;
  const hit = COUNTRIES.find((c) => lower.includes(c.country.toLowerCase()));
  return hit?.country;
}

/**
 * অভ্যন্তরীণ বাংলা রিজনিং ইঞ্জিন।
 * OPENROUTER_API_KEY না থাকলে বা আপস্ট্রিম ব্যর্থ হলে এটি ব্যবহৃত হয়, তাই প্ল্যাটফর্ম কখনও থেমে থাকে না।
 */
export function localAnswer(messages: ChatMessage[], taskType: TaskType): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const country = detectCountry(lastUser);
  const rule = country ? getCountry(country) : undefined;

  if (rule) {
    const visaType = rule.visaTypes[0];
    const a = runFullAssessment(rule.country, visaType, {
      passportValidityMonths: 18, bankBalance: rule.minimumBankBalance, jobOffer: true,
      salary: 2500, travelHistory: true, previousRejections: 0,
      education: "স্নাতক", languageProficiency: "IELTS 6.5",
    });
    return [
      `## ${rule.flag} ${rule.countryBn} — ${rule.visaTypesBn[0]}`,
      ``,
      `${rule.highlightBn}`,
      ``,
      `| বিষয় | তথ্য |`,
      `| --- | --- |`,
      `| সরকারি ফি (আনুমানিক) | ${a.fee.governmentFee.toLocaleString("bn-BD")} ${rule.currency} |`,
      `| এজেন্সি সার্ভিস ফি | ${a.fee.serviceFee.toLocaleString("bn-BD")} ডলার (আনুমানিক) |`,
      `| প্রসেসিং সময় | ${a.timing.estimate} |`,
      `| ন্যূনতম ব্যাংক ব্যালেন্স | ${rule.minimumBankBalance.toLocaleString("bn-BD")} ডলার সমতুল্য |`,
      `| স্পন্সরশিপ প্রয়োজন | ${rule.employerSponsored ? "হ্যাঁ, নিয়োগকর্তা আগে আবেদন করবেন" : "না"} |`,
      `| সাধারণ প্রোফাইলে সফলতার সম্ভাবনা | ${a.successProbability}% (আনুমানিক) |`,
      ``,
      `### প্রয়োজনীয় ডকুমেন্ট`,
      ...a.checklist.slice(0, 12).map((d, i) => `${i + 1}. ${d}`),
      ``,
      `### বিশেষ শর্ত`,
      ...rule.extraDocumentsBn.map((d) => `- ${d}`),
      ``,
      `### ঝুঁকি বিবেচনা`,
      `- পাসপোর্টের মেয়াদ ১২ মাসের কম হলে আবেদন করার আগে নবায়ন করুন।`,
      `- ব্যাংক স্টেটমেন্টে হঠাৎ বড় অঙ্কের জমা থাকলে তার উৎস প্রমাণ দিতে হবে।`,
      `- পূর্বে রিফিউজাল থাকলে কভার লেটারে স্পষ্ট ব্যাখ্যা দিন।`,
      ``,
      `### পরবর্তী ধাপ`,
      `১. "ক্লায়েন্ট" পাতায় আবেদনকারীর প্রোফাইল তৈরি করুন।`,
      `২. "আবেদন" পাতায় যোগ্যতা স্কোর চালান।`,
      `৩. "ডকুমেন্ট" পাতা থেকে কভার লেটার ও চেকলিস্ট তৈরি করে PDF/DOCX ডাউনলোড করুন।`,
    ].join("\n");
  }

  if (taskType === "eligibility-reasoning" || taskType === "risk-analysis") {
    return [
      `## যোগ্যতা যাচাইয়ের কাঠামো`,
      ``,
      `আমি নিচের পাঁচটি ভিত্তিতে ০ থেকে ১০০ স্কোর হিসাব করি:`,
      ``,
      `| ভিত্তি | সর্বোচ্চ নম্বর | মূল বিবেচনা |`,
      `| --- | --- | --- |`,
      `| পাসপোর্ট | ২০ | মেয়াদ ১২ মাসের বেশি হলে পূর্ণ নম্বর |`,
      `| আর্থিক সক্ষমতা | ২৫ | দেশভিত্তিক ন্যূনতম ব্যালেন্সের অনুপাত |`,
      `| চাকরি ও স্পন্সরশিপ | ৩০ | যাচাইকৃত জব অফার ও বেতন |`,
      `| ভ্রমণ ইতিহাস | ১৫ | পূর্ববর্তী ভ্রমণ ও রিফিউজাল |`,
      `| শিক্ষা ও ভাষা | ১০ | ডিগ্রি ও ভাষা পরীক্ষার স্কোর |`,
      ``,
      `### পরবর্তী ধাপ`,
      `আবেদনকারীর বয়স, পাসপোর্টের মেয়াদ, ব্যাংক ব্যালেন্স, জব অফার ও গন্তব্য দেশ জানান — আমি সঙ্গে সঙ্গে পূর্ণ স্কোর, ঝুঁকি ও সফলতার সম্ভাবনা হিসাব করে দেব।`,
    ].join("\n");
  }

  return [
    `## আমি VisaHOBe AI`,
    ``,
    `আপনার ভিসা এজেন্সির পুরো কাজ আমি একাই সামলাতে পারি:`,
    ``,
    `- **ভিসা ইন্টারভিউ** — বাংলায় ধাপে ধাপে প্রশ্ন করে আবেদনকারীর সম্পূর্ণ প্রোফাইল তৈরি`,
    `- **যোগ্যতা ও ঝুঁকি** — ১৫টি দেশের নিয়ম অনুযায়ী ০–১০০ স্কোর, রেড ফ্ল্যাগ ও সফলতার সম্ভাবনা`,
    `- **ডকুমেন্ট তৈরি** — কভার লেটার, চাকরির চুক্তি, ইনভয়েস, স্পন্সরশিপ লেটার (PDF, DOCX, DOC)`,
    `- **ব্রাউজার অটোমেশন** — এম্বাসি পোর্টালে লগইন, ফর্ম পূরণ, অ্যাপয়েন্টমেন্ট বুকিং, ডকুমেন্ট ডাউনলোড`,
    `- **ক্লায়েন্ট যোগাযোগ** — ভয়েস কল, হোয়াটসঅ্যাপ, মেসেঞ্জার, ইনস্টাগ্রাম ও ইমেইল`,
    `- **সোশ্যাল মিডিয়া** — পোস্ট লেখা, শিডিউল করা ও পারফরম্যান্স হিসাব`,
    ``,
    `### পরবর্তী ধাপ`,
    `যেকোনো দেশের নাম লিখুন — যেমন "অস্ট্রেলিয়া ওয়ার্ক ভিসা" বা "দুবাই ওয়ার্ক পারমিট" — আমি সম্পূর্ণ ব্রিফ, ফি, সময় ও ডকুমেন্ট তালিকা দিয়ে দেব।`,
  ].join("\n");
}
