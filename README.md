# GiveMePlans

A web app that finds events you'll actually want to go to. It opens with a short questionnaire covering where you are, what you're into, when you go out, your budget and who you go with. It then pulls upcoming events from free event APIs and ranks them by how well they fit you.

## Running it locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and add at least one free API key:
   - **Ticketmaster:** sign up at https://developer.ticketmaster.com, create an app, then copy its "Consumer Key" into `TICKETMASTER_API_KEY`.
   - **Skiddle** (UK gigs, clubs, comedy and festivals): request a key at https://www.skiddle.com/api/join.php and put it in `SKIDDLE_API_KEY`.
3. Start the dev server: `npm run dev`, then open http://localhost:3000.

Your questionnaire answers are saved in your browser, so next time you go straight to search. Use "Edit answers" to change them.

## How it works

- `src/components/Questionnaire.tsx` is the onboarding questionnaire.
- `src/app/api/events/route.ts` takes your answers and a date range.
- `src/lib/events.ts` geocodes your location with OpenStreetMap (free, no key), then asks each configured source in `src/lib/sources/` for events within your travel radius.
- `src/lib/ranking.ts` scores each event from 0 to 100 against your answers (interests, timing, budget, company and preferred sites) and writes a one-line reason.

## Stack

Next.js (App Router) + TypeScript + Tailwind. No paid APIs.
