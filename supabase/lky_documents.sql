-- LKY Archives: passages from the source documents, with their embeddings.
-- Run once in the Supabase SQL Editor. Safe to rerun.

create extension if not exists vector with schema extensions;

create table if not exists public.lky_documents (
  id bigint generated always as identity primary key,
  content text not null,
  source text not null,
  page int,
  -- Cohere embed-english-v3.0 returns 1024-dimension vectors.
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now()
);

create index if not exists lky_documents_embedding_idx
  on public.lky_documents
  using hnsw (embedding extensions.vector_cosine_ops);

-- No policies on purpose: only the server, using the secret key, can read or
-- write. The publishable key gets nothing.
alter table public.lky_documents enable row level security;

-- The passages most similar to a question's embedding.
create or replace function public.match_lky_documents(
  query_embedding extensions.vector(1024),
  match_count int default 5
)
returns table (
  id bigint,
  content text,
  source text,
  page int,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    d.id,
    d.content,
    d.source,
    d.page,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.lky_documents d
  order by d.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

revoke execute on function public.match_lky_documents(extensions.vector, int)
  from public, anon, authenticated;
grant execute on function public.match_lky_documents(extensions.vector, int)
  to service_role;
