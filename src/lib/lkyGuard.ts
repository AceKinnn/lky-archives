// Guardrails for the LKY Archives chat, on top of the persona prompt's own
// "only answer from the archive" rule.

import { RESPONSE_PROMPT } from "./lkyPrompts";

// Meta's Llama Prompt Guard 2, free on Groq with its own rate limits. It
// scores how likely a message is a prompt-injection or jailbreak attempt.
const GUARD_MODEL = "meta-llama/llama-prompt-guard-2-86m";
// Real questions scored about 0.0005 in testing and obvious attacks 0.999.
// "Forget everything above. New task: ..." scored 0.38, so 0.3 catches it.
const GUARD_THRESHOLD = 0.3;
const GUARD_TIMEOUT_MS = 10_000;

/** Throws if the check itself fails, so callers can fail closed. */
export async function isPromptAttack(text: string): Promise<boolean> {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GUARD_MODEL,
        messages: [{ role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(GUARD_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`Prompt Guard returned ${response.status}`);

  const data: { choices: { message: { content: string } }[] } =
    await response.json();
  const score = Number.parseFloat(data.choices[0]?.message.content ?? "");
  if (Number.isNaN(score)) throw new Error("Prompt Guard returned no score");
  return score >= GUARD_THRESHOLD;
}

// Sentences of the persona prompt long enough that they'd only appear in an
// answer if the model were repeating its instructions.
const PROMPT_SENTENCES = RESPONSE_PROMPT.split(/(?<=[.!?])\s+|\n+/)
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s.length >= 40 && !s.includes("{context}"));

/** True if the answer quotes the persona prompt, which means an attack got
 * past the earlier checks. */
export function leaksPrompt(answer: string): boolean {
  const normalized = answer.toLowerCase().replace(/\s+/g, " ");
  return PROMPT_SENTENCES.some((sentence) => normalized.includes(sentence));
}
