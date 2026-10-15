/**
 * Skiddle API source.
 *
 * Free key: https://www.skiddle.com/api/join.php. UK-focused, strong on gigs,
 * club nights, comedy and festivals. Searches need coordinates, so this source
 * is skipped when the location can't be geocoded.
 */
import { RADIUS_MILES, type EventSource, type SourceEvent } from "./types";

const API_URL = "https://www.skiddle.com/api/v1/events/search/";

/** Skiddle's event codes mapped to readable categories. */
const EVENT_CODES: Record<string, string> = {
  FEST: "Festival",
  LIVE: "Live music",
  CLUB: "Club night",
  DATE: "Dating",
  THEATRE: "Theatre",
  COMEDY: "Comedy",
  EXHIB: "Exhibition",
  KIDS: "Family",
  BARPUB: "Bar & pub",
  LGB: "LGBTQ+",
  SPORT: "Sport",
  ARTS: "Arts",
};

/* Just the parts of Skiddle's response we use. */
interface SkiddleEvent {
  eventname: string;
  link: string;
  date?: string;
  EventCode?: string;
  description?: string;
  entryprice?: string;
  venue?: { name?: string; town?: string };
  openingtimes?: { doorsopen?: string };
  genres?: { name?: string }[];
}

/** Pull the first number out of a price string like "£12.50 + bf". */
function parsePrice(text = ""): number | null {
  if (/free/i.test(text)) return 0;
  const match = text.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalise(event: SkiddleEvent): SourceEvent {
  const price = event.entryprice?.trim() ?? "";
  return {
    source: "Skiddle",
    title: event.eventname,
    date: event.date?.slice(0, 10) ?? "",
    time: event.openingtimes?.doorsopen?.slice(0, 5) ?? "",
    venue: [event.venue?.name, event.venue?.town].filter(Boolean).join(", "),
    url: event.link,
    category: EVENT_CODES[event.EventCode ?? ""] ?? "",
    tags: (event.genres ?? []).map((g) => g.name).filter((name): name is string => !!name),
    description: event.description ?? "",
    price,
    minPrice: parsePrice(price),
  };
}

export const skiddle: EventSource = {
  name: "Skiddle",
  isConfigured: () => !!process.env.SKIDDLE_API_KEY,

  async search(query, location) {
    if (!location) return [];

    const params = new URLSearchParams({
      api_key: process.env.SKIDDLE_API_KEY!,
      latitude: String(location.lat),
      longitude: String(location.lon),
      radius: String(RADIUS_MILES[query.preferences.distance]),
      minDate: query.startDate,
      maxDate: query.endDate,
      limit: "100",
      description: "1",
    });

    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) throw new Error(`Skiddle returned ${res.status}`);
    const data = (await res.json()) as { results?: SkiddleEvent[] };
    return (data.results ?? []).map(normalise);
  },
};
