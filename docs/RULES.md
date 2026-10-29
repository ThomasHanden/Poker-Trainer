# Rules implemented (src/engine/rules.ts)

- Integer chips; 1bb = 100 chips internally; UI shows big blinds.
- Seat order = preflop action order (UTG … BTN, SB, BB); heads-up: [BTN/SB, BB]. Preflop first to act is left of the BB (heads-up: the button); postflop the first live seat left of the button (heads-up: the BB).
- Blinds; antes per player or big-blind ante (dead money; counts toward side-pot contributions).
- Bets/raises are **“raise to”** totals. Minimum bet = 1bb (or all-in). Minimum raise-to = current bet + last full raise increment (≥ 1bb).
- **Short all-ins** (less than a full raise) do not reopen betting for players who already acted, **unless cumulative short all-ins reach a full raise** over the last full bet level (TDA Rule 47 style). After such a reopening, the min-raise increment stays the last full valid raise (TDA 47-B). Players who have not yet acted may always raise.
- Raising is disabled when every other live player is all-in. Folding is disabled when checking is free; checking is disabled when facing a bet.
- Big blind option after limps. Round ends when every live, non-all-in player has acted and matched the bet. When ≤ 1 player can still act, the board runs out.
- Side pots by contribution levels (folded players’ chips stay in the pots they contributed to). Ties split; odd chips go one at a time to winners in seat order starting left of the button. Uncalled excess is returned via a single-eligible pot.
- Pot-relative sizing: bet = fraction × pot; raise “x% pot” = call first, then raise by x% of the pot after the call: `to = currentBet + x × (pot + toCall)`.

Tested in `tests/rules.test.ts` (including 1,500 random legal hands for chip conservation and card uniqueness).
