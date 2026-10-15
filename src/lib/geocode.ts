/**
 * Turns the free-text location from the questionnaire into coordinates using
 * OpenStreetMap's Nominatim service (free, no API key).
 *
 * Nominatim's usage policy asks for an identifying User-Agent and at most one
 * request per second, so results are cached in memory for the server's lifetime.
 */
import type { GeoPoint } from "./sources/types";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const cache = new Map<string, GeoPoint | null>();

interface NominatimResult {
  lat: string;
  lon: string;
  address?: { city?: string; town?: string; village?: string; county?: string; country_code?: string };
}

/** Geocode a place name. Returns null if it can't be found or the service is unavailable. */
export async function geocode(location: string): Promise<GeoPoint | null> {
  const key = location.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: location,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
  })}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GiveMePlans/0.1 (https://github.com/ijproj/GiveMePlans)" },
    });
    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
    const [match] = (await res.json()) as NominatimResult[];

    const point: GeoPoint | null = match
      ? {
          lat: Number(match.lat),
          lon: Number(match.lon),
          // Fall back to what the user typed (before any comma) if the geocoder has no city name.
          city:
            match.address?.city ??
            match.address?.town ??
            match.address?.village ??
            location.split(",")[0].trim(),
          countryCode: (match.address?.country_code ?? "").toUpperCase(),
        }
      : null;
    cache.set(key, point);
    return point;
  } catch (error) {
    // Don't cache failures: the service may be back on the next search.
    console.error("Geocoding failed", error);
    return null;
  }
}
