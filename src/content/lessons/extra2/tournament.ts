import type { LessonDrills } from '../types';

export const TOURNAMENT_D: Record<string, LessonDrills> = {
  'antes-stack-depth': {
    takeaways: [
      'Blinds rise, so stacks shrink in big blinds even without losing pots.',
      'Measure every stack in big blinds at every level.',
      'Antes widen opens and big-blind defense.',
      'Strategy shifts from deep play to shove-or-fold as stacks get short.',
    ],
    problems: [
      { q: 'You have 24,000 chips. At 600/1,200 with a 1,200 big-blind ante, how deep are you, and how big is the pot before action?', a: '24,000 ÷ 1,200 = 20bb. The pot is 0.5 + 1 + 1 = 2.5bb (3,000 chips).' },
      { q: 'Why should the big blind defend wider with an ante?', a: 'There is more in the pot, so the price to call is better.' },
    ],
  },
  'short-stack': {
    takeaways: [
      'With 12–25bb, re-shoves over late-position opens are a key weapon.',
      'Fold equity against wide ranges makes re-shoves profitable even when called sometimes.',
      'Avoid raising and folding a large share of your stack.',
      'Choose re-shove hands with good equity when called and useful blockers.',
    ],
    problems: [
      { q: 'You have 15bb in the big blind and the button opens 2bb. Why is A8o a reasonable re-shove?', a: 'The button opens wide and cannot call 15bb with most of it. A8o has decent equity when called and blocks some of the button’s calling aces.' },
      { q: 'Why is raising to 3bb with 12bb and folding to a shove a leak?', a: 'You lose a quarter of your stack without seeing a flop. Shoving uses your fold equity fully.' },
    ],
  },
  'push-fold': {
    takeaways: [
      'Under about 10–12bb, all-in or fold is close to optimal first in.',
      'Shove ranges are wider than calling ranges.',
      'Late position and tight opponents allow wider shoves.',
      'ICM tightens calling ranges more than shoving ranges.',
    ],
    problems: [
      { q: 'Heads-up, 10bb, small blind. Should the shoving range be tight or wide?', a: 'Wide — more than half of hands in an equilibrium chart. The big blind cannot call wide enough to punish it.' },
      { q: 'Why does the caller need a tighter range than the shover?', a: 'The shover also wins when the caller folds. The caller has no fold equity and needs real equity against the shoving range.' },
    ],
  },
  'chip-ev-vs-icm': {
    takeaways: [
      'Tournament chips are not money; prizes depend on finishing position.',
      'Chips you lose are worth more than chips you win.',
      'Near pay jumps, +cEV plays can be −$EV.',
      'Winner-take-all is closest to chip EV; satellites are the furthest.',
    ],
    problems: [
      { q: 'A call is slightly +EV in chips on the bubble, but losing busts you. Usually call or fold?', a: 'Usually fold. The prize equity you lose by busting outweighs the small chip edge.' },
      { q: 'Why does doubling your stack not double your prize equity?', a: 'Prize money is spread over several places, and a big stack can still finish below first. Each extra chip is worth a little less.' },
    ],
  },
  icm: {
    takeaways: [
      'ICM turns stacks into prize equity using finishing probabilities.',
      'The risk premium is the extra equity needed above chip-EV break-even.',
      'Medium stacks facing covering stacks feel the most pressure.',
      'Big stacks can apply pressure to medium stacks.',
    ],
    problems: [
      { q: 'Three players with equal stacks, payouts 50/30/20. What is each player’s ICM equity?', a: 'By symmetry each has one-third of the prize pool: about 33.3%.' },
      { q: 'A call needs 45% equity in chips, and the risk premium is 8%. What equity do you need?', a: 'About 53%.' },
    ],
  },
  'final-table': {
    takeaways: [
      'Each bust is usually a pay jump.',
      'Medium stacks tighten while shorter stacks remain.',
      'Chip leaders open more into medium stacks.',
      'Short stacks look for good spots to double up.',
    ],
    problems: [
      { q: 'Final table, a 2bb stack is still in. You have 18bb and face a shove from the leader with A9o. Why might folding be correct?', a: 'If you lose, you finish below the 2bb stack. If you fold, the short stack will often bust first and you move up the payouts.' },
      { q: 'Why can the chip leader open wider at a final table?', a: 'Medium stacks cannot call lightly without risking big pay jumps, so the leader’s raises get more folds.' },
    ],
  },
  'covering-stacks': {
    takeaways: [
      'If you cover an opponent, the worst case is losing part of your stack.',
      'If you are covered, the worst case is busting.',
      'Covering stacks can apply more pressure near pay jumps.',
      'Covered players should avoid marginal all-ins.',
    ],
    problems: [
      { q: 'You have 30bb and face a 20bb shove. You cover them. If you lose, how many big blinds remain?', a: '30 − 20 = 10bb. You survive.' },
      { q: 'Same hand, but the shover has 40bb. If you lose?', a: 'You bust. Being covered raises the risk premium.' },
    ],
  },
  payouts: {
    takeaways: [
      'Top-heavy payouts reward chip accumulation.',
      'Flat payouts reward survival.',
      'Satellites are the extreme flat case: safe stacks fold almost everything.',
      'Check the payout structure before the bubble.',
    ],
    problems: [
      { q: 'Satellite: 10 seats, 11 players, you have the biggest stack. Someone shoves; you hold KK. Call?', a: 'Often fold. You are almost certain to win a seat; calling risks busting, while winning adds nothing because every seat pays the same.' },
      { q: 'Winner-take-all: should you take thin chip-EV edges?', a: 'Yes. With only first place paid, chips are close to linear in value.' },
    ],
  },
  bounties: {
    takeaways: [
      'Bounties add value only when you cover the all-in player.',
      'Convert the bounty to chips and add it to the pot.',
      'That lowers the equity you need to call.',
      'If you are covered, ignore the bounty for that pot.',
    ],
    problems: [
      { q: 'You must call 12bb into a 26bb final pot. A bounty worth 6bb is available. Required equity with and without it?', a: 'Without: 12 ÷ 26 ≈ 46%. With: 12 ÷ 32 = 37.5%.' },
      { q: 'You have 10bb and an opponent with 30bb shoves. Does their bounty affect your call?', a: 'No. You cannot eliminate them in this pot.' },
    ],
  },
};
