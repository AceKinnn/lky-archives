# The LKY Archives

An AI chatbot that answers questions in the voice of Lee Kuan Yew, Singapore's founding prime minister, drawing on his speeches and memoirs. Every answer comes with the passages it was based on.

The same app also runs in my portfolio at [acekinnn-portfolio.vercel.app/lky-archives](https://acekinnn-portfolio.vercel.app/lky-archives).

> Responses are AI-generated and are not Lee Kuan Yew's actual words.

## How it works

It's retrieval-augmented generation (RAG), built with Next.js:

1. **Embed the question** with Cohere's `embed-english-v3.0`.
2. **Find the closest passages** in Supabase with pgvector. Passages below a similarity cut-off are dropped, so unrelated questions get no context.
3. **Answer in character** with Groq (`openai/gpt-oss-120b` by default), using the persona prompt in `src/lib/lkyPrompts.ts`. The prompt only answers from the retrieved passages, so off-topic questions get "I'm not knowledgeable on that topic".
4. **Follow-up questions** are first rewritten into standalone ones, using the last few messages the page sends.

The first version was built in [Flowise](https://flowiseai.com). Flowise Cloud has since shut down, so this version does the same steps in its own API route. The original chatflow export is in `flowise/lky-chatflow.json`, and the prompts are copied from it unchanged.

## Protection

The chat endpoint is public, so it's protected in layers:

- **Rate limits:** 10 questions per minute and 50 per day per IP, plus 6 per minute and 300 per day site-wide. These fit Groq's free plan and Cohere's trial quota. They're counted in memory, so they're approximate on Vercel.
- **Input checks:** questions are capped at 1000 characters, and contact or ID numbers are rejected.
- **Prompt Guard:** Meta's Llama Prompt Guard 2, free on Groq, scores the question and the conversation history for prompt-injection and jailbreak attempts. If the check fails, nothing is answered.
- **Output check:** an answer that quotes the persona prompt is replaced with a refusal.

## Running it

You need Node.js 18 or newer, and free accounts with Groq, Cohere and Supabase.

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

### Setting up the passages

1. In the Supabase SQL Editor, run `supabase/lky_documents.sql` once. It creates the `lky_documents` table and the `match_lky_documents` search function.
2. Put the source `.pdf` or `.txt` files in `data/lky-sources/`. That folder is gitignored, because the texts are copyrighted.
3. Upload them. This needs Python with `pypdf`, and scikit-learn isn't needed:

   ```bash
   pip install pypdf
   python scripts/ingest_lky_documents.py --dry-run   # count passages first
   python scripts/ingest_lky_documents.py
   ```

   Rerunning it is safe: it replaces each file's passages.

## Deploying

On Vercel, add the variables from `.env.example`, including `CRON_SECRET`. Supabase pauses free projects after a stretch of inactivity, so `vercel.json` schedules a daily call to `/api/keep-alive`, which runs one small query to keep it active.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS, the Vercel AI SDK, Groq, Cohere and Supabase (pgvector).
