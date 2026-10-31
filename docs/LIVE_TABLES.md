# Live tables

Play-money tables run on a Cloudflare Worker (`party/server.ts`, deployed separately from the
site with `npm run party:deploy`). Each table is one Durable Object holding the game in memory;
one `Bank` Durable Object holds everyone's daily chips. The rules of a table live in
`src/multiplayer/table.ts`, which has no Cloudflare code and is unit tested
(`tests/live-table.test.ts`, `tests/live-bots.test.ts`).

## Bots at public tables

Public tables (`public-1` … `public-4`) fill open seats with bots while at least one person is
seated, so nobody has to wait for a second player. Private tables never have bots.

| Rule | Where |
|---|---|
| Bots fill seats up to `BOT_SEATS` players (default 4 of 6), only while a person is seated. | `settleSeats()` |
| Bots are labelled **Bot** on their seat, and the lobby counts them separately (`players` = people only, `bots`). | `summary()`, `Play.tsx` |
| People come first: when a person sits down, a spare bot is marked *leaving* and stands up when the hand ends. | `settleSeats()` |
| With no open seat, a person can take a bot's seat. During a hand the bot plays its own cards out; the person waits with their buy-in set aside, and sits down between hands. | `sit()`, `settleSeats()` |
| Waiting can be cancelled (buy-in returned), and lapses after `RECONNECT_MS` offline or `RESERVE_MS` in total. | `cancelReservation()`, `tick()` |
| Bots never play a hand by themselves. When the last person leaves, the hand finishes at once and the bots stand up; the table then has no timers, so the Durable Object can go idle. | `refreshNextHand()`, `thinkMs()` |
| A busted bot is replaced by a fresh one (100 big blinds) between hands. | `finishHand()`, `addBot()` |

Change the number of seats bots fill with the `BOT_SEATS` variable in `wrangler.jsonc`
(0 turns bots off), then `npm run party:deploy`.

### Game integrity

- Bots act through `LiveTable.act()`, the same validation as people; a move the rules refuse
  becomes check or fold.
- The bot policy is the practice opponents' policy (`src/opponents/policy.ts`, styles TAG, Nit,
  Station, LAG, Overfolder). It is handed `botView()`: a deep copy of the hand with the deck, the
  result and every other player's cards removed. Deals use `crypto.getRandomValues`, with no seed
  to leak.
- A bot's move is scheduled on the table's single timer (`botAt`). Any change to the hand
  reschedules or clears it, and a repeated or late timer finds nothing due, so a move cannot
  happen twice.
- Bots think 1–3 s (plus ~2 s while the first cards are dealt), well inside the 30 s turn clock.
- Bots' chips are created for the table and never touch the bank: no cash-outs, not saved for
  refunds after a restart (`heldChips()`).
- The push/fold solver the policy uses for short stacks is precomputed into
  `src/data/pushfold.json` (`npm run gen:pushfold`) so no bot decision costs more than a few
  milliseconds of server CPU.

### Known limits

- Chips won from bots are real play chips in your bank. Leaderboards (not built yet) must decide
  whether hands with bots count; see the leaderboard section of the project plan.
- Paying chips back to the bank and saving what the table holds are separate steps. If the
  table server crashes exactly between them, a refund can be paid twice or not at all.

## Analytics events (live tables)

Sent from `src/ui/analytics.ts` (Vercel Web Analytics custom events; they only appear on Vercel
plans that include custom events). No names, cards or ids are sent.

| Event | Properties | Counted |
|---|---|---|
| Live Table Opened | table: public/private | once per table per page load |
| Seat Requested | table, seat: open seat/bot seat | once per sit-down attempt on the page |
| Seat Assigned | table, via: open seat/bot seat | when that request gets a seat (not on reload) |
| Bot Seat Replacement Completed | table, wait (bucket) | when a bot's seat is handed over |
| First Live Hand Dealt | table, wait (bucket, from asking for a seat) | once per sit-down |
| First Live Hand Completed | table | once per browser |

- **Visitors who get seated:** `Seat Assigned` ÷ `Live Table Opened` (both are per page load).
- **Time from joining to first hand:** the `wait` buckets on `First Live Hand Dealt`.
