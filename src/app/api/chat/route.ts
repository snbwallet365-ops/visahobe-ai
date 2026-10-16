import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { streamChat, SYSTEM_PROMPT, estimateTokens, type ChatMessage } from "@/lib/llm";
import { detectTask, runAgent, canvasForAnswer } from "@/lib/agent";
import { TASK_LABEL_BN, type TaskType } from "@/lib/models";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  conversationId?: number;
  message: string;
  agentMode?: boolean;
  canvasEnabled?: boolean;
  taskType?: TaskType;
  attachments?: { name: string; size: number; type: string }[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const userText = (body.message ?? "").trim();
  if (!userText) return Response.json({ error: "বার্তা প্রয়োজন" }, { status: 400 });

  const taskType: TaskType = body.taskType ?? detectTask(userText);
  const attachments = body.attachments ?? [];

  let conversationId = body.conversationId;
  if (!conversationId) {
    const [conv] = await db.insert(conversations).values({
      title: userText.slice(0, 60), language: "bn", modelUsed: "visahobe-ai",
    }).returning();
    conversationId = conv.id;
  }

  await db.insert(messages).values({
    conversationId, role: "user", content: userText, taskType, attachments,
  });

  const priorRows = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  const history: ChatMessage[] = priorRows.slice(-9, -1).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const attachmentNote = attachments.length
    ? `\n\n[সংযুক্ত ফাইল: ${attachments.map((a) => a.name).join(", ")} — এগুলো ভিসা ফাইলের অংশ হিসেবে বিবেচনা করো]`
    : "";

  const encoder = new TextEncoder();
  const convId = conversationId;
  const agentMode = Boolean(body.agentMode);
  const canvasEnabled = Boolean(body.canvasEnabled);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let full = "";
      const skills: string[] = [TASK_LABEL_BN[taskType]];

      try {
        if (agentMode) {
          const gen = runAgent(userText + attachmentNote, history, canvasEnabled);
          while (true) {
            const next = await gen.next();
            if (next.done) { full = next.value; break; }
            const ev = next.value;
            if (ev.type === "delta") full += ev.text;
            send(ev);
          }
        } else {
          send({ type: "phase", key: "think", label: "প্রশ্ন বিশ্লেষণ করা হচ্ছে", phase: "thinking", status: "running" });
          const payload: ChatMessage[] = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history,
            { role: "user", content: userText + attachmentNote },
          ];
          send({ type: "phase", key: "think", label: "প্রশ্ন বিশ্লেষণ করা হচ্ছে", phase: "thinking", status: "done" });
          send({ type: "phase", key: "write", label: `${TASK_LABEL_BN[taskType]} — উত্তর তৈরি হচ্ছে`, phase: "writing", status: "running" });

          const gen = streamChat(payload, taskType);
          while (true) {
            const next = await gen.next();
            if (next.done) break;
            full += next.value;
            send({ type: "delta", text: next.value });
          }
          send({ type: "phase", key: "write", label: `${TASK_LABEL_BN[taskType]} — উত্তর তৈরি হচ্ছে`, phase: "writing", status: "done" });

          if (canvasEnabled) {
            const canvas = await canvasForAnswer(userText, full);
            if (canvas) send({ type: "canvas", ...canvas });
          }
        }
      } catch {
        const msg = "\n\n_দুঃখিত, উত্তর তৈরিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।_";
        full += msg;
        send({ type: "delta", text: msg });
      }

      await db.insert(messages).values({
        conversationId: convId, role: "assistant", content: full, model: "visahobe-ai", taskType,
      });
      await db.update(conversations).set({
        tokenCount: estimateTokens(full) + estimateTokens(userText),
        modelUsed: agentMode ? "visahobe-ai-agent" : "visahobe-ai",
        updatedAt: new Date(),
      }).where(eq(conversations.id, convId));

      send({ type: "done", conversationId: convId, skills });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
