/**
 * Server-side event discovery.
 *
 * Finding events is a two-step pipeline:
 *   1. `searchForEvents` lets Claude browse the web (via the web search tool)
 *      and write up the events it finds.
 *   2. `extractAndRank` turns that write-up into typed records with a match
 *      score, using structured outputs so the response always fits our schema.
 *
 * Splitting the steps keeps the search free-form (where Claude is best at
 * following links and judging relevance) while still giving the UI clean JSON.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { describePreferences, type Preferences } from "./preferences";
import { searchInstagram } from "./sources/instagram";

/** Claude model used for both steps. */
const MODEL = "claude-opus-5-5";
/** Safety cap on how many times we resume a paused web-search turn. */
const MAX_PAUSE_RESUMES = 5;

/** Shape of one event as returned to the browser. Descriptions guide Claude when filling it in. */

export const EventSchema = z.object({
  title: z.string(),
  date: z.string().describe("ISO date (YYYY-MM-DD) of the event, or of its first day"),
  time: z.string().describe("Start time as written by the source, or empty if unknown"),
  venue: z.string(),
  url: z.string().describe("Link to the event or ticket page"),
  category: z.string().describe("Short label such as Live music, Comedy, Tech meetup"),
  summary: z.string().describe("One or two sentences on what the event is"),
  price: z.string().describe("Price as written by the source, or empty if unknown"),
  matchScore: z.number().describe("0-100: how well the event fits the person"),
  matchReason: z.string().describe("One sentence on why it fits (or only partly fits)"),
});

/** Structured outputs need an object at the top level, so wrap the list. */
const ResultSchema = z.object({ events: z.array(EventSchema) });

export type DiscoveredEvent = z.infer<typeof EventSchema>;

/** Everything needed to run one search. Dates are ISO strings (YYYY-MM-DD). */
export interface EventQuery {
  preferences: Preferences;
  startDate: string;
  endDate: string;
}

/**
 * Lazily create the Anthropic client so a missing API key surfaces as a
 * friendly error on the first search rather than crashing the server at import.
 */
let anthropic: Anthropic | undefined;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set on the server. Add it to .env.local and restart.");
  }
  anthropic ??= new Anthropic();
  return anthropic;
}

/**
 * Step 1: let Claude search the web for upcoming events that fit the query.
 * Returns Claude's written findings (names, dates, venues, links).
 */
async function searchForEvents(query: EventQuery): Promise<string> {
  const client = getClient();
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        `Find real, upcoming events in or near ${query.preferences.location} between ${query.startDate} and ${query.endDate}.`,
        "Here is what the person told us about themselves:",
        describePreferences(query.preferences),
        "",
        query.preferences.sources.length
          ? `Start with the sites they already use (${query.preferences.sources.join(", ")}), then look further afield if needed.`
          : "Search event listing sites (e.g. Eventbrite, Meetup, Ticketmaster, Dice, Resident Advisor, venue and local listings sites).",
        "Aim for 10-20 events that fit their interests, with some variety. Favour events that suit their times, budget, company and travel preferences.",
        "Only include events whose date falls in the range and that you found on a real page. For each, give the name, date, start time, venue, price if shown, the URL of the page you found it on, and a short description.",
      ].join("\n"),
    },
  ];

  const tools: Anthropic.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 8 },
  ];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    tools,
    messages,
  });

  // Long web-search turns can pause; resume them by sending the paused turn back.
  for (let i = 0; response.stop_reason === "pause_turn" && i < MAX_PAUSE_RESUMES; i++) {
    messages.push({ role: "assistant", content: response.content });
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      tools,
      messages,
    });
  }

  // A refusal means the safety system declined the request; there is no usable output.
  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined this search. Try different interests or a different location.");
  }

  // Keep only Claude's prose; search result blocks are raw page data we don't need here.
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * Step 2: turn the findings into structured events, scored against the interests.
 */
async function extractAndRank(query: EventQuery, findings: string): Promise<DiscoveredEvent[]> {
  const client = getClient();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(ResultSchema) },
    messages: [
      {
        role: "user",
        content: [
          describePreferences(query.preferences),
          `Date range: ${query.startDate} to ${query.endDate}`,
          "",
          "Below are event findings from a web search. Turn each distinct event into a structured record.",
          "Drop duplicates and anything outside the date range or without a URL. Do not invent details: leave unknown fields empty.",
          "Score each event 0-100 for how well it fits this person: interests matter most, then times, budget, company and travel.",
          "",
          "<findings>",
          findings,
          "</findings>",
        ].join("\n"),
      },
    ],
  });

  // parsed_output is null if the response could not be validated against the schema.
  if (!response.parsed_output) {
    throw new Error("Couldn't read the search results. Please try again.");
  }
  return [...response.parsed_output.events].sort((a, b) => b.matchScore - a.matchScore);
}

/** Web search then ranking; empty findings skip the second call entirely. */
async function findWebEvents(query: EventQuery): Promise<DiscoveredEvent[]> {
  const findings = await searchForEvents(query);
  if (!findings.trim()) return [];
  return extractAndRank(query, findings);
}

/**
 * Find events for a query, best matches first. Throws on API or parsing failure.
 * Instagram runs alongside the web search; it returns [] when not configured,
 * and its failures are swallowed so they never break the main search.
 */
export async function findEvents(query: EventQuery): Promise<DiscoveredEvent[]> {
  const [web, instagram] = await Promise.all([
    findWebEvents(query),
    searchInstagram(query).catch((error) => {
      console.error("Instagram search failed", error);
      return [];
    }),
  ]);
  return [...web, ...instagram].sort((a, b) => b.matchScore - a.matchScore);
}
