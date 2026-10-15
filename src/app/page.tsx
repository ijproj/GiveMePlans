"use client";

/**
 * Home page. First-time visitors see the questionnaire; once answers are
 * saved (in local storage) they see a summary they can edit.
 */

import { useEffect, useState } from "react";
import Questionnaire from "@/components/Questionnaire";
import {
  BUDGET_OPTIONS,
  EMPTY_PREFERENCES,
  PreferencesSchema,
  TIME_OPTIONS,
  type Preferences,
} from "@/lib/preferences";

/** Local storage key for the saved questionnaire answers. */
const PREFS_KEY = "givemeplans:preferences";

export default function Home() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Returning visitors skip the questionnaire.
  useEffect(() => {
    try {
      const saved = PreferencesSchema.safeParse(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null"));
      if (saved.success) setPreferences(saved.data);
    } catch {}
    setLoaded(true);
  }, []);

  /** Called when the questionnaire finishes: persist the answers. */
  function save(prefs: Preferences) {
    setPreferences(prefs);
    setEditing(false);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
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
            : "Here's what we know about you."}
        </p>
      </header>

      {showQuestionnaire ? (
        <Questionnaire
          initial={preferences ?? EMPTY_PREFERENCES}
          onComplete={save}
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
        </section>
      )}
    </main>
  );
}
