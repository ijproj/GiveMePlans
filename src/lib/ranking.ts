/**
 * Rule-based ranking: scores each event 0-100 against the questionnaire
 * answers and explains why. No AI involved, so it's free and predictable.
 *
 * Weights (they add up to 100):
 *   interests 55 · timing 15 · budget 15 · company 10 · preferred site 5
 * plus a small bonus for words from the user's free-text notes.
 */
import type { Preferences } from "./preferences";
import type { SourceEvent } from "./sources/types";

/** A ranked event, as sent to the browser. */
export interface DiscoveredEvent extends Omit<SourceEvent, "tags" | "minPrice"> {
  matchScore: number;
  matchReason: string;
}

/**
 * Words that signal each preset interest. Custom interests the user typed
 * are matched on their own words instead.
 */
const INTEREST_KEYWORDS: Record<string, string[]> = {
  "Live music": ["music", "concert", "gig", "live", "band", "tour", "rock", "pop", "jazz", "indie", "folk", "hip-hop", "rap", "r&b", "soul", "orchestra", "acoustic"],
  Comedy: ["comedy", "comedian", "stand-up", "stand up", "improv", "funny"],
  Theatre: ["theatre", "theater", "musical", "play", "opera", "ballet", "dance", "drama", "panto"],
  "Clubbing & DJs": ["club", "dj", "techno", "house", "drum & bass", "dnb", "rave", "electronic", "dance music", "garage"],
  "Art & exhibitions": ["art", "exhibition", "gallery", "museum", "arts", "photography", "design"],
  "Food & drink": ["food", "drink", "beer", "wine", "gin", "tasting", "brunch", "street food", "cocktail", "bar"],
  "Markets & fairs": ["market", "fair", "craft", "vintage", "flea", "makers"],
  Film: ["film", "cinema", "screening", "movie"],
  Sports: ["sport", "football", "rugby", "cricket", "boxing", "basketball", "tennis", "wrestling", "darts", "racing"],
  "Fitness & outdoors": ["run", "yoga", "fitness", "hike", "walk", "outdoor", "cycling", "climbing", "swim"],
  "Tech & startups": ["tech", "startup", "developer", "coding", "ai", "software", "hackathon", "product"],
  "Talks & workshops": ["talk", "workshop", "lecture", "class", "masterclass", "seminar", "panel"],
  "Books & poetry": ["book", "author", "poetry", "spoken word", "reading", "literary", "literature"],
  Gaming: ["gaming", "game", "esports", "board game", "video game", "retro"],
  Networking: ["networking", "meetup", "mixer", "social", "professional"],
  "Family-friendly": ["family", "kids", "children", "all ages", "family-friendly"],
};

/** Common words ignored when matching the user's notes. */
const STOPWORDS = new Set(
  "about above after again also and any are because been before being but can could did does doing down during each few for from further had has have having her here him his how into its just like love more most much not off once only other our out over own same she should some such than that the their them then there these they this those through too under until very was were what when where which while who why will with would you your really things stuff dont hate".split(" "),
);

/** Lower-cased words of 4+ letters, minus stopwords. */
function significantWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'&-]{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

/** True if `keyword` appears in `text` as a whole word or phrase. */
function mentions(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(text);
}

/**
 * How strongly the event matches one interest (0-1). A hit in the source's own
 * category or tags counts most, then the title, then the description.
 */
function interestStrength(event: SourceEvent, interest: string): number {
  const keywords = INTEREST_KEYWORDS[interest] ?? [interest.toLowerCase(), ...significantWords(interest)];
  const labels = [event.category, ...event.tags].join(" | ");
  if (keywords.some((k) => mentions(labels, k))) return 1;
  if (keywords.some((k) => mentions(event.title, k))) return 0.8;
  if (keywords.some((k) => mentions(event.description, k))) return 0.5;
  return 0;
}

/** Which of the user's preferred times this event falls into. */
function timeSlots(event: SourceEvent): Set<Preferences["times"][number]> {
  const slots = new Set<Preferences["times"][number]>();
  const day = new Date(`${event.date}T00:00:00`).getDay(); // 0 = Sunday
  const hour = event.time ? Number(event.time.slice(0, 2)) : null;
  const isWeekend = day === 0 || day === 6;

  if (isWeekend || (day === 5 && hour !== null && hour >= 17)) slots.add("weekends");
  if (!isWeekend && hour !== null && hour >= 17) slots.add("weekday-evenings");
  if (hour !== null && hour < 17) slots.add("daytime");
  if (hour !== null && (hour >= 21 || hour < 4)) slots.add("late-night");
  return slots;
}

