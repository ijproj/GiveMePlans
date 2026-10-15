/**
 * The user's questionnaire answers: option lists, validation schema and a
 * helper that turns them into plain English for prompts.
 *
 * Shared by the browser (questionnaire, local storage) and the server (API
 * validation), so keep this file free of server-only imports.
 */
import { z } from "zod";

/** Preset interest chips. Users can also add their own free-text interests. */
export const INTEREST_OPTIONS = [
  "Live music",
  "Comedy",
  "Theatre",
  "Clubbing & DJs",
  "Art & exhibitions",
  "Food & drink",
  "Markets & fairs",
  "Film",
  "Sports",
  "Fitness & outdoors",
  "Tech & startups",
  "Talks & workshops",
  "Books & poetry",
  "Gaming",
  "Networking",
  "Family-friendly",
] as const;

/** Preset event sites. Users can also add their own (e.g. a favourite venue's listings page). */
export const SOURCE_OPTIONS = [
  "Eventbrite",
  "Meetup",
  "Ticketmaster",
  "Dice",
  "Resident Advisor",
  "Skiddle",
  "Fatsoma",
  "Facebook Events",
  "Time Out",
  "Local venue websites",
] as const;

/* Single- and multi-choice answers, keyed by the value we store, mapped to the label we show. */

export const TIME_OPTIONS = {
  "weekday-evenings": "Weekday evenings",
  weekends: "Weekends",
  daytime: "Daytime",
  "late-night": "Late nights",
} as const;

export const BUDGET_OPTIONS = {
  free: "Free only",
  low: "Cheap (a few quid)",
  mid: "Mid-range",
  any: "Don't mind",
} as const;

export const COMPANY_OPTIONS = {
  solo: "On my own",
  friends: "With friends",
  date: "On a date",
  family: "With family or kids",
  any: "It varies",
} as const;

export const DISTANCE_OPTIONS = {
  local: "Close to home",
  city: "Anywhere in the city",
  region: "Happy to travel",
} as const;

/** Validates answers loaded from local storage and sent to the API. */
export const PreferencesSchema = z.object({
  location: z.string().trim().min(1, "Enter a city or area"),
  interests: z.array(z.string().trim().min(1)).min(1, "Pick at least one interest").max(30),
  times: z.array(z.enum(Object.keys(TIME_OPTIONS) as [keyof typeof TIME_OPTIONS])),
  budget: z.enum(Object.keys(BUDGET_OPTIONS) as [keyof typeof BUDGET_OPTIONS]),
  company: z.enum(Object.keys(COMPANY_OPTIONS) as [keyof typeof COMPANY_OPTIONS]),
  distance: z.enum(Object.keys(DISTANCE_OPTIONS) as [keyof typeof DISTANCE_OPTIONS]),
  // Defaults to empty so answers saved before this question existed still load.
  sources: z.array(z.string().trim().min(1)).max(30).default([]),
  notes: z.string().max(500),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

/** Starting answers for a first-time visitor. */
export const EMPTY_PREFERENCES: Preferences = {
  location: "",
  interests: [],
  times: [],
  budget: "any",
  company: "any",
  distance: "city",
  sources: [],
  notes: "",
};

/** Plain-English profile used in prompts. */
export function describePreferences(p: Preferences): string {
  const lines = [
    `Location: ${p.location}`,
    `Interests: ${p.interests.join(", ")}`,
    `Preferred times: ${p.times.length ? p.times.map((t) => TIME_OPTIONS[t]).join(", ") : "any time"}`,
    `Budget: ${BUDGET_OPTIONS[p.budget]}`,
    `Usually going: ${COMPANY_OPTIONS[p.company]}`,
    `Travel: ${DISTANCE_OPTIONS[p.distance]}`,
  ];
  if (p.sources.length) lines.push(`Sites they already use and trust: ${p.sources.join(", ")}`);
  if (p.notes.trim()) lines.push(`Other notes from them: ${p.notes.trim()}`);
  return lines.join("\n");
}
