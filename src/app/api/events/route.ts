/**
 * POST /api/events
 *
 * Body: { preferences, startDate, endDate }
 * Returns: { events: DiscoveredEvent[] } or { error: string }
 *
 * Validates input, searches the free event APIs and maps failures to
 * messages that are safe to show in the UI.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { findEvents, NoSourcesConfiguredError } from "@/lib/events";
import { PreferencesSchema } from "@/lib/preferences";

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
    const events = await findEvents(parsed.data);
    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof NoSourcesConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.error(error);
    return NextResponse.json({ error: "Event search failed. Please try again." }, { status: 502 });
  }
}
