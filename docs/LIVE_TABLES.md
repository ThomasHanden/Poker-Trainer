# Live tables

Play-money tables run on a Cloudflare Worker (`party/server.ts`, deployed separately from the
site with `npm run party:deploy`). Each table is one Durable Object holding the game and its
chat in memory; one `Bank` Durable Object holds everyone's chips and daily claims. The rules live
in `src/multiplayer/` (`table.ts`, `bots.ts`, `bank.ts`, `chat.ts`), which has no Cloudflare code
and is unit tested (`tests/live-table.test.ts`, `tests/live-bots.test.ts`,
`tests/daily-chips.test.ts`, `tests/chat.test.ts`).

## Who a player is

There are no accounts yet. Each browser makes a random secret key (`playerKey()` in
`src/ui/useLiveTable.ts`, kept in localStorage); the server only ever sees a SHA-256 hash of it,
and that hash is the player: their bank, their seat, their chat messages. Everything that matters
(balances, claims, seats, who may chat) is decided on the server against that id. The limit:
a private window or cleared browser data makes a new key, which is a new player with an empty bank
and its own daily claim. Only real accounts can close that gap.

## Daily chips

| Rule | Where |
|---|---|
| Once per UTC calendar day a player can claim a random whole number of chips from 50 to 200, every amount equally likely (rejection sampling on `crypto.getRandomValues`). The server picks the amount using its own clock. | `rollDaily()`, `Bank.claim()` |
| Claiming again the same day (double click, retry, other tab or device) pays nothing and returns the first claim's amount. | `claimDaily()` |
| The read and the write happen with nothing else awaited in between, so the Durable Object's input gate makes concurrent claims (and buy-ins) atomic. | `Bank` in `party/server.ts` |
| Claimed chips go to the bank, never to a stack at a table; buy-in rules are unchanged. | `Bank.claim()` |
| Nothing is paid automatically: the old daily top-up to 1,000 is gone, and new players start at 0. | `upgrade()`, `status()` |
| Migration: existing balances are kept. Accounts whose old top-up ran on the current UTC day count as having claimed that day (shown as "already in your balance"). | `upgrade()` |

HTTP: `POST /bank` (status) and `POST /bank/claim` with the player key as a plain-text body. Both
also return `refillsAt` (= `nextClaimAt`) for pages from before claims.

**Stakes check.** The smallest claim (50 chips) covers the 0.5/1 tables' 30-chip minimum buy-in,
so the lowest stakes are always reachable. The 1/2 tables need 60 chips minimum, and a
typical 100-big-blind buy-in there is 200 chips: about 7% of claims (50–59) cannot cover even the
minimum, and most single claims cannot cover 100 big blinds. If that feels too steep, a cheaper
option is to make 1/2 a "next step" table (players build up at 0.5/1 first, as now) or to add a
lower 0.25/0.5 table, which needs the chip unit (`CHIP`) to become 4 per chip. Stakes were not
changed.

## Table chat

| Rule | Where |
|---|---|
| Each table has its own chat over the same WebSocket as the game, sent only to connections that asked for it (`chat=1`), so older pages never receive messages they do not understand. | `syncChat()`, `onConnect()` |
| Only seated people can read or send. Watchers get nothing; standing up sends `chat-closed` and stops delivery. Bots never chat. | `syncChat()`, `onChat()` |
| The sender's id and name come from their seat on the server, never from the message. | `onChat()`, `ChatRoom.post()` |
| Slurs are starred out ("f*****"); swearing is allowed (`censorChat` in `moderation.ts`, using the obscenity library's slurs plus a few more). Names with a slur are refused, for guests and accounts. | `ChatRoom.post()`, `nameProblem()` |
| No two people at a table share a name (ignoring capitals); a blank name becomes "Player 2", "Player 3"… Signed-in players sit under their account name, which the server reads from Supabase. | `LiveTable.sit()`, `fetchDisplayName()` |
| Plain text: control and direction-override characters are removed, the page renders text (never HTML). Up to 300 characters as people count them (an emoji is one), and 1,200 UTF-16 units. | `cleanChatText()` |
| 5 messages per 10 seconds per player. | `CHAT_RATE` |
| Each message carries a browser-made id (`cid`); a retry with the same id is not posted twice. The page shows *Sending…* until the server echoes it, and *Not delivered* (with Try again) after an error or 8 seconds. | `ChatRoom.post()`, `sendChat()` |
| History: the last 50 messages, none older than an hour, kept in memory (gone when the table restarts). Sitting down or reconnecting sends the whole history once, replacing what the page had, so nothing is duplicated. | `ChatRoom`, `chat-history` |
| "Ann sat down" / "Ann left the table" notices are shown apart from what people say. | `syncChat()` |
| Muting is per player and kept in this browser only. | `useMutes()` |
| A chat failure only fails that message; it never touches the game state or the timer. | `onChat()` try/catch |

## Live table screen

Live tables show what an online poker client shows and nothing that helps decide: no hand-strength
line, pot odds, effective stack, glossary pop-ups or suggested bet size. The bet box starts at the
legal minimum and the shortcuts are Min, ½ Pot, Pot and All-in (`ActionBar live`). Side pots show
once an all-in has split the pot; players who lose their connection mid-hand show *Away*. Practice
keeps all of its teaching. Shortcut keys are ignored while typing, and anywhere inside the chat
panel (`isTyping()`).

## Bots at public tables

Public tables (`public-1` … `public-4`) fill open seats with bots while at least one person is
seated, so nobody has to wait for a second player. Private tables never have bots.

| Rule | Where |
|---|---|
| Bots fill seats up to `BOT_SEATS` players (default 4 of 6), only while a person is seated. | `settleSeats()` |
| Bots are named for their seat (*Bot 3*), and the lobby counts them separately (`players` = people only, `bots`). Names starting with the word "bot" are reserved, so people cannot pass for bots. How a bot plays is never sent to browsers. | `botName()`, `cleanName()`, `summary()` |
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
- The bot policy is the practice opponents' policy (`src/opponents/policy.ts`); each bot plays one
  of its styles, which stays on the server. It is handed `botView()`: a deep copy of the hand with the deck, the
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
| Daily Chips Claimed | none | once per claim day per page load |

- **Visitors who get seated:** `Seat Assigned` ÷ `Live Table Opened` (both are per page load).
- **Time from joining to first hand:** the `wait` buckets on `First Live Hand Dealt`.
