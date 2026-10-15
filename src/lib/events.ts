/**
 * Server-side event discovery using free event APIs.
 *
 * 1. Geocode the user's location (OpenStreetMap, no key).
 * 2. Ask every configured source (Ticketmaster, Skiddle, Instagram) for events in the
 *    date range, in parallel. A failing source is logged and skipped.
 * 3. Rank everything against the questionnaire answers (see ranking.ts).
 *
 * To add a source, write an `EventSource` in ./sources and add it to SOURCES.
 */
import { geocode } from "./geocode";
import { rankEvents, type DiscoveredEvent } from "./ranking";
import { instagram } from "./sources/instagram";
import { skiddle } from "./sources/skiddle";
import { ticketmaster } from "./sources/ticketmaster";
import type { EventQuery, EventSource } from "./sources/types";

export type { DiscoveredEvent } from "./ranking";
export type { EventQuery } from "./sources/types";

const SOURCES: EventSource[] = [ticketmaster, skiddle, instagram];

/** Thrown when the server has no API keys set; the message is safe to show users. */
export class NoSourcesConfiguredError extends Error {
  constructor() {
    super("No event sources are set up yet. Add TICKETMASTER_API_KEY or SKIDDLE_API_KEY to .env.local and restart.");
  }
}

/** Find events for a query, best matches first. */
export async function findEvents(query: EventQuery): Promise<DiscoveredEvent[]> {
  const sources = SOURCES.filter((s) => s.isConfigured());
  if (!sources.length) throw new NoSourcesConfiguredError();

  const location = await geocode(query.preferences.location);
  const results = await Promise.allSettled(sources.map((s) => s.search(query, location)));

  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`${sources[i].name} search failed`, r.reason);
  });
  // Only fail outright if every source failed; otherwise show what we have.
  if (results.every((r) => r.status === "rejected")) {
    throw new Error("Couldn't reach any event sites right now. Please try again.");
  }

  const events = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return rankEvents(events, query.preferences);
}
