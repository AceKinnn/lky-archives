import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, RetryError } from "ai";
import { z } from "zod";
import {
  isArchiveConfigured,
  searchArchive,
  type ArchivePassage,
} from "@/lib/lkyArchive";
import { jsonError } from "@/lib/apiResponse";
import { containsPersonalData } from "@/lib/guardrails";
import { isPromptAttack, leaksPrompt } from "@/lib/lkyGuard";
import { REPHRASE_PROMPT, RESPONSE_PROMPT } from "@/lib/lkyPrompts";
import type { LkySource } from "@/lib/lkyTypes";
import {
  DAY_MS,
  enforceRateLimits,
  getClientIp,
  type RateLimitRule,
} from "@/lib/rateLimit";

const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 6;
// Long earlier answers are cut, not rejected, so a long reply never breaks
// the next question. Prompt Guard also reads at most about 512 tokens.
const MAX_HISTORY_MESSAGE_LENGTH = 2000;
const EXCERPT_LENGTH = 200;

const BUSY_MESSAGE =
  "The archives are busy right now. Please try again in a minute.";

// Sized to the free plans behind this route: Groq allows about 1,000
// requests a day and 8,000 tokens a minute (2-3 questions), and Cohere's
// trial key has a monthly cap. Each question makes 1-2 Groq calls.
function rateLimitRules(ip: string): RateLimitRule[] {
  const daily =
    "The archives have answered their limit of questions for today. Please come back tomorrow.";
  return [
    {
      key: `lky:ip:${ip}:minute`,
      limit: 10,
      message: "Too many questions. Please wait a minute and try again.",
    },
    { key: `lky:ip:${ip}:day`, limit: 50, windowMs: DAY_MS, message: daily },
    { key: "lky:global:minute", limit: 6, message: BUSY_MESSAGE },
    { key: "lky:global:day", limit: 300, windowMs: DAY_MS, message: daily },
  ];
}

const OFF_LIMITS_MESSAGE =
  "I can only answer questions about Lee Kuan Yew's life, work and ideas.";

// Groq's OpenAI-compatible API. The Flowise chatflow used
// llama-3.3-70b-versatile, which Groq has since removed. Groq retires models
// without much notice, so LKY_MODEL can swap one in without a code change.
const groq = createOpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});
const MODEL = process.env.LKY_MODEL || "openai/gpt-oss-120b";
// gpt-oss reasons before it answers, and that counts toward the token limit,
// so keep the reasoning short and leave room for the reply.
const MODEL_OPTIONS = { openai: { reasoningEffort: "low" } };
// The original prompt was written for Llama, which answered in prose.
// gpt-oss defaults to Markdown, and the page shows text as-is.
const STYLE_INSTRUCTION =
  "\n\nWrite in plain prose paragraphs, as you would speak. Do not use Markdown, headings, bullet points or bold text.";
// One retry at most: on Groq's free plan, waiting out a rate limit rarely
// succeeds within a visitor's patience.
const MAX_RETRIES = 1;

/** True when Groq refused because the free plan's limit was reached. */
function isRateLimited(err: unknown): boolean {
  const error = RetryError.isInstance(err) ? err.lastError : err;
  return APICallError.isInstance(error) && error.statusCode === 429;
}

export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z
          .string()
          .max(20_000)
          .transform((s) => s.slice(0, MAX_HISTORY_MESSAGE_LENGTH)),
      }),
    )
    .max(20)
    .default([]),
});

type History = z.infer<typeof requestSchema>["history"];

/** A follow-up like "why?" can't be searched on its own, so it's rewritten
 * using the conversation first. Falls back to the original question. */
async function toStandaloneQuestion(question: string, history: History) {
  if (history.length === 0) return question;
  try {
    const chatHistory = history
      .map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
      .join("\n");
    const { text } = await generateText({
      model: groq.chat(MODEL),
      prompt: REPHRASE_PROMPT.replace("{chat_history}", chatHistory).replace(
        "{question}",
        question,
      ),
      temperature: 0,
      maxOutputTokens: 600,
      providerOptions: MODEL_OPTIONS,
      maxRetries: MAX_RETRIES,
      timeout: 15_000,
    });
    return text.trim() || question;
  } catch (err) {
    console.error("lky-archives: rephrase failed:", err);
    return question;
  }
}

/** One card per page: overlapping passages often come from the same page. */
function toSources(passages: ArchivePassage[]): LkySource[] {
  const seen = new Set<string>();
  return passages
    .filter((p) => {
      const key = `${p.source}#${p.page}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((p) => ({
      name: p.source,
      page: p.page,
      excerpt: p.content.slice(0, EXCERPT_LENGTH),
    }));
}

export async function POST(req: Request) {
  const limited = enforceRateLimits(rateLimitRules(getClientIp(req)));
  if (limited) return limited;

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      `Please enter a question of ${MAX_QUESTION_LENGTH} characters or fewer.`,
      400,
    );
  }
  const { question } = parsed.data;
  const history = parsed.data.history.slice(-MAX_HISTORY_MESSAGES);

  if (containsPersonalData(question)) {
    return jsonError("Please remove personal details from your question.", 400);
  }

  if (!isArchiveConfigured()) {
    console.error("lky-archives: Cohere, Supabase or Groq keys are missing");
    return jsonError("The archives are not configured.", 500);
  }

  // Prompt Guard reads the question and the history too, because the page
  // sends the history and someone could forge an "earlier" message. If the
  // check itself fails, nothing is answered.
  try {
    const checks = await Promise.all(
      [question, ...history.map((m) => m.content)].map(isPromptAttack),
    );
    // Answered in character, like the persona's own refusals.
    if (checks.some(Boolean)) {
      return Response.json({ answer: OFF_LIMITS_MESSAGE, sources: [] });
    }
  } catch (err) {
    if (isRateLimited(err)) {
      return jsonError(BUSY_MESSAGE, 503, 60);
    }
    console.error("lky-archives: prompt guard failed:", err);
    return jsonError("The archives are temporarily unavailable.", 502);
  }

  try {
    const passages = await searchArchive(
      await toStandaloneQuestion(question, history),
    );

    const { text } = await generateText({
      model: groq.chat(MODEL),
      // The persona prompt tells the model to say it isn't knowledgeable
      // when the context is empty, so unrelated questions stay unanswered.
      system:
        RESPONSE_PROMPT.replace(
          "{context}",
          passages.map((p) => p.content).join("\n\n"),
        ) + STYLE_INSTRUCTION,
      messages: [...history, { role: "user", content: question }],
      temperature: 0.4,
      maxOutputTokens: 1200,
      providerOptions: MODEL_OPTIONS,
      maxRetries: MAX_RETRIES,
      timeout: 40_000,
    });

    // Last line of defence: an answer that repeats the persona prompt means
    // an attack got through, so it's swapped for a refusal.
    if (leaksPrompt(text)) {
      console.warn("lky-archives: blocked an answer that quoted the prompt");
      return Response.json({ answer: OFF_LIMITS_MESSAGE, sources: [] });
    }

    return Response.json({ answer: text, sources: toSources(passages) });
  } catch (err) {
    if (isRateLimited(err)) {
      return jsonError(BUSY_MESSAGE, 503, 60);
    }
    console.error("lky-archives: answering failed:", err);
    return jsonError("The archives are temporarily unavailable.", 502);
  }
}
