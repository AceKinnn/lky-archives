// Retrieval for the LKY Archives: embed the question with Cohere, then find
// the closest passages in Supabase (see supabase/lky_documents.sql and
// scripts/ingest_lky_documents.py). Server-only - both calls use secret keys.

const EMBED_MODEL = "embed-english-v3.0"; // must match the ingest script
// Each passage is about 250 tokens, and Groq's free plan allows 8,000 tokens a
// minute across the site, so this stays small.
const MATCH_COUNT = 4;
// Relevant passages scored about 0.5-0.6 in testing, unrelated ones about
// 0.26. Below this, a passage is treated as unrelated.
const MIN_SIMILARITY = 0.35;
const TIMEOUT_MS = 15_000;

export type ArchivePassage = {
  content: string;
  source: string;
  page: number | null;
  similarity: number;
};

async function embedQuestion(question: string): Promise<number[]> {
  const response = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input_type: "search_query",
      embedding_types: ["float"],
      texts: [question],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Cohere returned ${response.status}`);

  const data: { embeddings: { float: number[][] } } = await response.json();
  return data.embeddings.float[0];
}

export async function searchArchive(
  question: string,
): Promise<ArchivePassage[]> {
  const embedding = await embedQuestion(question);
  const key = process.env.SUPABASE_SECRET_KEY ?? "";

  const response = await fetch(
    `${process.env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1/rpc/match_lky_documents`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: `[${embedding.join(",")}]`,
        match_count: MATCH_COUNT,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);

  const passages: ArchivePassage[] = await response.json();
  return passages.filter((p) => p.similarity >= MIN_SIMILARITY);
}

export function isArchiveConfigured() {
  return Boolean(
    process.env.COHERE_API_KEY &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SECRET_KEY &&
    process.env.GROQ_API_KEY,
  );
}
