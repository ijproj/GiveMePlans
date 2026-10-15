"use client";

/**
 * Onboarding questionnaire shown on first visit (and when editing answers).
 * Walks through one question per step and hands the completed answers back
 * via `onComplete`. It holds a draft copy, so cancelling discards changes.
 */

import { KeyboardEvent, useState } from "react";
import {
  BUDGET_OPTIONS,
  COMPANY_OPTIONS,
  DISTANCE_OPTIONS,
  INTEREST_OPTIONS,
  SOURCE_OPTIONS,
  TIME_OPTIONS,
  type Preferences,
} from "@/lib/preferences";

interface Props {
  /** Answers to start from: empty for new users, saved answers when editing. */
  initial: Preferences;
  onComplete: (preferences: Preferences) => void;
  /** Shown as a Cancel button on the first step; omitted for first-time users. */
  onCancel?: () => void;
}

/** Question order. Each step renders one block below. */
const STEPS = ["location", "interests", "times", "budget", "company", "sources", "notes"] as const;
type Step = (typeof STEPS)[number];

const QUESTIONS: Record<Step, { title: string; hint: string }> = {
  location: { title: "Where are you based?", hint: "A city, town or neighbourhood." },
  interests: { title: "What are you into?", hint: "Pick as many as you like, or add your own." },
  times: { title: "When do you usually go out?", hint: "Pick any that apply. Skip if it varies." },
  budget: { title: "What's your usual budget?", hint: "Per event, roughly." },
  company: { title: "Who do you usually go with, and how far will you travel?", hint: "This helps pick the right vibe." },
  sources: { title: "Where do you usually find events?", hint: "Pick any sites you use and we'll check them first. Skip if you're not sure." },
  notes: { title: "Anything else we should know?", hint: "Optional. Favourite artists, venues, accessibility needs, things you hate…" },
};

/** Toggleable pill button used for every multiple-choice answer. */
function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        selected ? "border-accent bg-accent text-white" : "border-line bg-background hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

/** Add the item if missing, remove it if present. */
function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

