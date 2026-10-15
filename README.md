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

## Instagram (optional)

Lots of grassroots events (DIY gigs, supper clubs, pop-ups, community meetups) are only announced on Instagram. When Instagram credentials are set, searches also read public posts through Meta's official Instagram Graph API and keep the ones whose caption mentions a date in your range. Nothing is scraped: without credentials this source is simply skipped.

It reads two kinds of posts:

- **Accounts** (`INSTAGRAM_ACCOUNTS`): recent posts from public Business or Creator accounts you name, such as local collectives, venues and promoters. This is the most reliable way to catch grassroots events.
- **Hashtags** (`INSTAGRAM_HASHTAGS`): recent and top posts for each hashtag. Defaults to `<city>events` and `<city>whatson`. Instagram allows 30 different hashtags per account per rolling week, so keep the list short.

Setup (free, done once in Meta's developer dashboard):

1. Switch your Instagram account to a Business or Creator account and link it to a Facebook Page.
2. Create an app at [developers.facebook.com](https://developers.facebook.com/) with Facebook Login for Business and the Instagram Graph API.
3. Generate a long-lived token with `instagram_basic` and `pages_show_list`, and note your Instagram account ID.
4. Put `INSTAGRAM_USER_ID` and `INSTAGRAM_ACCESS_TOKEN` in `.env.local`, plus any accounts or hashtags.

Limits worth knowing: hashtag search needs Meta's Instagram Public Content Access feature, which for live use requires App Review and Business Verification; reading named accounts works on the default Standard Access while the app is only used by people with a role on it. Posts are matched on caption text, so an event whose date is only in the image won't be found.

## Stack

Next.js (App Router) + TypeScript + Tailwind. No paid APIs.
