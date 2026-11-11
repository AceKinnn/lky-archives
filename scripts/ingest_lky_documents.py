"""Uploads the LKY Archives source documents to Supabase.

Reads every .pdf and .txt in data/lky-sources/, splits them into passages,
embeds each passage with Cohere, and replaces that file's rows in the
lky_documents table. Rerun it after adding or changing a document.

    python scripts/ingest_lky_documents.py            # upload everything
    python scripts/ingest_lky_documents.py --dry-run  # count passages only

Needs pypdf, plus COHERE_API_KEY, SUPABASE_URL and SUPABASE_SECRET_KEY in
.env.local. Run supabase/lky_documents.sql once first.
"""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data" / "lky-sources"
CHUNK_CHARS = 1000
OVERLAP_CHARS = 200
MIN_PAGE_CHARS = 80  # skips covers, photo pages and blank pages
EMBED_BATCH = 96  # Cohere's maximum texts per embed request
INSERT_BATCH = 200
EMBED_MODEL = "embed-english-v3.0"


def load_env():
    env = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if match:
            env[match[1]] = match[2].strip().strip("\"'")
    return env


def clean(text):
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # rejoin words split across lines
    return re.sub(r"\s+", " ", text).strip()


def read_pages(path):
    """Yields (page number, text). Plain text files count as one page."""
    if path.suffix.lower() == ".pdf":
        for number, page in enumerate(PdfReader(path).pages, start=1):
            yield number, clean(page.extract_text() or "")
    else:
        yield None, clean(path.read_text(encoding="utf-8"))


def split_passages(text):
    """About CHUNK_CHARS each, overlapping so no idea is cut in half."""
    words, passages, current = text.split(" "), [], []
    for word in words:
        current.append(word)
        if len(" ".join(current)) >= CHUNK_CHARS:
            passages.append(" ".join(current))
            overlap = []
            while current and len(" ".join(overlap)) < OVERLAP_CHARS:
                overlap.insert(0, current.pop())
            current = overlap
    if current and (not passages or len(" ".join(current)) > OVERLAP_CHARS):
        passages.append(" ".join(current))
    return passages


def request(url, method="GET", headers=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                text = response.read().decode()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 3:
                time.sleep(15 * (attempt + 1))  # rate limited: wait and retry
                continue
            raise SystemExit(f"{method} failed with {error.code}: {error.read().decode()[:300]}")


def embed(texts, cohere_key):
    result = request(
        "https://api.cohere.com/v2/embed",
        method="POST",
        headers={"Authorization": f"Bearer {cohere_key}", "Content-Type": "application/json"},
        body={
            "model": EMBED_MODEL,
            "input_type": "search_document",
            "embedding_types": ["float"],
            "texts": texts,
        },
    )
    return result["embeddings"]["float"]


def main():
    dry_run = "--dry-run" in sys.argv
    files = sorted(p for p in SOURCES.iterdir() if p.suffix.lower() in (".pdf", ".txt"))
    if not files:
        raise SystemExit(f"No .pdf or .txt files in {SOURCES}")

    env = {} if dry_run else load_env()
    rest = env.get("SUPABASE_URL", "").rstrip("/") + "/rest/v1/lky_documents"
    supabase = {
        "apikey": env.get("SUPABASE_SECRET_KEY", ""),
        "Authorization": f"Bearer {env.get('SUPABASE_SECRET_KEY', '')}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    for path in files:
        rows = [
            {"content": passage, "source": path.name, "page": page}
            for page, text in read_pages(path)
            if len(text) >= MIN_PAGE_CHARS
            for passage in split_passages(text)
        ]
        print(f"{path.name}: {len(rows)} passages")
        if dry_run:
            continue

        for start in range(0, len(rows), EMBED_BATCH):
            batch = rows[start : start + EMBED_BATCH]
            for row, vector in zip(batch, embed([r["content"] for r in batch], env["COHERE_API_KEY"])):
                row["embedding"] = "[" + ",".join(map(str, vector)) + "]"
            print(f"  embedded {min(start + EMBED_BATCH, len(rows))}/{len(rows)}")

        # Only replace this file's rows once every passage is embedded, so a
        # failure part way through leaves the previous upload in place.
        source = urllib.parse.quote(path.name)
        request(f"{rest}?source=eq.{source}", method="DELETE", headers=supabase)
        for start in range(0, len(rows), INSERT_BATCH):
            request(rest, method="POST", headers=supabase, body=rows[start : start + INSERT_BATCH])
        print(f"  uploaded {len(rows)} passages")


if __name__ == "__main__":
    main()
