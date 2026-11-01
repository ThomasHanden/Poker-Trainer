# Leaderboards

Three boards at `/leaderboards`: **Live Play** (chips), **Daily Five** and **Survival**. Anyone can
browse; only signed-in players are ranked. Display names are shown, never emails or account ids.

## Who writes what

| Piece | Where | Role |
|---|---|---|
| Ranked puzzle runs | `Puzzles` Durable Object, one per signed-in player (`party/server.ts`), rules in `src/puzzles/ranked.ts` | Starts runs, shows each question (starting its clock), checks and scores each answer, saves finished runs |
| Chips | `Bank` Durable Object (`party/server.ts`), rules in `src/multiplayer/bank.ts` | Bank balances, plus what each table holds for each player |
| Leaderboard data | Supabase, `supabase/migrations/20261101140000_leaderboards.sql` | `chip_standings`, `daily_results`, `survival_runs`, `survival_bests` |
| Reading | `lb_chips`, `lb_daily`, `lb_survival`, `lb_daily_days`, `lb_standing` | Callable by anyone; ranks are worked out in the database |
| Writing | `lb_sync_chips`, `lb_record_daily`, `lb_record_survival` | Only `service_role`: the table server, with the project's secret key |

Browsers never send a score, a time or a chip amount. For a ranked run they only say "show me
question k" and "I pick option n"; the server does the rest.

## Ranking rules

**Live Play: total chips.** Bank balance plus chips on live tables right now, in table units
(shown as chips, ÷2). Each chip counts once: a buy-in moves chips from the bank to the table in
one step, and standing up moves them back, so neither changes the total; winning and losing hands
does. Tables report after every change (numbered reports; a repeated report is ignored, a late
older one cannot restore old holdings); a table that restarts gives back what it held, with the
unfinished hand called off. Only players with chips above 0 are listed. Totals reach the database
within a few seconds of a change (batched, retried until stored, and an older copy never replaces
a newer one).
*Fairness note:* everyone can claim 50–200 free chips a day, and bots' chips can be won, so the
total reflects claims as well as winnings. A profit ranking was not built: the bank has never
kept a transaction history, so past profit cannot be known. There are no purchased chips and no
resets.

**Daily Five: the day's points**, scored exactly as the game always has (100 per right answer, up
to +50 for speed, combo up to ×2; `pointsFor`). Shows points and answers right out of 5.
- The challenge changes at **midnight UTC** for everyone (it used to follow each browser's local
  date; a shared board needs one date). The page shows the date and a countdown.
- One ranked try per player per challenge. Starting it creates the run on the server; reloading,
  another tab or another device continues the same run, and each question's clock keeps running
  from when it was first shown. A run not finished by midnight UTC lapses and is not ranked.
- Only finished runs (all 5 answered) are ranked. The first saved result stays.
- Past days with results can be picked on the page.

**Survival: each player's best run, by points** (same scoring; 3 lives). Shows points, answers
right out of answered, and the date. Every finished run is kept in `survival_runs`; the best per
player is in `survival_bests`, replaced only by a strictly higher score.
- **All time** and **This week**. Weeks are ISO weeks in UTC: Monday 00:00 to Sunday 24:00, keyed
  `2026-W44`. A week ranks the best run *finished* in it.
- Survival has no difficulty settings, so there are no filters.

**All boards:** equal scores share a rank (1, 2, 2, 4). The order among tied players (by an
internal id) only keeps pages steady. Speed is not a tie-break (it is already part of puzzle
points). Results from different rules are kept apart by `rules_version` (`RULES_VERSION` in
`src/puzzles/ranked.ts`: bump it whenever questions, scoring or lives change).

## Setup (once)

1. **Database:** `npx supabase db push --linked --project-ref uiqbxzeemhojjmpoechp` (applies the
   leaderboards migration).
2. **Secret key for the table server:** Supabase dashboard → Project Settings → API Keys → create
   or copy a **secret** key (`sb_secret_…`), then `npx wrangler secret put SUPABASE_SECRET_KEY` and
   paste it. Never put it in the site or in `wrangler.jsonc`. For local `npm run party:dev`, put
   `SUPABASE_SECRET_KEY=…` in `.dev.vars` (git-ignored).
3. **Deploy:** push the site (Vercel), then `npm run party:deploy`. The first deploy adds the
   `Puzzles` Durable Object (migration `v3` in `wrangler.jsonc`) and the bank sends every existing
   account's chips to the board once.

Without the secret, the game still works: ranked runs are played and kept, and the result screen
says the leaderboard could not be reached; they are saved once the secret is set (the server
retries). Chip totals queue until then. Without `VITE_PARTY_HOST` or accounts, signed-in players
play unranked as before.

## Honest limits

- The puzzles come from open generators: the daily five is the same for everyone and can be
  worked out from the date, and anyone can preview it as a guest or on a second account. Someone
  running the generators (or a bot) can answer correctly and fast. The server stops edited scores,
  replays and second tries on one account, not that. This board is not cheat-proof.
- One person with several accounts gets several entries and several daily chip claims.
- Answer times are measured on the server, so they include the network round trip (usually well
  under the 5 seconds that still earn the full speed bonus).
- Results from before this feature (kept only in browsers and in `puzzle_runs`) are not ranked,
  because the server did not see them played.

## Tests

- `tests/leaderboards-db.test.ts`: the migration in Postgres. Write access, shared ranks, paging,
  your place beyond page one, first daily result kept, personal bests, week boundaries (matching
  the server's code), version separation, chip copies by version, deleted accounts.
- `tests/leaderboards.test.ts`: run rules (timing from first show, reload, double answers, order,
  lapse at midnight, survival lives) and chip accounting (buy-in, cash-out, split pots, two tables,
  repeated and out-of-order reports, restarts).
- `tests/leaderboards-server.test.ts`: the real `Bank`, `Puzzles` and `PokerTable` code with
  in-memory storage and a fake database: a run from start to saved, ignored browser-sent scores,
  the database being down, lost replies.
- `e2e/flows.spec.ts` ("leaderboards: …"): the page on desktop and phone with test rows served by
  the test itself (nothing real is read), tabs and arrow keys, load more, a failed request and retry.
