/**
 * Instagram as an event source, through Meta's official Instagram Graph API.
 *
 * Grassroots events (supper clubs, DIY gigs, pop-ups, community meetups) are
 * often only announced as Instagram posts, so this source reads public posts
 * from two places:
 *   - Business Discovery: recent posts from named Business/Creator accounts,
 *     e.g. a list of local collectives and venues you trust.
 *   - Hashtag Search: recent and top posts for hashtags such as #londonevents.
 *
 * Posts are free text, so each caption is scanned for a date (with chrono-node)
 * and kept only if that date falls in the requested range. Hashtags in the
 * caption become tags, which ranking.ts uses to match interests.
 *
 * Requirements (all free, but set up in Meta's developer dashboard):
 *   - An Instagram Business or Creator account linked to a Facebook Page.
 *   - A Meta app using Facebook Login for Business, and a token with
 *     instagram_basic (plus the Instagram Public Content Access feature for
 *     hashtag search). Apps used only by people with a role on them run on
 *     Standard Access; serving other people's accounts needs App Review and
 *     Business Verification.
 *   - Hashtag search is capped at 30 unique hashtags per rolling 7 days per
 *     account, so keep INSTAGRAM_HASHTAGS short.
 *
 * Scraping instagram.com is against Instagram's terms, so this module only
 * ever calls the Graph API. Without credentials it simply returns nothing.
 */
import * as chrono from "chrono-node";
import type { EventQuery, EventSource, GeoPoint, SourceEvent } from "./types";

/** Graph API version; override if Meta retires this one. */
const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v23.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Posts to read per account or hashtag. The API caps pages at 50. */
const POSTS_PER_SOURCE = 50;

/** Fields requested for each post. Hashtag results never include the author's username. */
const MEDIA_FIELDS = "id,caption,permalink,timestamp";

/** The subset of an Instagram media object this module uses. */
interface InstagramPost {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  /** Only known for Business Discovery posts. */
  username?: string;
  /** Where we found the post, for the match reason (e.g. "#londonevents"). */
  foundVia: string;
}

/** Credentials and what to search, read from the environment on each call. */
interface InstagramConfig {
  userId: string;
  accessToken: string;
  accounts: string[];
  hashtags: string[];
}

/** Split a comma-separated env var into clean values, dropping any leading @ or #. */
function listFromEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().replace(/^[@#]/, ""))
    .filter(Boolean);
}

/**
 * Default hashtags when none are configured: two built from the location,
 * e.g. "Bristol" gives #bristolevents and #bristolwhatson. Kept to two so a
 * handful of different searches don't use up the 30-per-week hashtag budget.
 */
function hashtagsForLocation(location: string): string[] {
  // Hashtags can't contain spaces or punctuation; use the first part of "Hackney, London" style input.
  const place = location.split(",")[0].toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return place ? [`${place}events`, `${place}whatson`] : [];
}

/** Returns null when Instagram isn't set up, so the search can skip it quietly. */
function readConfig(location: string): InstagramConfig | null {
  const userId = process.env.INSTAGRAM_USER_ID?.trim();
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!userId || !accessToken) return null;
  const hashtags = listFromEnv(process.env.INSTAGRAM_HASHTAGS);
  return {
    userId,
    accessToken,
    accounts: listFromEnv(process.env.INSTAGRAM_ACCOUNTS),
    hashtags: hashtags.length ? hashtags : hashtagsForLocation(location),
  };
}

/** GET a Graph API path and return its JSON, turning API errors into readable ones. */
async function graphGet<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(`${GRAPH_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);

  // Cache for 15 minutes: posts change slowly and the hashtag quota is tight.
  const response = await fetch(url, { next: { revalidate: 900 } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    throw new Error(`Instagram API ${response.status} on ${path}: ${message}`);
  }
  return body as T;
}

/**
 * Hashtag name to ID lookups. IDs never change, and caching them means
 * repeated searches don't make extra lookup calls.
 */
const hashtagIds = new Map<string, string>();

/** Recent and top posts for one hashtag. */
async function fetchHashtagPosts(tag: string, config: InstagramConfig): Promise<InstagramPost[]> {
  let id = hashtagIds.get(tag);
  if (!id) {
    const search = await graphGet<{ data: { id: string }[] }>(
      "ig_hashtag_search",
      { user_id: config.userId, q: tag },
      config.accessToken,
    );
    id = search.data[0]?.id;
    if (!id) return [];
    hashtagIds.set(tag, id);
  }

  // recent_media only covers roughly the last day, so also read top_media for older, popular posts.
  const pages = await Promise.all(
    ["recent_media", "top_media"].map((edge) =>
      graphGet<{ data: Omit<InstagramPost, "foundVia">[] }>(
        `${id}/${edge}`,
        { user_id: config.userId, fields: MEDIA_FIELDS, limit: String(POSTS_PER_SOURCE) },
        config.accessToken,
      ),
    ),
  );
  return pages.flatMap((page) => page.data.map((post) => ({ ...post, foundVia: `#${tag}` })));
}