/** Highest ticket price that still counts as within each budget. */
const BUDGET_LIMIT: Record<Preferences["budget"], number> = { free: 0, low: 15, mid: 40, any: Infinity };

/** Score one event and build its explanation. */
function scoreEvent(event: SourceEvent, prefs: Preferences, noteWords: string[]) {
  const reasons: string[] = [];

  // Interests (55): the best-matching interest counts in full, extra matches add a little.
  const strengths = prefs.interests
    .map((interest) => ({ interest, strength: interestStrength(event, interest) }))
    .filter((m) => m.strength > 0)
    .sort((a, b) => b.strength - a.strength);
  const interestScore = strengths.length
    ? Math.min(55, 50 * strengths[0].strength + 5 * (strengths.length - 1))
    : 0;
  if (strengths.length) reasons.push(`Matches ${strengths.slice(0, 2).map((m) => m.interest.toLowerCase()).join(" and ")}`);

  // Timing (15): full marks if it fits a chosen time, half if the time is unknown or none were chosen.
  let timeScore = 7.5;
  if (prefs.times.length && event.time) {
    const fits = prefs.times.find((t) => timeSlots(event).has(t));
    timeScore = fits ? 15 : 0;
    if (fits) reasons.push(fits === "weekends" ? "on a weekend" : fits === "daytime" ? "during the day" : fits === "late-night" ? "late night" : "on a weekday evening");
  } else if (!prefs.times.length) {
    timeScore = 15;
  }

  // Budget (15): full marks within budget, half if the price is unknown.
  let budgetScore = 7.5;
  if (prefs.budget === "any") budgetScore = 15;
  else if (event.minPrice !== null) {
    budgetScore = event.minPrice <= BUDGET_LIMIT[prefs.budget] ? 15 : 0;
    if (budgetScore && event.minPrice === 0) reasons.push("free");
    else if (budgetScore) reasons.push("within budget");
  }

  // Company (10): family events suit families; adult-only nights don't.
  const text = `${event.title} ${event.category} ${event.tags.join(" ")} ${event.description}`;
  const familyFriendly = /family|kids|children|all ages/i.test(text);
  const adultsOnly = /\b18\+|over 18s|adults only|club night/i.test(text);
  let companyScore = 10;
  if (prefs.company === "family") {
    companyScore = familyFriendly ? 10 : adultsOnly ? 0 : 5;
    if (familyFriendly) reasons.push("family-friendly");
  }

  // Preferred site (5).
  const siteScore = prefs.sources.some((s) => s.toLowerCase() === event.source.toLowerCase()) ? 5 : 0;

  // Notes bonus (up to 10, capped at 100 overall): words like a favourite artist or venue.
  const noteHits = noteWords.filter((w) => mentions(text, w) || mentions(event.venue, w));
  const noteScore = Math.min(10, noteHits.length * 5);
  if (noteHits.length) reasons.push("fits your notes");

  const score = Math.round(Math.min(100, interestScore + timeScore + budgetScore + companyScore + siteScore + noteScore));
  const reason = reasons.length ? capitalise(reasons.join(", ")) + "." : "Nearby and in your dates, but not an obvious match for your interests.";
  return { score, reason, matchesInterest: strengths.length > 0 };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Same event listed twice (e.g. on two sites)? Compare simplified titles on the same date. */
const dedupeKey = (e: SourceEvent) => `${e.date}|${e.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}`;

/** Maximum number of events returned to the browser. */
const MAX_RESULTS = 30;

/**
 * Rank events against the answers, best first. Events matching none of the
 * interests are only used to fill the list when there are few real matches.
 */
export function rankEvents(events: SourceEvent[], prefs: Preferences): DiscoveredEvent[] {
  const noteWords = significantWords(prefs.notes);
  const seen = new Set<string>();

  const scored = events
    .filter((e) => e.title && e.url && e.date)
    .filter((e) => {
      const key = dedupeKey(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((event) => ({ event, ...scoreEvent(event, prefs, noteWords) }))
    .sort((a, b) => b.score - a.score || a.event.date.localeCompare(b.event.date));

  const matches = scored.filter((s) => s.matchesInterest);
  const chosen = matches.length >= 5 ? matches : scored;

  return chosen.slice(0, MAX_RESULTS).map(({ event, score, reason }) => ({
    source: event.source,
    title: event.title,
    date: event.date,
    time: event.time,
    venue: event.venue,
    url: event.url,
    category: event.category || event.tags[0] || "Event",
    description: event.description,
    price: event.price,
    matchScore: score,
    matchReason: reason,
  }));
}
