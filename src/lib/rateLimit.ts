import { jsonError } from "./apiResponse";

type Window = { count: number; resetAt: number };

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;
// Stops a flood of distinct IPs from growing the map without bound.
const PRUNE_THRESHOLD = 10_000;

const windows = new Map<string, Window>();

/** The caller's IP. Vercel sets x-forwarded-for itself, so it can't be spoofed
 * there. */
export function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

/**
 * Fixed-window limiter. Returns the seconds to wait if `key` is over `limit`
 * within `windowMs` (a minute by default), or null if the request may proceed.
 *
 * State lives in this process's memory, so on Vercel each serverless instance
 * counts separately and resets on a cold start - this is best-effort abuse
 * protection, not an exact quota. Exact limits need a shared store (Redis).
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = MINUTE_MS,
): number | null {
  const now = Date.now();

  if (windows.size > PRUNE_THRESHOLD) {
    windows.forEach((w, k) => {
      if (w.resetAt <= now) windows.delete(k);
    });
  }

  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (current.count >= limit) {
    return Math.ceil((current.resetAt - now) / 1000);
  }
  current.count++;
  return null;
}

export type RateLimitRule = {
  key: string;
  limit: number;
  /** Defaults to a minute. */
  windowMs?: number;
  /** Shown to the visitor when this rule blocks them. */
  message: string;
};

/**
 * Applies the rules in order and returns a 429 reply for the first one that
 * blocks, or null if the request may proceed. List the narrowest rule first
 * (per IP before site-wide), so a client that's already blocked can't use up
 * the site-wide allowance.
 */
export function enforceRateLimits(rules: RateLimitRule[]): Response | null {
  for (const { key, limit, windowMs, message } of rules) {
    const retryAfter = checkRateLimit(key, limit, windowMs);
    if (retryAfter !== null) return jsonError(message, 429, retryAfter);
  }
  return null;
}