export default function Questionnaire({ initial, onComplete, onCancel }: Props) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [customInterest, setCustomInterest] = useState("");
  const [customSource, setCustomSource] = useState("");

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const update = (patch: Partial<Preferences>) => setPrefs((p) => ({ ...p, ...patch }));

  // Location and at least one interest are required; every other question can be skipped.
  const canContinue =
    (step === "location" && prefs.location.trim().length > 0) ||
    (step === "interests" && prefs.interests.length > 0) ||
    (step !== "location" && step !== "interests");

  /** Append a typed value to a list answer, ignoring blanks and case-insensitive duplicates. */
  function addCustom(field: "interests" | "sources", raw: string) {
    const value = raw.trim().replace(/,$/, "");
    if (value && !prefs[field].some((i) => i.toLowerCase() === value.toLowerCase())) {
      update({ [field]: [...prefs[field], value] });
    }
  }

  const addCustomInterest = () => {
    addCustom("interests", customInterest);
    setCustomInterest("");
  };

  const addCustomSource = () => {
    addCustom("sources", customSource);
    setCustomSource("");
  };

  /** Enter or comma commits the typed value as a chip. */
  const commitOnKey = (commit: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    }
  };

  /** Advance a step, or finish and return trimmed answers on the last one. */
  function next() {
    if (!canContinue) return;
    if (isLast) onComplete({ ...prefs, location: prefs.location.trim(), notes: prefs.notes.trim() });
    else setStepIndex(stepIndex + 1);
  }

  // Values the user typed themselves, shown as extra chips after the presets.
  const customInterests = prefs.interests.filter((i) => !(INTEREST_OPTIONS as readonly string[]).includes(i));
  const customSources = prefs.sources.filter((s) => !(SOURCE_OPTIONS as readonly string[]).includes(s));

  return (
    <section className="rounded-xl border border-line bg-panel p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted">
          {stepIndex + 1} of {STEPS.length}
        </span>
      </div>

      <h2 className="text-2xl font-semibold">{QUESTIONS[step].title}</h2>
      <p className="mt-1 text-muted">{QUESTIONS[step].hint}</p>

      <div className="mt-6">
        {step === "location" && (
          <input
            autoFocus
            value={prefs.location}
            onChange={(e) => update({ location: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), next())}
            placeholder="e.g. Manchester, UK"
            className="w-full rounded-lg border border-line bg-background px-3 py-2.5 text-lg"
          />
        )}

        {step === "interests" && (
          <>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  selected={prefs.interests.includes(option)}
                  onClick={() => update({ interests: toggle(prefs.interests, option) })}
                >
                  {option}
                </Chip>
              ))}
              {customInterests.map((option) => (
                <Chip key={option} selected onClick={() => update({ interests: toggle(prefs.interests, option) })}>
                  {option} ×
                </Chip>
              ))}
            </div>
            <input
              value={customInterest}
              onChange={(e) => setCustomInterest(e.target.value)}
              onKeyDown={commitOnKey(addCustomInterest)}
              onBlur={addCustomInterest}
              placeholder="Add your own, e.g. salsa, jazz, board games"
              className="mt-4 w-full rounded-lg border border-line bg-background px-3 py-2"
            />
          </>
        )}

        {step === "times" && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(TIME_OPTIONS).map(([value, label]) => (
              <Chip
                key={value}
                selected={prefs.times.includes(value as Preferences["times"][number])}
                onClick={() => update({ times: toggle(prefs.times, value as Preferences["times"][number]) })}
              >
                {label}
              </Chip>
            ))}
          </div>
        )}

        {step === "budget" && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(BUDGET_OPTIONS).map(([value, label]) => (
              <Chip
                key={value}
                selected={prefs.budget === value}
                onClick={() => update({ budget: value as Preferences["budget"] })}
              >
                {label}
              </Chip>
            ))}
          </div>
        )}

        {step === "company" && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {Object.entries(COMPANY_OPTIONS).map(([value, label]) => (
                <Chip
                  key={value}
                  selected={prefs.company === value}
                  onClick={() => update({ company: value as Preferences["company"] })}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(DISTANCE_OPTIONS).map(([value, label]) => (
                <Chip
                  key={value}
                  selected={prefs.distance === value}
                  onClick={() => update({ distance: value as Preferences["distance"] })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {step === "sources" && (
          <>
            <div className="flex flex-wrap gap-2">
              {SOURCE_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  selected={prefs.sources.includes(option)}
                  onClick={() => update({ sources: toggle(prefs.sources, option) })}
                >
                  {option}
                </Chip>
              ))}
              {customSources.map((option) => (
                <Chip key={option} selected onClick={() => update({ sources: toggle(prefs.sources, option) })}>
                  {option} ×
                </Chip>
              ))}
            </div>
            <input
              value={customSource}
              onChange={(e) => setCustomSource(e.target.value)}
              onKeyDown={commitOnKey(addCustomSource)}
              onBlur={addCustomSource}
              placeholder="Add another site or venue"
              className="mt-4 w-full rounded-lg border border-line bg-background px-3 py-2"
            />
          </>
        )}

        {step === "notes" && (
          <textarea
            autoFocus
            value={prefs.notes}
            onChange={(e) => update({ notes: e.target.value })}
            maxLength={500}
            rows={4}
            placeholder="e.g. Love small venues, not into big arenas. Step-free access please."
            className="w-full rounded-lg border border-line bg-background px-3 py-2"
          />
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <div>
          {stepIndex > 0 ? (
            <button type="button" onClick={() => setStepIndex(stepIndex - 1)} className="px-2 py-2 text-muted hover:text-foreground">
              Back
            </button>
          ) : (
            onCancel && (
              <button type="button" onClick={onCancel} className="px-2 py-2 text-muted hover:text-foreground">
                Cancel
              </button>
            )
          )}
        </div>
        <button
          type="button"
          onClick={next}
          disabled={!canContinue}
          className="rounded-lg bg-accent px-6 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {isLast ? "Show me plans" : "Next"}
        </button>
      </div>
    </section>
  );
}
