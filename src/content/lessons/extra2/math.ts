import type { LessonDrills } from '../types';

export const MATH_D: Record<string, LessonDrills> = {
  'pot-odds': {
    takeaways: [
      'Required equity = call ÷ (pot + call), where the pot already includes the bet you face.',
      'Quick table: ⅓ pot 20%, ½ pot 25%, ⅔ pot 28.6%, pot 33%, 2× pot 40%.',
      'Pot odds are exact when calling ends the betting.',
      'On earlier streets, adjust for implied odds and position.',
    ],
    problems: [
      { q: 'The pot is 40bb and the opponent bets 20bb. What equity do you need to call?', a: '20 ÷ (40 + 20 + 20) = 25%.' },
      { q: 'You are getting 3:1 on a call. What equity do you need?', a: '1 ÷ (3 + 1) = 25%.' },
      { q: 'River: pot 25bb, opponent bets 25bb. You think you win 30% of the time. Call or fold?', a: 'You need 25 ÷ 75 ≈ 33%. With 30% the call loses about 0.30 × 75 − 25 = −2.5bb. Fold, unless you have a read that they bluff more.' },
    ],
  },
  'break-even-equity': {
    takeaways: [
      'Calls need equity; bluffs need folds.',
      'Caller: call ÷ (pot + 2 × bet). Bluffer: bet ÷ (pot + bet).',
      'For a raise-bluff, the risk is your full raise and the reward is the pot including their bet.',
      'Semi-bluffs need fewer folds because they win sometimes when called.',
    ],
    problems: [
      { q: 'Pot 12bb. You bet 9bb as a pure bluff. Break-even fold rate?', a: '9 ÷ (12 + 9) ≈ 43%.' },
      { q: 'Pot 10bb, the opponent bets 6bb, you raise to 20bb as a bluff. Break-even fold rate?', a: 'You risk 20bb to win 10 + 6 = 16bb: 20 ÷ 36 ≈ 56%.' },
    ],
  },
  outs: {
    takeaways: [
      'Count outs that make the likely best hand; remove tainted ones.',
      'Rule of 2 for one card, rule of 4 for two (only if you will see both).',
      'Above about 8 outs, subtract (outs − 8) from the ×4 estimate.',
      'Common counts: flush draw 9, open-ender 8, gutshot 4, two overcards about 6.',
    ],
    problems: [
      { q: 'You have a gutshot plus two overcards on the flop, and your overcards are likely good. Roughly how many outs, and what is your equity by the river?', a: '4 + 6 = 10 outs. Rule of 4 with correction: 40 − 2 = 38%. Discount the overcards if the opponent might have a strong hand.' },
      { q: 'Turn, you have a flush draw (9 outs). What is your chance to hit on the river?', a: '9 ÷ 46 ≈ 19.6%. The rule of 2 gives 18%.' },
    ],
  },
  'implied-odds': {
    takeaways: [
      'Implied odds: money you expect to win after you hit.',
      'They need deep stacks, a disguised hand and an opponent who pays off.',
      'Reverse implied odds: money you lose when you make a second-best hand.',
      'Break-even extra winnings W: p × (final pot + W) = call.',
    ],
    problems: [
      { q: 'Turn: pot after the bet is 30bb and you must call 10bb with 8 outs (≈17.4%). How much more must you win when you hit to break even?', a: '0.174 × (40 + W) = 10 → 40 + W ≈ 57.5 → W ≈ 17.5bb.' },
      { q: 'Which has better implied odds: a flush draw on a board where the third flush card is obvious, or a gutshot to a disguised straight?', a: 'Often the gutshot. When it hits, the opponent is less likely to see it coming and more likely to pay off, even though it hits less often.' },
    ],
  },
  'expected-value': {
    takeaways: [
      'EV = Σ (probability × result) across outcomes.',
      'Folding is always 0 from this point.',
      'Compare actions by EV; choose the highest, not just a positive one.',
      'Rough estimates are usually enough to pick the better action.',
    ],
    problems: [
      { q: 'Pot 20bb. You bluff 10bb; they fold 40% of the time. EV?', a: '0.4 × 20 − 0.6 × 10 = 8 − 6 = +2bb.' },
      { q: 'You can check (EV +3bb) or bet (EV +2bb). Both are positive — which is right?', a: 'Check. You choose the higher-EV action; betting would cost 1bb on average compared with checking.' },
    ],
  },
  'fold-equity': {
    takeaways: [
      'EV of a bet = fold% × pot + call% × (equity × final pot − bet).',
      'Fold equity often turns a losing call into a winning bet.',
      'It falls against stations, multiway and committed opponents.',
      'Short stacks have less fold equity because callers risk less.',
    ],
    problems: [
      { q: 'Pot 10bb. You shove 20bb with 30% equity when called; they fold 50%. EV?', a: 'Called: final pot 50bb, you win 0.3 × 50 − 20 = −5bb. EV = 0.5 × 10 + 0.5 × (−5) = +2.5bb.' },
      { q: 'Same spot, but they never fold. EV?', a: '0.3 × 50 − 20 = −5bb. Without fold equity the shove loses.' },
    ],
  },
  'equity-vs-range': {
    takeaways: [
      'Equity against a whole range is the weighted average against each hand in it.',
      'Split ranges into categories: hands you beat, hands that beat you, draws.',
      'Weight each category by its number of combos.',
      'Check estimates with the equity calculator on the Ranges page.',
    ],
    problems: [
      { q: 'Against a range of 20 combos you beat (90% each) and 10 combos that beat you (15% each), what is your equity?', a: '(20 × 0.9 + 10 × 0.15) ÷ 30 = (18 + 1.5) ÷ 30 = 65%.' },
      { q: 'Why is “they probably have AK” a weak basis for a call?', a: 'Their range includes many other hands. Your decision should use your equity against all of them, weighted by how likely each is.' },
    ],
  },
  combinatorics: {
    takeaways: [
      'Pairs 6 combos, suited hands 4, offsuit hands 12; 1,326 in total.',
      'One visible card of a rank: pairs drop to 3, non-pairs with that rank drop by a quarter.',
      'Count value combos and bluff combos to judge a betting range.',
      'Combos often matter more than which hand “looks” scary.',
    ],
    problems: [
      { q: 'Board A♠ 9♦ 4♣. You hold A♥ K♥. How many combos of AK, AA and 99 can your opponent have?', a: 'AK: 2 aces left × 3 kings left = 6. AA: 2 aces left → 1 combo. 99: 3 nines left → 3 combos.' },
      { q: 'How many combos are in “TT+, AK”?', a: 'TT, JJ, QQ, KK, AA = 5 × 6 = 30, plus AK = 16. Total 46.' },
    ],
  },
  'bluff-value-ratios': {
    takeaways: [
      'In a simple river game, the bluff share that makes a bluff-catcher indifferent is bet ÷ (pot + 2 × bet).',
      'Half pot: 25% bluffs. Pot: 33%. 2× pot: 40%.',
      'Bigger bets allow more bluffs; smaller bets need fewer.',
      'Earlier streets can hold more bluffs because they have equity.',
    ],
    problems: [
      { q: 'You will bet 2× pot on the river with 18 value combos. How many bluffs keep you balanced?', a: 'Bluffs should be 40% of the range: 18 ÷ 0.6 = 30 total, so 12 bluffs.' },
      { q: 'You bet pot with 30 value combos and 30 bluff combos. What can the opponent do?', a: 'Bluffs are 50% of your range, more than the 33% that makes them indifferent, so they should call with all their bluff-catchers. Cut some bluffs.' },
    ],
  },
  mdf: {
    takeaways: [
      'MDF = pot ÷ (pot + bet): the share of your range that must continue to stop any-two-card bluffs.',
      'Half pot 67%, pot 50%, 2× pot 33%.',
      'MDF applies to your whole range, not to each hand.',
      'Fold more than MDF against players who rarely bluff.',
    ],
    problems: [
      { q: 'Facing a ¾-pot bet, what is MDF?', a: '1 ÷ 1.75 ≈ 57%.' },
      { q: 'You reach the river with 40 combos and face a pot-size bet. About how many combos should continue against an unknown opponent?', a: 'MDF is 50%, so about 20 combos. Against a player who rarely bluffs, fewer.' },
    ],
  },
  'equity-not-action': {
    takeaways: [
      'Equity is one input; realization, fold equity and future betting matter too.',
      'High equity can still prefer to check; low equity can still bet.',
      'Compare the EV of actions instead of reading equity alone.',
      'Position and stack depth change how much equity turns into profit.',
    ],
    problems: [
      { q: 'You have 70% equity on the river, but only better hands call a bet. Should you bet?', a: 'No. Your equity comes from the opponent’s weaker hands, which fold to a bet. Checking wins those pots at showdown and avoids paying off better hands.' },
      { q: 'You have 32% equity with a flush draw and the opponent folds 40% to a raise. Why can raising beat calling?', a: 'The raise wins the pot immediately 40% of the time and still has 32% equity when called. Together these can exceed the EV of calling, which only uses the 32%.' },
    ],
  },
};
