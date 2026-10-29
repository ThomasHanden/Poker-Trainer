// Coverage map: what is implemented, what is approximate, and what is unsupported.
export type Status = 'implemented' | 'approximate' | 'unsupported';

export const FEATURE_COVERAGE: { area: string; item: string; status: Status; note: string }[] = [
  { area: 'Rules', item: 'NLHE betting, min-raises, short all-ins, reopening (incl. cumulative short all-ins), side pots, split pots, odd chips', status: 'implemented', note: 'Unit-tested; TDA-style conventions. House rules that differ are not modelled.' },
  { area: 'Rules', item: 'Antes: per-player and big-blind ante', status: 'implemented', note: '' },
  { area: 'Rules', item: 'Straddles, bomb pots, run-it-twice, rake deduction from pots', status: 'unsupported', note: 'Rake is discussed in lessons and assumed in charts but not deducted in play.' },
  { area: 'Formats', item: 'Cash game', status: 'implemented', note: '6-max at 100bb (plus 200bb deep template); heads-up and full-ring opening spots.' },
  { area: 'Formats', item: 'Tournament: push/fold, re-shove, bubble call, final-table shove', status: 'implemented', note: 'Chip EV via computed HU equilibrium; ICM (Malmuth–Harville) with stated stacks and payouts.' },
  { area: 'Formats', item: 'Tournament deep-stack postflop play, bounties (PKO), satellites', status: 'unsupported', note: 'Covered in lessons only.' },
  { area: 'Table sizes', item: 'Heads-up, 6-max, full ring (9)', status: 'approximate', note: 'Engine supports 2–9 players. Full-ring and heads-up scenarios exist for opening and short-stack spots; postflop templates are 6-max.' },
  { area: 'Preflop', item: 'Opening, blind defence, 3-bet/4-bet, squeeze, isolation, SB vs BB', status: 'approximate', note: 'Illustrative baseline charts written for this app — not solver outputs.' },
  { area: 'Preflop', item: 'Push/fold (heads-up / folded to SB)', status: 'implemented', note: 'Computed equilibrium in a simplified model (shove/fold vs call/fold).' },
  { area: 'Postflop', item: 'C-bets (dry/wet/OOP/3-bet pot/multiway), defending, check-raises, turn barrels, probes, delayed c-bets, overbets, river value/bluff/bluff-catch, facing raises', status: 'approximate', note: 'Heuristic guidance + model-based simulation; labelled with sources and confidence.' },
  { area: 'Postflop', item: 'Limped multiway pots, 4-bet pot postflop, donk-bet flops', status: 'unsupported', note: '' },
  { area: 'Opponents', item: 'Six behaviour profiles; hidden profiles in expert mode', status: 'approximate', note: 'One parameterised policy using only public info + own cards. Simplified models, not population data.' },
  { area: 'Evaluation', item: 'Exact math (pot odds, EV of all-ins, ICM), exact river/turn equity vs modelled ranges', status: 'implemented', note: '' },
  { area: 'Evaluation', item: 'Flop equity and multi-street EV', status: 'approximate', note: 'Monte Carlo with sample counts and error bars; EVs are vs the opponent model with a baseline policy for later hero decisions.' },
  { area: 'Evaluation', item: 'Solver-verified recommendations / optimal frequencies', status: 'unsupported', note: 'No solver is integrated; nothing is labelled solver-approved.' },
  { area: 'Ranges', item: '13×13 explorer, weights, presets with assumptions, save/load, import/export, compare, card removal, equity calculator, drills', status: 'implemented', note: '' },
  { area: 'Progress', item: 'History, bookmarks, concept/street/position/difficulty breakdowns, trend, suggestions, export/import/reset', status: 'implemented', note: 'Local browser storage only.' },
  { area: 'AI explanations', item: 'Optional LLM explanations', status: 'unsupported', note: 'Not included. All explanations are generated from structured, validated results.' },
];
