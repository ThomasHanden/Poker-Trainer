# Analytics

Felt School counts page views and a few actions with Vercel Web Analytics (cookieless). Every
custom event goes through `src/ui/analytics.ts`. The privacy page (`src/ui/pages/Privacy.tsx`)
describes this to visitors; keep the two in step.

**Plan:** custom events only appear on Vercel plans that include them (Pro and above at the time of
writing). On other plans `track()` still runs and is simply dropped, so check the project's plan in
the Vercel dashboard before reading anything into missing events. Page views work on every plan.

**Never sent:** names, email addresses, account or player ids, cards, hands, chat, table codes,
saved-hand ids, exact times or dates. Properties are short labels, at most two per event.

## Events

| Event | Properties | Sent when | Repeats |
|---|---|---|---|
| Practice Hand Completed | mode: guided / assessment (shown as Help me / Test me), difficulty | a practice hand has been played and its review is ready (Single spots and Full hands) | every hand counts |
| Lesson Completed | via: quiz / marked | a lesson becomes completed: all quiz answers right, or “Mark as completed” | only the first time for that lesson |
| Lesson Practice Started | none | practice deals a hand after arriving from a lesson’s practice button (`?from=lesson`) | each arrival from a lesson; refreshing that page does not count again |
| Puzzle Completed | mode: daily / survival | a Daily five or Survival run is finished and saved | every run (the Daily five can only be finished once a day) |
| Review Opened | none | a saved hand’s review (`/review/…`) has been rebuilt and is on screen | each opening; not again on rerenders |
| Continue Card Used | type: concept / concept-lesson / lesson / practice / daily, place: main / more | a suggestion on the home page’s Continue card is followed | every click |
| Returned | days: 1 day / 2-7 days / 8-30 days / 31+ days | the first visit on a calendar day after this browser’s first visit | at most once per local calendar day |
| Live Table Left Before First Hand | table: public / private | someone asked for a seat on a live table, then left it (Leave, another table or another page) before being dealt a hand | once per seat request |
| Live Table Opened, Seat Requested, Seat Assigned, Bot Seat Replacement Completed, First Live Hand Dealt, First Live Hand Completed, Daily Chips Claimed | see `docs/LIVE_TABLES.md` | | |
| Sign In Started | none | “Continue with Google” is pressed | every press |
| Sign In Completed | none | back on the site signed in, after a sign-in started in this tab | once per sign-in |
| Guest Progress Imported, Guest Progress Import Failed | none | after the offer to add this browser’s guest progress to the account is accepted | every attempt |

Duplicates: events that must count once use a stable key (`trackOnce` per page load, `trackFirst`
per browser, or a ref guarding React’s double effects in development). Completion events are sent
from the code that completes the activity, never from the button that starts it.

## Coming back: what “Returned” can and cannot tell you

This browser keeps two local days in `localStorage`: its first visit (`felt-school:first-visit`)
and the last day a return was sent (`felt-school:returned-on`). Neither is ever sent. On a later
calendar day the first visit sends one `Returned` event with only the bucket of days since the
first visit. If storage is blocked (some private windows) nothing is remembered and nothing is sent.

Because no identifier is sent, events cannot be joined up per person or per browser. So:

- `Returned` counts **return visits by browsers**, per day and bucket. One person on two devices
  counts twice; clearing site data makes a browser look new; Safari may clear storage after about a
  week without a visit, which hides some returns.
- It is **not** a D1/D7 retention rate: there is no cohort to divide by (first visits are not sent),
  and returns cannot be tied to whether that browser ever finished a hand.
- Read trends, not rates: for example, whether `Returned` (2-7 days) per day rises after a change,
  alongside `Practice Hand Completed`, `Lesson Completed` and `Puzzle Completed` per day.

## Activated and returning players (definitions for later)

- **Activated:** in a first visit, finished at least one of: a practice hand (and saw its review),
  a lesson quiz, a Daily five, or a live hand.
- **Returning:** activated, and did one of those again on a later calendar day.

The events above cannot measure these per player. For signed-in players they can be worked out
from their own saved progress in Supabase (hand and puzzle timestamps, lesson completion), with
aggregate queries only; guests’ progress never leaves their browser. Nothing in the app computes
or shows these numbers yet.
