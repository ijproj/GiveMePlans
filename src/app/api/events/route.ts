/**
 * POST /api/events
 *
 * Body: { preferences, startDate, endDate }
 * Returns: { events: DiscoveredEvent[] } or { error: string }
 *
 * Validates input, runs the Claude event search and maps failures to
 * messages that are safe to show in the UI.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { findEvents } from "@/lib/events";
import { PreferencesSchema } from "@/lib/preferences";

// Web search plus ranking can take a while.
export const maxDuration = 300;

/** Request body schema; preferences are validated with the same schema the client uses. */
const RequestSchema = z.object({
  preferences: PreferencesSchema,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return NextResponse.json({ error: "The end date is before the start date" }, { status: 400 });
  }

  try {
    // Map known SDK errors to friendly messages; anything else is logged and reported generically.
    const events = await findEvents(parsed.data);
    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The server's ANTHROPIC_API_KEY is missing or invalid." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Too many searches right now. Try again in a minute." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error", error.status, error.message);
      return NextResponse.json({ error: "Event search failed. Please try again." }, { status: 502 });
    }
    console.error(error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
