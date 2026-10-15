/**
 * Minimal geohash encoder. Ticketmaster's Discovery API takes locations as a
 * geohash (`geoPoint`) rather than latitude/longitude.
 * See https://en.wikipedia.org/wiki/Geohash.
 */
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lon: number, precision = 9): string {
  const latRange = [-90, 90];
  const lonRange = [-180, 180];
  let hash = "";
  let bits = 0;
  let bitCount = 0;
  let useLon = true; // Geohash interleaves bits, starting with longitude.

  while (hash.length < precision) {
    const range = useLon ? lonRange : latRange;
    const value = useLon ? lon : lat;
    const mid = (range[0] + range[1]) / 2;
    bits <<= 1;
    if (value >= mid) {
      bits |= 1;
      range[0] = mid;
    } else {
      range[1] = mid;
    }
    useLon = !useLon;

    // Every 5 bits becomes one base-32 character.
    if (++bitCount === 5) {
      hash += BASE32[bits];
      bits = 0;
      bitCount = 0;
    }
  }
  return hash;
}
