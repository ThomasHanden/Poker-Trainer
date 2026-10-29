// Independent Chip Model (Malmuth–Harville).
// P(player i finishes first) = stack_i / total; subsequent places are computed recursively by
// removing the finished player. This is a model, not ground truth: it ignores skill, position,
// blind pressure and future play. Exact under the model for up to ~12 players (2^n states).

export function icmEquities(stacks: number[], payouts: number[]): number[] {
  const n = stacks.length;
  if (n > 12) throw new Error('ICM calculation supports at most 12 players');
  const pay = payouts.slice(0, n);
  const memo = new Map<number, number[]>();
  // returns for the set of remaining players (bitmask) the expected payout of each player
  // given that `placed` players have already taken the top places.
  const solve = (mask: number, place: number): number[] => {
    const key = mask * 16 + place;
    const cached = memo.get(key);
    if (cached) return cached;
    const res = new Array(n).fill(0);
    if (place >= pay.length || mask === 0) {
      memo.set(key, res);
      return res;
    }
    let total = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) total += stacks[i];
    if (total <= 0) {
      memo.set(key, res);
      return res;
    }
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i)) || stacks[i] <= 0) continue;
      const p = stacks[i] / total;
      res[i] += p * pay[place];
      const sub = solve(mask & ~(1 << i), place + 1);
      for (let j = 0; j < n; j++) res[j] += p * sub[j];
    }
    memo.set(key, res);
    return res;
  };
  // Players with zero chips are already out: they take the bottom paid places only if fewer
  // live players than places; we treat them as finishing last (no payout beyond what remains).
  const liveMask = stacks.reduce((m, s, i) => (s > 0 ? m | (1 << i) : m), 0);
  return solve(liveMask, 0);
}

/**
 * ICM evaluation of an all-in confrontation between two players.
 * Returns hero's $EV for: folding (stacks as given in `foldStacks`), and for calling/shoving
 * (win/lose stack outcomes weighted by equity and fold probability).
 */
export interface IcmSpot {
  stacksIfFold: number[];
  stacksIfWin: number[];
  stacksIfLose: number[];
  stacksIfTheyFold?: number[]; // for shove decisions: villain folds
  payouts: number[];
  hero: number;
}

export function icmEV(spot: IcmSpot, equity: number, foldProb = 0) {
  const eFold = icmEquities(spot.stacksIfFold, spot.payouts)[spot.hero];
  const eWin = icmEquities(spot.stacksIfWin, spot.payouts)[spot.hero];
  const eLose = icmEquities(spot.stacksIfLose, spot.payouts)[spot.hero];
  const eSteal = spot.stacksIfTheyFold ? icmEquities(spot.stacksIfTheyFold, spot.payouts)[spot.hero] : eFold;
  const eAction = foldProb * eSteal + (1 - foldProb) * (equity * eWin + (1 - equity) * eLose);
  // Required equity to make the action break even vs folding (when called):
  const requiredEquity = (eFold - eLose) / (eWin - eLose);
  return { eFold, eWin, eLose, eSteal, eAction, requiredEquity };
}

/** Chip-EV required equity for calling an all-in: call / (pot + call). */
export function chipRequiredEquity(potIncludingShove: number, call: number) {
  return call / (potIncludingShove + call);
}