/** Recent posts from one public Business or Creator account, via Business Discovery. */
async function fetchAccountPosts(username: string, config: InstagramConfig): Promise<InstagramPost[]> {
  const result = await graphGet<{
    business_discovery?: { username: string; media?: { data: Omit<InstagramPost, "foundVia">[] } };
  }>(
    config.userId,
    { fields: `business_discovery.username(${username}){username,media.limit(${POSTS_PER_SOURCE}){${MEDIA_FIELDS}}}` },
    config.accessToken,
  );
  const account = result.business_discovery;
  return (account?.media?.data ?? []).map((post) => ({
    ...post,
    username: account?.username,
    foundVia: `@${account?.username ?? username}`,
  }));
}

/** Format a Date as YYYY-MM-DD in local time, to compare with the query's ISO dates. */
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Format hours and minutes as 24-hour HH:MM, the format SourceEvent expects. */
function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Captions often give the time apart from the date ("Sat 24 Oct ... doors 7pm"),
 * which chrono reads as two separate results; fall back to the first clock time.
 */
function findLooseTime(caption: string): string {
  const match = caption.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)\b/i);
  if (!match) return "";
  const hour = (Number(match[1]) % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  return hour < 24 ? hhmm(hour, Number(match[2] ?? 0)) : "";
}

/** Find the first date in the caption that falls in the query's range, with its time if stated. */
function findEventDate(caption: string, postedAt: Date, query: EventQuery): { date: string; time: string } | null {
  // Read relative dates ("this Friday") from when the post went up, and assume they're in the future.
  for (const result of chrono.parse(caption, postedAt, { forwardDate: true })) {
    const date = isoDate(result.start.date());
    if (date < query.startDate || date > query.endDate) continue;
    const start = result.start.date();
    const time = result.start.isCertain("hour") ? hhmm(start.getHours(), start.getMinutes()) : findLooseTime(caption);
    return { date, time };
  }
  return null;
}

/** Pull a venue from common caption patterns: "📍 The Old Fire Station" or "Venue: ...". */
function findVenue(caption: string): string {
  const match = caption.match(/(?:📍|(?:venue|location|where)\s*[:\-])\s*([^\n]+)/i);
  return match?.[1].trim().slice(0, 120) ?? "";
}

/** Pull a price for display and as a number for budget matching: "free entry", "£5", "£10 on the door". */
function findPrice(caption: string): { price: string; minPrice: number | null } {
  if (/\bfree\s+(entry|event|admission|to attend)\b|\bentry\s+is\s+free\b/i.test(caption)) {
    return { price: "Free", minPrice: 0 };
  }
  const match = caption.match(/[£$€]\s?(\d+(?:\.\d{2})?)/);
  return match ? { price: match[0].replace(/\s/g, ""), minPrice: Number(match[1]) } : { price: "", minPrice: null };
}

/** Hashtags in the caption, e.g. "#jazz #bristolevents" gives ["jazz", "bristolevents"]. */
function findHashtags(caption: string): string[] {
  return [...new Set((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase()))];
}

/** Turn a post into an event, or null if its caption doesn't mention a date in range. */
function postToEvent(post: InstagramPost, query: EventQuery): SourceEvent | null {
  if (!post.caption || !post.permalink) return null;
  const postedAt = post.timestamp ? new Date(post.timestamp) : new Date();
  const when = findEventDate(post.caption, postedAt, query);
  if (!when) return null;

  // The first non-empty line of a caption is usually the event's name.
  const firstLine = post.caption.split("\n").find((line) => line.trim())?.trim() ?? "Instagram event";

  return {
    // Plain "Instagram" so ranking can match it against the sites the user picked.
    source: "Instagram",
    title: firstLine.slice(0, 100),
    date: when.date,
    time: when.time,
    venue: findVenue(post.caption),
    url: post.permalink,
    category: "Community event",
    tags: findHashtags(post.caption),
    // Lead with where it was found, so people can tell a venue's own post from a hashtag hit.
    description: `Via ${post.foundVia}: ${post.caption.replace(/\s+/g, " ").slice(0, 400)}`,
    ...findPrice(post.caption),
  };
}

/** Event source for posts from chosen Instagram accounts and hashtags. */
export const instagram: EventSource = {
  name: "Instagram",
  isConfigured: () => Boolean(process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN),

  /**
   * A failing account or hashtag is logged and skipped so it can't sink the
   * whole source. The geocoded city, when known, gives cleaner default hashtags.
   */
  async search(query: EventQuery, location: GeoPoint | null): Promise<SourceEvent[]> {
    const config = readConfig(location?.city ?? query.preferences.location);
    if (!config) return [];

    const lookups = [
      ...config.accounts.map((name) => fetchAccountPosts(name, config)),
      ...config.hashtags.map((tag) => fetchHashtagPosts(tag, config)),
    ];
    const results = await Promise.allSettled(lookups);

    const seen = new Set<string>();
    const events: SourceEvent[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(result.reason);
        continue;
      }
      for (const post of result.value) {
        // The same post can show up under several hashtags.
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        const event = postToEvent(post, query);
        if (event) events.push(event);
      }
    }
    return events;
  },
};
