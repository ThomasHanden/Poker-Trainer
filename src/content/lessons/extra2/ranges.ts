import type { LessonDrills } from '../types';

export const RANGES_D: Record<string, LessonDrills> = {
  'constructing-ranges': {
    takeaways: [
      'Start from a baseline chart, then adjust for the game and the players.',
      'Write ranges in notation (22+, A2s+, KTo+) and save them to compare.',
      'For opponents, ask which strong hands their line makes unlikely.',
      'Check the total share of hands; it should fit the seat and action.',
    ],
    problems: [
      { q: 'Write a range containing every pocket pair, all suited aces and AJo or better.', a: '22+, A2s+, AJo+ (AJo, AQo, AKo).' },
      { q: 'How many combos is 22+, A2s+, AJo+?', a: 'Pairs 13 × 6 = 78; suited aces 12 × 4 = 48; AJo, AQo, AKo 3 × 12 = 36. Total 162 combos, about 12% of hands.' },
    ],
  },
  'weighted-combos': {
    takeaways: [
      'Weights say how often a hand is in the range (0–100%).',
      'Weighted combos = combos × weight.',
      'Weights express both mixed strategies and your uncertainty about an opponent.',
      'Compare categories by weighted combos, not by hand names.',
    ],
    problems: [
      { q: 'Range: AA (100%), KK (100%), AKs (100%), AKo (50%), A5s (50%). Weighted combos?', a: 'AA 6 + KK 6 + AKs 4 + AKo 12 × 0.5 = 6 + A5s 4 × 0.5 = 2. Total 24.' },
      { q: 'In that range, what share is A5s?', a: '2 ÷ 24 ≈ 8%.' },
    ],
  },
  'narrowing-ranges': {
    takeaways: [
      'Each action is evidence; reweight hands by how likely each was to take it.',
      'Strong actions remove weak hands; passive actions remove some strong ones.',
      'Bet size matters: small bets come from wide ranges, big ones from polarized ranges.',
      'Keep several categories in mind instead of narrowing to one hand.',
    ],
    problems: [
      { q: 'A player bets the flop with 100% of their strong hands and 30% of their weak hands. Their range before the bet was 20 strong combos and 80 weak. What share of the betting range is strong?', a: 'Strong 20, weak 80 × 0.3 = 24. Strong share = 20 ÷ 44 ≈ 45%.' },
      { q: 'Why should a call usually narrow a range less than a raise?', a: 'Calls come from many kinds of hands (pairs, draws, some strong hands slow-playing), while raises come mostly from strong hands and the best draws.' },
    ],
  },
  blockers: {
    takeaways: [
      'Your cards remove combos from the opponent’s range.',
      'For bluffs: block their calls, do not block their folds.',
      'For calls: block their value, do not block their bluffs.',
      'Blockers decide close spots; they rarely override clear ones.',
    ],
    problems: [
      { q: 'The river puts a third heart on the board and you hold the A♥ with no pair. Why is this a good bluff candidate?', a: 'The opponent cannot hold the nut flush, and every flush they have must use the remaining hearts, so their strongest calls are less likely. Your hand also has no showdown value to lose by betting.' },
      { q: 'You hold K♠ on a K♦ 8♣ 3♥ 2♠ 7♦ board facing a bet. Do you block their value or their bluffs more?', a: 'Value: you remove some of their top-pair (Kx) combos. That raises the share of bluffs in their range, which helps a call.' },
    ],
  },
  'capped-uncapped': {
    takeaways: [
      'Capped ranges rarely hold the strongest hands; uncapped ranges can.',
      'Passive lines (flat calls, check-backs) tend to cap ranges.',
      'Against a capped range, large bets are powerful.',
      'Protect your own passive lines with some strong hands.',
    ],
    problems: [
      { q: 'An opponent flat-calls your 3-bet preflop. Which hands are less likely in their range?', a: 'AA and KK (often QQ and AK too), because most players 4-bet them.' },
      { q: 'You always bet your strong hands on a wet flop and check only weak ones. How can an opponent exploit this?', a: 'By betting whenever you check. Your checking range is capped and weak, so it has to fold too often. Keeping a few strong hands in your checks prevents this.' },
    ],
  },
  'range-board-interaction': {
    takeaways: [
      'Predict which range the board favors before looking at your cards.',
      'High-card boards tend to favor the preflop raiser.',
      'Low connected boards tend to favor wide defending ranges.',
      'Check where the advantage sits: in the top hands or the middle.',
    ],
    problems: [
      { q: 'Button open vs big-blind call. Which flop most favors the button: K♣ Q♦ 3♠, 6♠ 5♠ 4♦ or 9♥ 8♦ 7♣?', a: 'K♣ Q♦ 3♠. The button has more KK, QQ, AK, AQ, KQ; the other two boards connect more with the big blind’s low suited and connected hands.' },
      { q: 'On a paired flop like 7♣ 7♦ 2♠, who has more trips?', a: 'Usually the big blind, which defends more hands containing a 7 (76s, 87s, 97s, 75s, A7s). The button still has more overpairs.' },
    ],
  },
  'value-bluff-composition': {
    takeaways: [
      'Build betting ranges from value first, then add bluffs in proportion.',
      'River bluffs ≈ bet ÷ (pot + 2 × bet) of the range.',
      'Bluff with no-showdown hands that have good blockers.',
      'Most players under-bluff; adjust to the opponent.',
    ],
    problems: [
      { q: 'You have 24 value combos for a half-pot river bet. How many bluffs?', a: 'Bluffs should be 25% of the range: 24 ÷ 0.75 = 32 total, so 8 bluffs.' },
      { q: 'You have 15 missed-draw combos but need only 8 bluffs. How do you choose?', a: 'Pick the ones that block the opponent’s calling hands and do not block their folds; check the rest.' },
    ],
  },
  'mixed-strategies': {
    takeaways: [
      'Mixed strategies play the same hand in different ways at set frequencies.',
      'Hands in a mix have nearly equal EV for each action.',
      'Mix using hand features or a simple randomizer.',
      'Against weak players, prefer the best exploitative pure action.',
    ],
    problems: [
      { q: 'You want to bet a hand 25% of the time. Give a simple way to randomize.', a: 'Look at the second hand of a clock: bet if it is between 0 and 15 seconds, otherwise check.' },
      { q: 'Why is choosing wrongly in a mixed spot usually a small mistake?', a: 'Both actions have nearly the same EV for that hand. The cost comes from always choosing the same way, which an observant opponent can exploit.' },
    ],
  },
  'range-visualization': {
    takeaways: [
      'Pairs on the diagonal, suited hands above it, offsuit hands below.',
      'Pair cells are 6 combos, suited cells 4, offsuit cells 12.',
      'Typical opens: a top-left triangle, a diagonal band and the top row of suited aces.',
      'Use the family breakdown to compare ranges quickly.',
    ],
    problems: [
      { q: 'In the 13×13 grid, is AKo above or below the diagonal?', a: 'Below. Offsuit hands are below the diagonal; AKs is above it.' },
      { q: 'Which adds more combos: the 11 suited aces from AQs down to A2s, or AQo, AJo and ATo?', a: 'AQs–A2s: 11 × 4 = 44 combos. AQo, AJo, ATo: 3 × 12 = 36 combos. The suited aces add more here, despite each being smaller.' },
    ],
  },
};
