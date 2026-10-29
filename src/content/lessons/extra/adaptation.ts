import type { LessonExtra } from '../types';

export const ADAPTATION_X: Record<string, LessonExtra> = {
  'player-types': {
    terms: [
      ['TAG', 'Tight-aggressive: plays few hands but plays them aggressively. A solid regular.'],
      ['LAG', 'Loose-aggressive: plays many hands and applies a lot of pressure.'],
      ['Nit', 'Very tight and usually passive: rarely bluffs, folds a lot.'],
      ['Calling station', 'Loose-passive: calls too much, rarely raises or folds.'],
      ['VPIP / PFR', 'Stats for how often a player voluntarily enters the pot / raises preflop.'],
    ],
    deeper: [
      {
        heading: 'The two axes',
        body: [
          'Loose vs tight is about how many hands a player plays. A tight player enters maybe 15–22% of pots in 6-max; a loose one 35% or more. Passive vs aggressive is about how they play those hands: whether they bet and raise or check and call.',
          'Putting them together gives four broad types. Each has a typical leak: nits fold too much, stations call too much, LAGs bluff too much in some spots, and TAGs are often fairly balanced but predictable in big pots.',
        ],
      },
      {
        heading: 'How to spot each type quickly',
        body: [
          'Watch preflop first, because it gives the most information per hand. Players who limp a lot and call raises are usually loose-passive. Players who open often and 3-bet a lot are aggressive. Players who rarely enter a pot are tight.',
          'At showdown, note what they bet and called with. A player who called three streets with bottom pair is a station; a player who bluffed a missed draw on the river is capable of bluffing.',
        ],
      },
      {
        heading: 'Typical adjustments by type',
        body: [
          'Against nits: steal their blinds more, fold to their big bets and raises, and value-bet thinner only when they show interest. Against stations: value-bet more and bigger, bluff much less. Against LAGs: call down a bit lighter, trap with strong hands, and avoid bluffing into their aggression. Against TAGs: stay close to the baseline and look for specific spots.',
        ],
      },
    ],
    apply: [
      'Notice how often each player enters pots and how often they raise.',
      'Label them loosely (nit, station, LAG, TAG) and keep it provisional.',
      'Apply the matching adjustment in the spots where it matters most.',
      'Update the label as you see more hands and showdowns.',
    ],
    examples: [
      {
        title: 'Same river spot, four players',
        steps: [
          'River: you hold top pair, good kicker; the opponent bets pot into you.',
          'Nit: they rarely bluff. Folding top pair is often right.',
          'Station: they rarely bet big without a strong hand — passive players raise and bet big mostly with value. Fold more too.',
          'LAG: they reach the river with many missed draws and bluff some of them. Call.',
          'TAG: close; use pot odds and the board to decide.',
        ],
      },
      {
        title: 'Reading preflop habits',
        steps: [
          'Over one orbit, a player limps twice, calls a raise once and folds the rest. That suggests loose-passive tendencies.',
          'Another player opens twice and 3-bets once. That suggests aggressive.',
          'These are weak reads from few hands. Use them as starting points, not conclusions.',
        ],
      },
    ],
    quiz: [
      { q: 'A player plays many hands but rarely raises. Their type?', options: ['Nit', 'Calling station', 'LAG'], answer: 1, explain: 'Loose and passive.' },
      { q: 'Against a nit, which is a good adjustment?', options: ['Steal their blinds more', 'Bluff-catch their big bets', 'Value-bet very thin'], answer: 0, explain: 'They fold too often preflop.' },
      { q: 'Which stat gives information fastest?', options: ['Preflop stats like VPIP', 'River bluff frequency'], answer: 0, explain: 'Preflop decisions happen every hand.' },
    ],
  },

  'stations-overfolders': {
    terms: [
      ['Station', 'A player who calls too often.'],
      ['Over-folder', 'A player who folds too often.'],
      ['Thin value', 'Betting hands that are only slightly ahead of the calling range.'],
      ['Fold to c-bet', 'A stat for how often a player folds to continuation bets.'],
    ],
    deeper: [
      {
        heading: 'Beating stations',
        body: [
          'Stations call with weak pairs, draws and even ace-high. Their mistake is calling too much, so the exploit is to bet more for value. Value-bet second pair, bet top pair on all three streets, and use bigger sizes with strong hands.',
          'Bluff less. A station’s calls depend on their hand, not your story. Their raises are usually strong, because passive players rarely raise as bluffs.',
        ],
      },
      {
        heading: 'Beating over-folders',
        body: [
          'Over-folders give up too easily. Bet more often with weak hands, especially on boards that look scary for them. Use small sizes for bluffs, because they fold anyway.',
          'With value hands, bet smaller: they only call with strong hands, and a large bet folds out the few worse hands that would call.',
        ],
      },
    ],
    apply: [
      'Against stations: bet more value hands, bet bigger, bluff less.',
      'Against stations: respect their raises.',
      'Against over-folders: bluff more, smaller.',
      'Against over-folders: value-bet smaller and less thinly.',
    ],
    examples: [
      {
        title: 'Three streets of value vs a station',
        steps: [
          'You hold A♣ J♦ on J♠ 7♥ 3♦ 5♣ 9♠. A station called the flop and turn.',
          'Against a balanced player, a third river bet with top pair, good kicker is thin.',
          'Against a station, it is clearly right. They call with weaker jacks, 7x, 9x and pocket pairs.',
        ],
      },
      {
        title: 'Small bluffs vs an over-folder',
        steps: [
          'An over-folder checks to you on a dry river. You have nothing.',
          'A quarter-pot bluff needs to work 20% of the time; a pot bet needs 50%.',
          'If they fold 60% to any bet, both profit, but the small bet risks less when they do call.',
        ],
      },
    ],
    quiz: [
      { q: 'Against a station, your value bets should be…', options: ['More frequent and bigger', 'Less frequent', 'The same'], answer: 0, explain: 'They pay off too much.' },
      { q: 'A calling station suddenly raises. This usually means…', options: ['A bluff', 'A strong hand'], answer: 1, explain: 'Passive players raise mostly with strong hands.' },
      { q: 'Against an over-folder, the best bluff size is usually…', options: ['Small', 'Very large'], answer: 0, explain: 'They fold anyway; risk less.' },
    ],
  },

  'overbluff-underbluff': {
    terms: [
      ['Under-bluffer', 'A player who bluffs less than the price requires.'],
      ['Over-bluffer', 'A player who bluffs more than the price requires.'],
      ['Population tendency', 'How most players in a game behave in a spot.'],
      ['Bluff share', 'The fraction of a betting range that is bluffs.'],
    ],
    deeper: [
      {
        heading: 'Estimating bluff frequency',
        body: [
          'Ask how many bluffs the player could reach this spot with, and whether they would bet them. Lines that leave many missed draws (for example a flush draw that missed) create more potential bluffs. Players who are passive on earlier streets rarely turn into big bluffers on the river.',
          'Compare your estimate with the price. If they bluff more than the price requires, call with your bluff-catchers; if less, fold them.',
        ],
      },
      {
        heading: 'Known population tendencies',
        body: [
          'At lower stakes, players tend to under-bluff in big pots, with big raises, and on the river. They also tend to over-fold to big bets on the turn and river when they have one pair.',
          'These tendencies make two simple defaults: fold more bluff-catchers against big river aggression from unknowns, and bluff a bit more with big bets in spots where they will have medium hands.',
        ],
      },
    ],
    apply: [
      'Count the bluffs they could have and whether they would bet them.',
      'Compare their likely bluff share with the price.',
      'Under-bluffer → fold more bluff-catchers.',
      'Over-bluffer → call more, including weaker bluff-catchers.',
    ],
    examples: [
      {
        title: 'Two lines, two bluff frequencies',
        steps: [
          'Line A: the opponent checks the flop and turn, then makes a big river bet. They had chances to bluff earlier and did not; many players use this line mostly with value.',
          'Line B: the opponent bets flop and turn on a draw-heavy board, the flush misses, and they bet the river. Many missed draws reach the river here, so bluffs are more likely.',
          'With the same bluff-catcher, folding is more reasonable against line A and calling against line B.',
        ],
      },
    ],
    quiz: [
      { q: 'Facing a pot-size river bet, how often must the opponent bluff for a bluff-catcher to break even?', options: ['25%', '33%', '50%'], answer: 1, explain: 'You need 33% equity, so bluffs must be at least 33% of their range.' },
      { q: 'Which line usually contains more bluffs?', options: ['Bet, bet, bet when a draw misses', 'Check, check, big river bet'], answer: 0, explain: 'Missed draws reach the river and bluff.' },
    ],
  },

  'exploitative-adjustments': {
    terms: [
      ['Exploit', 'A strategy change that profits from a specific opponent mistake.'],
      ['Counter-exploit', 'An opponent’s adjustment that punishes your exploit.'],
      ['Leak', 'A repeated mistake.'],
      ['Baseline', 'Your default strategy before adjusting.'],
    ],
    deeper: [
      {
        heading: 'How to build an exploit',
        body: [
          'Step 1: identify a specific, repeated mistake (folds too much to 3-bets, never bluffs rivers). Step 2: find the spots where that mistake costs them money. Step 3: change only your strategy in those spots, by enough to profit.',
          'Exploits should be proportional to your confidence. A strong read justifies a large adjustment; a hunch justifies a small one.',
        ],
      },
      {
        heading: 'The cost of exploiting',
        body: [
          'Every exploit opens a weakness. If you 3-bet a lot against a player who folds too much, you become exploitable if they start 4-betting light. Watch for signs that they have adjusted, and return to the baseline when they do.',
          'Against weak players who do not adjust, large exploits are usually safe and profitable. Against strong players, smaller exploits and closer-to-balanced play are better.',
        ],
      },
    ],
    apply: [
      'Name the specific mistake.',
      'Find the spots where it costs them.',
      'Adjust only those spots, by an amount that fits your confidence.',
      'Watch for counter-adjustments and revert if they come.',
    ],
    examples: [
      {
        title: 'Exploiting a player who never bluffs the river',
        steps: [
          'Mistake: this player only bets the river with strong hands.',
          'Spot: you face a river bet with a bluff-catcher.',
          'Adjustment: fold more bluff-catchers against their river bets. Keep calling with strong hands that beat their thinner value.',
          'Everything else stays the same.',
        ],
      },
    ],
    quiz: [
      { q: 'What is the first step in building an exploit?', options: ['Identify a specific repeated mistake', 'Change your whole strategy', 'Bluff more'], answer: 0, explain: 'Exploits target specific mistakes.' },
      { q: 'When should you revert an exploit?', options: ['When the opponent adjusts', 'Never', 'After one hand'], answer: 0, explain: 'Exploits are only profitable while the mistake continues.' },
    ],
  },

  'gto-baseline': {
    terms: [
      ['GTO', 'Game-theory optimal: shorthand for an equilibrium strategy.'],
      ['Nash equilibrium', 'A pair of strategies where neither player can gain by changing alone.'],
      ['Solver', 'Software that approximates equilibria for simplified versions of the game.'],
      ['Abstraction', 'A simplification such as limited bet sizes, used to make solving possible.'],
    ],
    deeper: [
      {
        heading: 'What equilibrium strategies are good for',
        body: [
          'An equilibrium strategy guarantees that, within the model, no opponent can beat it on average. That makes it a safe default when you do not know the opponent, and a reference for spotting mistakes: if a player deviates from the baseline a lot, that deviation is something to exploit.',
          'Equilibrium also teaches structure: why ranges contain bluffs, why sizes change with board texture, why some hands mix. These lessons transfer even when exact frequencies do not.',
        ],
      },
      {
        heading: 'What they are not',
        body: [
          'They do not maximise profit against weak players. A strategy that never adjusts leaves money on the table against stations and nits. They also depend on the model: allowed bet sizes, rake, stacks and ranges. A chart solved for one setting can be quite wrong in another.',
          'This app does not run a full solver. Its computed charts (push/fold) use a stated, simplified model, and the other charts are labelled illustrative.',
        ],
      },
    ],
    apply: [
      'Use a sensible baseline when you have no reads.',
      'Learn the structure from equilibrium ideas, not just frequencies.',
      'Move away from the baseline as you see opponents’ mistakes.',
      'Always check what assumptions a chart was built on.',
    ],
    examples: [
      {
        title: 'Baseline vs exploit',
        steps: [
          'Baseline: on the river, bluff about a third of your pot-size betting range.',
          'Against a station who never folds: bluff almost never; your bluffs just lose.',
          'Against a nit who folds too much: bluff more than a third; your bluffs win.',
          'The baseline is the reference point that shows how far to move.',
        ],
      },
    ],
    quiz: [
      { q: 'Is No-Limit Hold’em solved?', options: ['Yes, completely', 'No, solvers approximate simplified versions'], answer: 1, explain: 'Full NLHE is too large; solvers use abstractions.' },
      { q: 'Against a calling station, an equilibrium bluffing frequency is…', options: ['Too high', 'Too low', 'Exactly right'], answer: 0, explain: 'They never fold, so bluffs lose.' },
    ],
  },

  'sample-size-reads': {
    terms: [
      ['Sample size', 'How many observations a read is based on.'],
      ['Confidence interval', 'The range in which the true value probably lies.'],
      ['Stat convergence', 'How quickly a stat settles near its true value.'],
      ['Prior', 'Your default expectation before seeing evidence.'],
    ],
    deeper: [
      {
        heading: 'How quickly stats become reliable',
        body: [
          'Stats with an opportunity every hand (VPIP, PFR) settle within about 50–100 hands to a useful level. Stats with rarer opportunities need many more: 3-bet percentage needs hundreds of hands; fold to river bets or river bluff frequency can need thousands.',
          'This matters because the most valuable reads (river bluffing, big-pot tendencies) are the slowest to learn.',
        ],
      },
      {
        heading: 'Combining evidence with defaults',
        body: [
          'Start from what is typical for the game (your prior), and move away from it as evidence builds up. One observation should move your estimate a little; ten consistent ones should move it a lot.',
          'Showdowns are especially informative because they reveal what a player did with a specific hand, but even then one hand shows what they can do, not what they usually do.',
        ],
      },
    ],
    apply: [
      'Ask how many times you have seen the player in this spot.',
      'Rely on preflop stats early; be slow to trust river reads.',
      'Start from population defaults and adjust gradually.',
      'Write down strong showdown reads; they are rare and valuable.',
    ],
    examples: [
      {
        title: 'How wide is one 3-bet stat?',
        steps: [
          'A player has 3-bet 3 of 20 opportunities: 15%.',
          'A rough 95% interval: 0.15 ± 1.96 × √(0.15 × 0.85 / 20) ≈ 0.15 ± 0.16. The true rate could plausibly be anywhere from almost 0% to about 31%.',
          'After 200 opportunities at 15%, the interval shrinks to about ±5%: 10% to 20%.',
        ],
      },
    ],
    quiz: [
      { q: 'You have seen a player bluff the river once. What can you conclude?', options: ['They bluff often', 'They are capable of bluffing', 'They never value bet'], answer: 1, explain: 'One observation shows possibility, not frequency.' },
      { q: 'Which stat needs the largest sample?', options: ['VPIP', 'River bluff frequency', 'PFR'], answer: 1, explain: 'The spot comes up rarely.' },
    ],
  },

  'unsupported-assumptions': {
    terms: [
      ['Story-telling', 'Building a narrative about an opponent’s hand without evidence.'],
      ['Default range', 'A reasonable range assumed when you have no reads.'],
      ['Read', 'A belief about an opponent based on evidence.'],
      ['Leveling', 'Overthinking what the opponent thinks you think, often without evidence.'],
    ],
    deeper: [
      {
        heading: 'Common unsupported assumptions',
        body: [
          '“They always have it” leads to folding too much. “They are always bluffing” leads to calling too much. “Everyone at this stake is bad” leads to bluffing players who call, and to paying off players who are actually solid.',
          'Each of these is sometimes true, but treating it as true without evidence costs money in the many cases where it is not.',
        ],
      },
      {
        heading: 'A better default',
        body: [
          'Assume a reasonable baseline range for the spot, use pot odds and range thinking, and choose sizes that are hard to exploit. That avoids large mistakes against any type of player.',
          'Then collect evidence and adjust in proportion. This is slower than jumping to conclusions, but much more reliable.',
        ],
      },
    ],
    apply: [
      'With no reads, assume a competent baseline range.',
      'Notice when you are telling a story without evidence.',
      'Write down what you actually saw (actions and showdowns).',
      'Adjust in proportion to the evidence.',
    ],
    examples: [
      {
        title: 'One big bluff at showdown',
        steps: [
          'A new player shows a bluff after a big river bet.',
          'Unsupported conclusion: “they always bluff — call them down every time”.',
          'Better: note that they can bluff. Call a little more often in similar spots, and look for more evidence.',
        ],
      },
    ],
    quiz: [
      { q: 'Without reads, the safest approach is…', options: ['Assume a reasonable baseline', 'Assume they always bluff', 'Assume they always have it'], answer: 0, explain: 'Baselines avoid big mistakes.' },
      { q: 'Leveling usually means…', options: ['Overthinking without evidence', 'Adjusting to a solid read'], answer: 0, explain: 'It replaces evidence with guesses about guesses.' },
    ],
  },
};
