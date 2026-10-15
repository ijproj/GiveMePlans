/**
 * Ticketmaster Discovery API source.
 *
 * Free key: https://developer.ticketmaster.com (5,000 calls/day). Covers
 * concerts, sport, theatre, comedy and family events in the UK, Ireland,
 * US, Canada, Australia, much of Europe and more.
 */
import { encodeGeohash } from "../geohash";
import { RADIUS_MILES, type EventSource, type SourceEvent } from "./types";

const API_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

/* Just the parts of the Discovery API response we use. */
interface TmEvent {
  name: string;
  url: string;
  info?: string;
  pleaseNote?: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }[];
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  _embedded?: { venues?: { name?: string; city?: { name?: string } }[] };
}

/** Ticketmaster uses "Undefined" as a placeholder classification; drop it. */
const isRealLabel = (label?: string): label is string => !!label && label !== "Undefined";

/** Format a price like "£12.50" using the event's currency. */
function formatPrice(amount: number, currency = "GBP"): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function normalise(event: TmEvent): SourceEvent {
  const classification = event.classifications?.[0];
  const venue = event._embedded?.venues?.[0];
  const price = event.priceRanges?.[0];

  return {
    source: "Ticketmaster",
    title: event.name,
    date: event.dates?.start?.localDate ?? "",
    time: event.dates?.start?.localTime?.slice(0, 5) ?? "",
    venue: [venue?.name, venue?.city?.name].filter(Boolean).join(", "),
    url: event.url,
    category: isRealLabel(classification?.segment?.name) ? classification.segment.name : "",
    tags: [classification?.genre?.name, classification?.subGenre?.name].filter(isRealLabel),
    description: [event.info, event.pleaseNote].filter(Boolean).join(" "),
    price: price?.min != null ? `From ${formatPrice(price.min, price.currency)}` : "",
    minPrice: price?.min ?? null,
  };
}

export const ticketmaster: EventSource = {
  name: "Ticketmaster",
  isConfigured: () => !!process.env.TICKETMASTER_API_KEY,

  async search(query, location) {
    const params = new URLSearchParams({
      apikey: process.env.TICKETMASTER_API_KEY!,
      startDateTime: `${query.startDate}T00:00:00Z`,
      endDateTime: `${query.endDate}T23:59:59Z`,
      size: "100",
      sort: "date,asc",
      locale: "*",
    });

    if (location) {
      // Search a radius around the geocoded point, sized by how far the user will travel.
      params.set("geoPoint", encodeGeohash(location.lat, location.lon, 9));
      params.set("radius", String(RADIUS_MILES[query.preferences.distance]));
      params.set("unit", "miles");
    } else {
      // No coordinates: fall back to a plain city-name match.
      params.set("city", query.preferences.location.split(",")[0].trim());
    }

    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) throw new Error(`Ticketmaster returned ${res.status}`);
    const data = (await res.json()) as { _embedded?: { events?: TmEvent[] } };
    return (data._embedded?.events ?? []).map(normalise);
  },
};
