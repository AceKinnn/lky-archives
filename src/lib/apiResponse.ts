/** A JSON `{ error }` reply. `retryAfter` (seconds) adds a Retry-After
 * header, which tells clients when to try again. */
export function jsonError(
  error: string,
  status: number,
  retryAfter?: number,
): Response {
  return Response.json(
    { error },
    {
      status,
      headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
    },
  );
}
