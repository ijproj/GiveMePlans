# GiveMePlans

A web app that finds events you'll actually want to go to. It opens with a short questionnaire (where you are, what you're into, when you go out, budget, who you go with), then uses Claude with web search to find upcoming events and rank them by how well they fit you.

## Running it locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and add your Anthropic API key (get one at https://console.anthropic.com/).
3. Start the dev server: `npm run dev`, then open http://localhost:3000.

Your questionnaire answers are saved in your browser, so next time you go straight to search. Use "Edit answers" to change them.

## How it works

- `src/components/Questionnaire.tsx` is the onboarding questionnaire.
- `src/app/api/events/route.ts` takes your answers and a date range.
- `src/lib/events.ts` asks Claude to search the web for matching events, then turns the findings into structured events, each with a 0-100 match score and a one-line reason.

## Stack

Next.js (App Router) + TypeScript + Tailwind, with the Anthropic TypeScript SDK.
