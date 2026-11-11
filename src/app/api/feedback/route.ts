import { z } from "zod";
import { enforceRateLimits, getClientIp } from "@/lib/rateLimit";

const PER_IP_LIMIT = 20; // requests per minute

const feedbackSchema = z.object({
  messageId: z.string().uuid(),
  rating: z.enum(["up", "down"]),
});

/** Ratings go to the server logs only. Nothing is stored, and the question
 * and answer aren't logged, so visitors' text stays out of the logs. */
export async function POST(req: Request) {
  const limited = enforceRateLimits([
    {
      key: `lky:feedback:${getClientIp(req)}`,
      limit: PER_IP_LIMIT,
      message: "Too many requests.",
    },
  ]);
  if (limited) return limited;

  const parsed = feedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid feedback." }, { status: 400 });
  }

  console.log("lky-archives feedback:", parsed.data);
  return Response.json({ success: true });
}
