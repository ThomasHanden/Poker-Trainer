import type { LessonDrills } from '../types';

export const FOUNDATIONS_D: Record<string, LessonDrills> = {
  'rules-rankings': {
    takeaways: [
      'Your hand is the best five cards from your two hole cards and the five on the board.',
      'Straight flush > quads > full house > flush > straight > trips > two pair > pair > high card.',
      'Kickers break ties, but only five cards ever play; suits never break ties.',
      'Every bet or raise in this app is a “raise to” total, and a raise must be at least the size of the last full raise.',
    ],
    problems: [
      { q: 'Board: 9♠ 9♦ 4♣ 4♥ K♠. You hold A♣ 2♦; the opponent holds Q♣ Q♦. Who wins?', a: 'The opponent. They have queens and nines (Q Q 9 9 K). You only have the board’s nines and fours with an ace kicker (9 9 4 4 A). Their pair of queens beats your fours.' },
      { q: 'The big blind is 1bb. A player raises to 3bb and another re-raises to 9bb. What is the minimum next raise-to?', a: '15bb. The last raise added 6bb (from 3bb to 9bb), so the next raise must reach at least 9 + 6 = 15bb.' },
    ],
  },
  position: {
    takeaways: [
      'Acting last gives you information, control of the pot size and the final say on the river.',
      'The button is in position against everyone after the flop; the blinds are out of position against everyone.',
      'Play tighter when many players are still to act, and wider as you approach the button.',
      'The same hand is worth more in position because it realizes more of its equity.',
    ],
    problems: [
      { q: '6-max, folded to the cutoff. How many players can still act after the cutoff preflop, and who can be in position against it after the flop?', a: 'Three players act after the cutoff preflop (button, small blind, big blind). Only the button can be in position against it after the flop.' },
      { q: 'You hold Q♦ T♣. Would you rather open it from UTG or from the button, and why?', a: 'From the button. Fewer players are left to wake up with strong hands that dominate QTo, you often win the blinds outright, and you will play the rest of the hand in position.' },
    ],
  },
  'blinds-antes-stacks': {
    takeaways: [
      'Blinds and antes are dead money: more of it makes stealing and defending more profitable.',
      'Strategy depends on the effective stack — the smaller of the two stacks — measured in big blinds.',
      'A big-blind ante makes the starting pot 2.5bb instead of 1.5bb.',
      'Break-even steal frequency = your raise ÷ (your raise + the dead money).',
    ],
    problems: [
      { q: 'You have 80bb, the cutoff has 25bb and the big blind has 140bb. What is your effective stack against each?', a: '25bb against the cutoff (their stack is smaller) and 80bb against the big blind (your stack is smaller).' },
      { q: 'With a big-blind ante (pot 2.5bb), you open to 2bb. How often must everyone fold for the steal to break even immediately?', a: '2 ÷ (2 + 2.5) ≈ 44%. Without the ante the same open would need 2 ÷ 3.5 ≈ 57%.' },
    ],
  },
  'aggression-initiative': {
    takeaways: [
      'Betting wins two ways (folds and showdown); checking and calling win only at showdown.',
      'Every bet needs a reason: value (worse calls), bluff (better folds) or denial (draws fold).',
      'The preflop raiser usually holds the initiative on the flop.',
      'Medium-strength hands often prefer to check: betting folds out worse and gets called by better.',
    ],
    problems: [
      { q: 'River K♣ 8♦ 4♠ 2♥ 9♣. You hold 8♠ 7♠ and the opponent checks to you. Name the hands that call a bet and the hands that fold.', a: 'Calls: kings, nines and better 8x — mostly hands that beat you. Folds: missed draws and weaker hands, which you already beat. A bet does little, so checking for showdown value is usually best.' },
      { q: 'Name the three main reasons to bet.', a: 'Value (worse hands call), bluff (better hands fold) and protection/denial (hands with outs fold instead of drawing).' },
    ],
  },
  'equity-vs-ev': {
    takeaways: [
      'Equity is your share of the pot if all cards were dealt with no more betting.',
      'EV is the average profit of a decision, including all future betting.',
      'Chips you already put in are sunk; folding is always worth zero from now on.',
      'On the river, EV(call) = equity × (pot + call) − call.',
    ],
    problems: [
      { q: 'River: the pot is 18bb after the opponent bets 6bb. You call with 30% equity. What is the EV of calling?', a: 'The final pot is 18 + 6 = 24bb. EV = 0.30 × 24 − 6 = 7.2 − 6 = +1.2bb, so calling beats folding.' },
      { q: 'Why can a hand with 35% flop equity be worth less than 35% of the pot?', a: 'Because it will not always see the turn and river for free. It may face bets it has to fold to, and out of position it often loses the pot without seeing a showdown. It realizes less than its raw equity.' },
    ],
  },
  'variance-sample': {
    takeaways: [
      'Results over hundreds or even thousands of hands are mostly luck.',
      'Standard error of win rate ≈ SD ÷ √(hands ÷ 100).',
      'Large downswings happen to winning players; plan for them.',
      'Judge yourself by decision quality, which this app scores directly.',
    ],
    problems: [
      { q: 'SD = 90bb/100. What is the standard error of your win rate after 8,100 hands?', a: '8,100 hands is 81 blocks of 100. SE = 90 ÷ √81 = 90 ÷ 9 = 10bb/100. A 95% interval is about ±20bb/100 — very wide.' },
      { q: 'You win 75% of the time in a spot. What is the chance of losing it three times in a row?', a: '0.25³ ≈ 1.6%. Rare, but over many hands it will happen.' },
    ],
  },
  'thinking-in-ranges': {
    takeaways: [
      'Put opponents on a range of hands with likelihoods, not on one hand.',
      'Each action removes the hands that would have acted differently.',
      'Count combos: pairs 6, suited hands 4, offsuit hands 12, minus the cards you can see.',
      'Think about your own range too, so your actions do not give your hand away.',
    ],
    problems: [
      { q: 'You hold K♠ Q♠ and the flop is K♦ 7♣ 2♥. How many combos of AK can your opponent have?', a: 'Two kings are visible (yours and the board’s), so 2 kings remain. 4 aces × 2 kings = 8 combos.' },
      { q: 'An opponent opens from early position and calls your 3-bet. Which strong hands are less likely in their range, and why?', a: 'AA and KK (and often QQ, AK) are less likely, because most players would 4-bet them. Their calling range is weighted toward pairs like JJ–99, AQ and suited broadways.' },
    ],
  },
};
