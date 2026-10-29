import type { LessonDrills } from '../types';

export const ADAPTATION_D: Record<string, LessonDrills> = {
  'player-types': {
    takeaways: [
      'Two axes: loose vs tight (how many hands) and passive vs aggressive (how they play them).',
      'Nits fold too much, stations call too much, LAGs pressure, TAGs are solid.',
      'Preflop habits reveal type fastest.',
      'Keep labels provisional and update them with evidence.',
    ],
    problems: [
      { q: 'A player plays 45% of hands and almost never raises. Type and main adjustment?', a: 'A calling station (loose-passive). Value-bet more and bigger, bluff less, and respect their rare raises.' },
      { q: 'A player plays 14% of hands and only bets big with strong hands. Type and main adjustment?', a: 'A nit (tight). Steal their blinds more often and fold more to their big bets and raises.' },
    ],
  },
  'stations-overfolders': {
    takeaways: [
      'Stations: bet more value hands, bigger; bluff less.',
      'Over-folders: bluff more, with small sizes.',
      'A station’s raise is usually very strong.',
      'Against over-folders, value-bet smaller and less thinly.',
    ],
    problems: [
      { q: 'River, you have second pair against a station who checks. Bet or check?', a: 'Usually bet small. Stations call with many worse hands, such as weaker pairs and ace-high.' },
      { q: 'River, you have nothing against an over-folder who checks. Bet or check?', a: 'Bet, often small. They fold too often, so cheap bluffs profit.' },
    ],
  },
  'overbluff-underbluff': {
    takeaways: [
      'Compare the opponent’s likely bluff share with the price.',
      'Under-bluffers: fold more bluff-catchers. Over-bluffers: call more.',
      'Lines with many missed draws contain more bluffs.',
      'Default: many players under-bluff big river bets.',
    ],
    problems: [
      { q: 'Facing a half-pot river bet, the opponent bluffs here about 15% of the time. Call with a pure bluff-catcher?', a: 'No. A half-pot bet needs 25% bluffs; at 15% the call loses.' },
      { q: 'Same bet, but the opponent bluffs 35%. Call?', a: 'Yes. 35% is above the 25% needed.' },
    ],
  },
  'exploitative-adjustments': {
    takeaways: [
      'Identify a specific repeated mistake.',
      'Adjust only the spots where that mistake costs them.',
      'Size the adjustment to your confidence in the read.',
      'Revert when the opponent adjusts.',
    ],
    problems: [
      { q: 'A player folds 75% to 3-bets. What changes and what stays the same?', a: 'Add more 3-bet bluffs against their opens. Keep your other preflop and postflop strategy unchanged until you learn more.' },
      { q: 'You have exploited a player by 3-betting often. They start 4-betting light. What now?', a: 'Return toward the baseline: 3-bet less with bluffs, and continue more often against their 4-bets with strong hands.' },
    ],
  },
  'gto-baseline': {
    takeaways: [
      'An equilibrium strategy cannot be beaten within its model.',
      'It is a safe default and a reference for spotting mistakes.',
      'It does not maximize profit against weak players.',
      'Solver results depend on their inputs: sizes, rake, stacks, ranges.',
    ],
    problems: [
      { q: 'Why is a GTO river bluffing frequency a mistake against a station?', a: 'Stations do not fold enough, so the bluffs in a balanced range lose money. Cutting bluffs earns more.' },
      { q: 'A chart says “GTO” but does not mention rake or bet sizes. What should you ask?', a: 'What model was solved: stack depth, allowed sizes, rake, and ranges. Without those, you cannot tell whether it fits your game.' },
    ],
  },
  'sample-size-reads': {
    takeaways: [
      'Small samples are noisy; most reads need many observations.',
      'Preflop stats settle fastest; river tendencies slowest.',
      'Start from population defaults and move gradually.',
      'One showdown shows what a player can do, not what they usually do.',
    ],
    problems: [
      { q: 'A player has folded to 4 of 5 river bets (80%). How confident should you be?', a: 'Not very. With 5 observations, the true rate could easily be anywhere from about 40% to almost 100%.' },
      { q: 'Which read can you trust sooner: “plays 40% of hands” or “bluffs rivers often”?', a: '“Plays 40% of hands” — there is a chance to observe it every hand.' },
    ],
  },
  'unsupported-assumptions': {
    takeaways: [
      'Without evidence, assume a reasonable baseline.',
      'Avoid stories like “they always have it” or “they always bluff”.',
      'Record what you actually saw.',
      'Adjust in proportion to the evidence.',
    ],
    problems: [
      { q: 'A new player shows one bluff. What is a sensible adjustment?', a: 'A small one: call slightly more in very similar spots, and keep watching. Do not start calling everything.' },
      { q: 'Why is assuming everyone at low stakes is weak risky?', a: 'Some players are strong. Bluffing them or paying off their value bets based on that assumption costs money.' },
    ],
  },
};
