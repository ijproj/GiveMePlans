"use client";

/**
 * Home page. First-time visitors see the questionnaire; once answers are
 * saved (in local storage) they see a summary, a date range and their matches.
 */

import { useEffect, useState } from "react";
import Questionnaire from "@/components/Questionnaire";
import type { DiscoveredEvent } from "@/lib/events";
import {
  BUDGET_OPTIONS,
  EMPTY_PREFERENCES,
  PreferencesSchema,
  TIME_OPTIONS,
  type Preferences,
} from "@/lib/preferences";

/** Local storage key for the saved questionnaire answers. */
const PREFS_KEY = "givemeplans:preferences";

/** Today plus `days`, as YYYY-MM-DD for date inputs. */
function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Render an ISO date like "Fri 17 Oct" in the viewer's locale, falling back to the raw string. */
function formatDate(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function Home() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [startDate, setStartDate] = useState(addDays(0));
  const [endDate, setEndDate] = useState(addDays(14));
  const [events, setEvents] = useState<DiscoveredEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Returning visitors skip the questionnaire.
  useEffect(() => {
    try {
      const saved = PreferencesSchema.safeParse(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null"));
      if (saved.success) setPreferences(saved.data);
    } catch {}
    setLoaded(true);
  }, []);

  /** Ask the API for events matching these answers and the chosen dates. */
  async function search(prefs: Preferences) {
    setLoading(true);
    setError(null);
    setEvents(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs, startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  /** Called when the questionnaire finishes: persist answers, then search straight away. */
  function saveAndSearch(prefs: Preferences) {
    setPreferences(prefs);
    setEditing(false);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
    search(prefs);
  }

  // Render nothing until local storage is read, so returning users don't see the questionnaire flash.
  if (!loaded) return null;

  const showQuestionnaire = !preferences || editing;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">GiveMePlans</h1>
        <p className="mt-2 text-muted">
          {showQuestionnaire && !preferences
            ? "A few quick questions, then we'll find events that suit you."
            : "Events picked for you from Ticketmaster and Skiddle."}
        </p>
      </header>

      {showQuestionnaire ? (
        <Questionnaire
          initial={preferences ?? EMPTY_PREFERENCES}
          onComplete={saveAndSearch}
          onCancel={preferences ? () => setEditing(false) : undefined}
        />
      ) : (
        <section className="rounded-xl border border-line bg-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm">
              <p className="font-medium">{preferences.location}</p>
              <p className="mt-1 text-muted">{preferences.interests.join(", ")}</p>
              <p className="mt-1 text-muted">
                {preferences.times.length ? preferences.times.map((t) => TIME_OPTIONS[t]).join(", ") : "Any time"}
                {" · "}
                {BUDGET_OPTIONS[preferences.budget]}
              </p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-sm text-accent hover:underline">
              Edit answers
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">To</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => search(preferences)}
            disabled={loading}
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-50"
          >
            {loading ? "Searching…" : "Find plans"}
          </button>
        </section>
      )}

      {!showQuestionnaire && loading && (
        <p className="mt-8 text-center text-muted">Searching event sites…</p>
      )}

      {!showQuestionnaire && error && (
        <p role="alert" className="mt-8 rounded-lg border border-red-400 bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}

      {!showQuestionnaire && events && events.length === 0 && (
        <p className="mt-8 text-center text-muted">No matching events found. Try a longer date range or edit your answers.</p>
      )}

      {!showQuestionnaire && events && events.length > 0 && (
        <ul className="mt-8 space-y-4">
          {events.map((event) => (
            <li key={`${event.url}-${event.date}-${event.title}`} className="rounded-xl border border-line bg-panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">{event.category}</p>
                  <h2 className="mt-1 text-lg font-semibold">
                    <a href={event.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {event.title}
                    </a>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(event.date)}
                    {event.time && ` · ${event.time}`} · {event.venue}
                    {event.price && ` · ${event.price}`}
                  </p>
                </div>
                <span
                  title="How well it matches your answers"
                  className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold"
                >
                  {Math.round(event.matchScore)}%
                </span>
              </div>
              {event.description && <p className="mt-3 line-clamp-3">{event.description}</p>}
              <p className="mt-2 text-sm text-muted">
                {event.matchReason} Via {event.source}.
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
