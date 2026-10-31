# Accounts

Players sign in with Google. (Email-and-password accounts are built but switched off: see "Email
accounts" below.) Accounts are optional: lessons,
practice, puzzles and live tables all work for guests exactly as before. Signing in keeps progress
on every device.

Supabase does the sign-in work: it stores and checks passwords, sends confirmation and reset
emails, issues and refreshes sessions, and rate-limits sign-in attempts. This site never sees or
stores a password. Until the settings below are filled in, accounts are off and every sign-in
entry point is hidden.

## What is saved to an account

| Data | Where | How it is kept consistent |
|---|---|---|
| Lesson progress and quiz bests | `progress` (one document per account) | Saved only on top of the revision this browser last saw (`save_progress`); otherwise this browser's own changes are merged into the newer copy and saved again. Lessons only move forward. |
| Saved ranges, practice settings, display preferences | `progress` | Same. A range deleted on one device stays deleted. Settings changed on this device win; otherwise the account's are kept. |
| Practice hands (and so all practice statistics) | `practice_hands`, one row per hand id | Saving the same hand again never makes a second copy; a bookmark change wins only if it is newer. |
| Daily puzzle results (and so streaks) | `puzzle_runs`, one row per run id | The first result for a run id stays: replaying or importing cannot improve it. |
| Display name | `profiles` | Checked by the database: 1–24 characters, no control characters. |
| Live-table chips and the daily claim | The live-table server's bank (`party/server.ts`), keyed by an id derived from the account | Unchanged rules: one claim per UTC day, chips move only through claims, buy-ins and cash-outs. |

Kept per device on purpose: the scenario-freshness list, an unfinished puzzle, muted chat players,
the chat panel's open state and the last table name typed.

Everything is keyed by the Supabase user id, never an email or display name. Row-level security in
the database lets each signed-in user read and write only their own rows; visitors get nothing.
At live tables an account plays under `u` + part of a SHA-256 of its id, so other players never
see the account id.

## Guests who sign in

- **Progress** (hands, lessons, ranges, puzzle results, settings): after signing in, a guest who
  has progress in this browser is told exactly what it holds and asked whether to add it. Hands,
  ranges and puzzle results are matched by id, so adding twice counts nothing twice; lessons only
  move forward; the guest's settings are used only if the account has never saved any. The guest
  copy stays in the browser until the account has saved everything, and is removed after that.
  Nothing is offered while the account's own progress cannot be loaded.
- **Chips**: nothing the browser says about chips is trusted. On the account page, a signed-in
  player can move this browser's guest chips into their account. The server moves the balance it
  holds for the guest key (moved, not copied), once per account and once per guest wallet, and
  keeps the later of the two daily claims, so nobody gets a second claim that day. Chips still on a
  table when the move happens go back to the guest when they leave it.

Guests and accounts each have a daily claim, so one person could claim once as a guest and once
signed in on the same day. Because a guest wallet can be moved into an account only once, this
cannot be repeated to build up chips.

## Shared devices and sessions

- Each account's copy lives under its own keys in the browser (`…@<user id>`), apart from the
  guest's. Signing out saves what it can (up to 4 seconds), then removes that account's copy. If
  changes have not reached the account yet, the player is asked before signing out.
- If a session ends on its own (it expired or was ended elsewhere), the player sees a notice and
  the site shows guest data; the account's copy stays on the device so nothing unsaved is lost,
  and it is never shown to anyone else.
- "Sign out on all devices" ends every session for the account.
- Sessions are kept by Supabase in the browser's storage, the standard setup for a single-page site.
  The site never renders user-supplied HTML.
- Signing in or out while seated at a live table reconnects as the new identity. The old seat
  stands up when it times out and its chips return to the bank they came from, so nothing is
  duplicated.

## Setting it up

The Supabase project is **Poker-Trainer** (`uiqbxzeemhojjmpoechp`, Canada Central), in the
organisation "Milton".

### Done (2026-10-31)

- Database: both migrations in `supabase/migrations` are applied
  (`npx supabase db push --linked --project-ref uiqbxzeemhojjmpoechp`). New migrations go in that
  folder and are applied the same way; never edit one that has been applied.
- Sign-in settings are in `supabase/config.toml` and pushed with
  `npx supabase config push --project-ref uiqbxzeemhojjmpoechp` (preview with `config diff`): site
  address `https://feltschool.vercel.app`, the allowed return links (the site's `/auth/callback` and
  `/reset-password`, preview deployments, `http://localhost:5173`), email confirmation on, secure
  password change on, minimum password length 8, manual identity linking off. Google and email
  sign-ins for the same verified address join one account automatically.
- The project signs tokens with published ES256 keys, so the table server checks them itself.
- `wrangler.jsonc` and `.env.local` have the project address and publishable key (both public).

### Email accounts (switched off)

Sign-in is Google only: `[auth.email] enable_signup = false` in `supabase/config.toml`, so the
project never sends sign-up or reset emails, and the site shows only the sign-in methods Supabase
reports as switched on (`/auth/v1/settings`). To offer email and password later: set up an email
sender (Authentication → Emails → SMTP Settings), set `enable_signup = true`, run
`config push`, and the email form, password reset and password settings appear by themselves.

### Google sign-in (done)

The Google client is set up and switched on in Supabase. Google's sign-in screen currently says
"continue to uiqbxzeemhojjmpoechp.supabase.co"; it shows "Felt School" once Google has verified the
brand (Google Cloud → Google Auth Platform → Verification Center: free, a few days, and it asks you
to prove you own `feltschool.vercel.app`, usually with a tag added to the site).

## Code map

- `supabase/migrations/…_accounts.sql`: tables, row-level security, save functions.
- `src/auth/`: the Supabase client, sign-in state and actions (`AuthContext.tsx`), and the
  database calls for progress (`accountStore.ts`).
- `src/persistence/accountSync.ts`: merging and saving progress (the rules above).
- `src/ui/store.tsx`: whose data is shown, loading and saving it, guest import, sign-out.
- `src/ui/pages/Account.tsx`: sign in, sign up, reset, the callback and the account page.
- `src/multiplayer/accounts.ts` and `party/server.ts`: checking tokens and account chips on the
  live-table server.
- Tests: `tests/accounts-db.test.ts` (the migration in Postgres, with row-level security),
  `tests/account-sync.test.ts`, `tests/accounts-server.test.ts`.
