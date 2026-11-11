// Called daily by Vercel Cron (see vercel.json). Supabase pauses free
// projects after a stretch with no activity, which would break the LKY
// Archives, so this runs one tiny query to count as activity.

export async function GET(req: Request) {
  // Vercel sends this header itself when CRON_SECRET is set. Anyone else
  // gets turned away, so this can't be used to spam the database.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  const response = await fetch(
    `${process.env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1/lky_documents?select=id&limit=1`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    },
  ).catch(() => null);

  if (!response?.ok) {
    console.error("keep-alive: Supabase query failed", response?.status);
    return Response.json({ ok: false }, { status: 502 });
  }
  return Response.json({ ok: true });
}
