/**
 * Shared types for event sources.
 *
 * Each source (Ticketmaster, Skiddle, SeatGeek, ...) fetches events from its
 * own API and normalises them into `SourceEvent`. Ranking happens later, in
 * one place, so every source is scored the same way.
 */
import type { Preferences } from "../preferences";

/** One search request: the questionnaire answers plus a date range (YYYY-MM-DD). */
export interface EventQuery {
  preferences: Preferences;
  startDate: string;
  endDate: string;
}

/** An event as returned by a source, before ranking. Unknown text fields are empty strings. */
export interface SourceEvent {
  /** Name of the site the event came from, e.g. "Ticketmaster". */
  source: string;
  title: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** 24-hour start time (HH:MM), or empty if unknown. */
  time: string;
  venue: string;
  url: string;
  /** Broad category from the source, e.g. "Music" or "Comedy". */
  category: string;
  /** Finer labels from the source, e.g. ["Rock", "Indie"]. Used for interest matching. */
  tags: string[];
  description: string;
  /** Price as text for display, e.g. "£12.50" or "Free". */
  price: string;
  /** Cheapest ticket in the local currency, if known. Used for budget matching. */
  minPrice: number | null;
}

/** A source is a function that returns events for a query. */
export interface EventSource {
  name: string;
  /** False when the source's API key isn't set, so it can be skipped. */
  isConfigured: () => boolean;
  search: (query: EventQuery, location: GeoPoint | null) => Promise<SourceEvent[]>;
}

/** A geocoded location. */
export interface GeoPoint {
  lat: number;
  lon: number;
  /** City name as resolved by the geocoder, e.g. "Manchester". */
  city: string;
  /** ISO 3166 alpha-2 country code, e.g. "GB". */
  countryCode: string;
}

/** How far the user is happy to travel, in miles, keyed by their questionnaire answer. */
export const RADIUS_MILES: Record<Preferences["distance"], number> = {
  local: 5,
  city: 15,
  region: 40,
};
