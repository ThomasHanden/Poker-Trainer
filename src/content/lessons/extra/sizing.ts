import type { LessonExtra } from '../types';

export const SIZING_X: Record<string, LessonExtra> = {
  'what-a-bet-does': {
    terms: [
      ['Continuing range', 'The hands an opponent calls or raises with after a bet.'],
      ['Folding range', 'The hands that give up to the bet.'],
      ['Pot fraction', 'Bet size as a share of the pot, such as ⅓ pot or ¾ pot.'],
      ['Break-even fold rate', 'How often a bluff must work to break even: bet ÷ (pot + bet).'],
    ],
    deeper: [
      {
        heading: 'Every size draws a line through their range',
        body: [
          'A bet splits the opponent’s range into hands that continue and hands that fold. The size decides where that line falls. A small bet gets called by most pairs and draws. A large bet folds out weak pairs and weak draws and leaves stronger hands.',
          'So the question is not “how much do I want to win?” but “which hands do I want to call, and which do I want to fold?”. If you have a strong hand, you want a size that keeps many worse hands in. If you are bluffing, you want a size that folds the hands that beat you, as cheaply as possible.',
        ],
      },
      {
        heading: 'Bets also price the opponent’s draws',
        body: [
          'On the flop and turn, the size also decides the price a draw pays. A third-pot bet lets a flush draw call with about 20% equity needed; a pot-size bet needs about 33%. Against many draws, bigger bets make them pay more, or fold.',
          'This is part of why sizes get bigger on wet boards and smaller on dry ones.',
        ],
      },
    ],
    apply: [
      'Before betting, name the hands you want to call and the hands you want to fold.',
      'Pick the smallest size that achieves that.',
      'With value hands, check that enough worse hands still call at that size.',
      'With bluffs, check that the hands that beat you fold at that size.',
    ],
    examples: [
      {
        title: 'Thin value: size by who calls',
        steps: [
          'River: A♣ 8♦ 5♠ 2♥ K♣. You hold A♦ T♠ and the opponent checked.',
          'Third pot: called by weaker aces, some 8x and 5x, and maybe pocket pairs. Many worse hands call.',
          'Pot: called mostly by AK, two pair and sets. Most worse hands fold.',
          'The small bet earns more because it keeps the worse hands in.',
        ],
      },
    ],
    quiz: [
      { q: 'A bluff bets ¾ pot. How often must it work to break even?', options: ['33%', '43%', '75%'], answer: 1, explain: '0.75 / 1.75 ≈ 43%.' },
      { q: 'Which question should come first when choosing a size?', options: ['Which hands should call and which should fold?', 'How much do I want to win?', 'What size did I use last time?'], answer: 0, explain: 'The size is chosen to shape the continuing range.' },
    ],
  },

  'small-vs-large': {
    terms: [
      ['Block bet', 'A small bet out of position, often meant to set a cheap price.'],
      ['Polarize', 'Bet with strong hands and bluffs, check the middle.'],
      ['Range bet', 'Bet with your whole range, usually small.'],
      ['Pressure', 'Forcing difficult decisions on bluff-catchers with large sizes.'],
    ],
    deeper: [
      {
        heading: 'What small bets do well',
        body: [
          'Small bets (a quarter to a third of the pot) are cheap bluffs and get called by a wide range, which is useful when you have many hands with modest value. They are efficient when your range is much stronger and the opponent has many weak hands: any bet makes them fold their worst hands, and a small one does it cheaply.',
          'The downside is that small bets give draws a good price and make it easy for the opponent to continue with medium hands.',
        ],
      },
      {
        heading: 'What large bets do well',
        body: [
          'Large bets (two-thirds of the pot and up) put pressure on medium hands and charge draws heavily. They are best when your range contains many very strong hands and the opponent’s does not, because the opponent then has to fold many hands that would beat your bluffs.',
          'The downside is that large bets risk more when you are wrong, and they fold out weak hands you would rather get value from.',
        ],
      },
    ],
    apply: [
      'Range advantage and many weak opponent hands → lean small.',
      'Nut advantage and medium opponent hands → lean large.',
      'Wet board with draws to charge → lean larger.',
      'Use the same size for value and bluffs in the same spot.',
    ],
    examples: [
      {
        title: 'Same board, two sizes',
        steps: [
          'Button vs big blind, flop A♠ 7♦ 2♣. The button has many more strong aces.',
          'Small bet (⅓ pot) with most of the range: the big blind folds many small hands, calls with 7x, 2x and weak aces.',
          'A large bet here would fold almost everything except strong aces, so the button would win little with its value hands. Small is better.',
        ],
      },
    ],
    quiz: [
      { q: 'Which suits a large bet?', options: ['A nut advantage on a wet board', 'A dry board where the opponent has nothing', 'Every situation'], answer: 0, explain: 'Large bets pressure medium hands and charge draws when you have the stronger top.' },
      { q: 'Why use the same size for value and bluffs?', options: ['So the size does not reveal your hand', 'Because it is required', 'It is not important'], answer: 0, explain: 'Different sizes for value and bluffs are easy to read.' },
    ],
  },

  'geometric-sizing': {
    terms: [
      ['Geometric sizing', 'Betting the same pot fraction on each street so the stack goes in by the river.'],
      ['SPR', 'Stack-to-pot ratio.'],
      ['Streets remaining', 'How many betting rounds are left.'],
      ['Shove', 'Betting all remaining chips.'],
    ],
    deeper: [
      {
        heading: 'The formula in words',
        body: [
          'If you bet a fraction f of the pot and get called, the pot grows by a factor of (1 + 2f). After n such bets it has grown by (1 + 2f)ⁿ. You want the stack to be all in after the last bet: f = ((2 × SPR + 1)^(1/n) − 1) / 2.',
          'With SPR 4 and two streets left, f = (9^(1/2) − 1)/2 = 1, a pot-size bet each street. With SPR 9.5 and three streets, f = (20^(1/3) − 1)/2 ≈ 0.86.',
        ],
      },
      {
        heading: 'When to use it',
        body: [
          'Geometric sizing is a reference for strong hands and polarized ranges: it gets the most money in by the river against a hand that calls every street. Many real strategies use smaller sizes on early streets (with wider ranges) and bigger ones later, but knowing the geometric size tells you whether you are on track.',
          'If your sizes are too small early, you end up making a huge overbet on the river or leaving money behind. If they are too big early, you may fold out the hands that would have paid you on later streets.',
        ],
      },
    ],
    apply: [
      'Work out the SPR when you start betting.',
      'Count the streets left.',
      'Use the geometric fraction as a guide for strong hands.',
      'Adjust down when the opponent will only call smaller bets, up when draws need charging.',
    ],
    examples: [
      {
        title: 'Two streets, SPR 2',
        steps: [
          'Turn: pot 20bb, stacks 40bb (SPR 2). You have a strong hand.',
          'Geometric fraction: (2 × 2 + 1)^(1/2) = √5 ≈ 2.24, so f ≈ 0.62. Bet about 12.4bb on the turn.',
          'If called, the pot is about 44.8bb and you have 27.6bb left, also about 0.62 of the pot, as a river shove.',
        ],
      },
    ],
    quiz: [
      { q: 'SPR 4, two streets left. Geometric bet size?', options: ['½ pot', '¾ pot', 'Pot'], answer: 2, explain: '(2 × 4 + 1)^(1/2) = 3, so f = (3 − 1)/2 = 1.' },
      { q: 'If you bet a third of the pot and get called, the pot grows by…', options: ['⅓', '⅔', 'Double'], answer: 1, explain: 'Bet plus call adds 2 × ⅓ of the old pot.' },
    ],
  },

  'overbets-underbets': {
    terms: [
      ['Overbet', 'A bet larger than the pot.'],
      ['Underbet', 'A very small bet, often under a quarter of the pot.'],
      ['Capped range', 'A range that cannot hold the nuts.'],
      ['Nut advantage', 'Having more of the strongest hands.'],
    ],
    deeper: [
      {
        heading: 'When overbets work',
        body: [
          'Overbets work when your range contains hands the opponent’s cannot, typically because the opponent capped their range earlier. For example, if they called the flop and turn without raising, they rarely have a set on a dry board, but you might. An overbet then puts maximum pressure on their one-pair hands.',
          'The bluffs in an overbetting range should block the opponent’s best calls (for example holding the ace of the flush suit) and have little showdown value.',
        ],
      },
      {
        heading: 'When underbets work',
        body: [
          'Very small bets work when your whole range is ahead and the opponent has many weak hands, for example on boards that strongly favor the preflop raiser. They also work as cheap probes and block bets on the river.',
          'Underbets are easy to raise, so they should not come from a range that cannot stand a raise unless the opponent rarely raises.',
        ],
      },
    ],
    apply: [
      'Overbet when you have a clear nut advantage and the opponent is capped.',
      'Choose overbet bluffs that block their best calling hands.',
      'Underbet when your range is far ahead and they hold many weak hands.',
      'Do not overbet medium-strength hands; they rarely get called by worse.',
    ],
    examples: [
      {
        title: 'River overbet against a capped range',
        steps: [
          'You raised preflop and bet the flop and turn on K♠ 8♦ 3♣ 2♥, and the opponent called both times. River: 5♦.',
          'Their range is mostly kings and 8x hands; they would have raised sets and two pair earlier at least some of the time.',
          'You hold K♦ K♣ (top set). A 1.5× pot overbet gets called by many kings and puts maximum pressure on them.',
        ],
      },
    ],
    quiz: [
      { q: 'A 1.5× pot bluff needs to work how often to break even?', options: ['40%', '50%', '60%'], answer: 2, explain: '1.5 / 2.5 = 60%.' },
    ],
  },

  'polarized-merged': {
    terms: [
      ['Polarized range', 'A betting range of strong hands and bluffs.'],
      ['Merged range', 'A betting range that includes medium-strength hands for thin value.'],
      ['Bluff-catcher', 'A hand that beats only bluffs.'],
      ['Showdown value', 'The chance to win without betting.'],
    ],
    deeper: [
      {
        heading: 'Which structure suits which size',
        body: [
          'A polarized range goes with large bets: the strong hands want a big pot and the bluffs want maximum fold equity. The middle hands check, because they would rather see a showdown than face a raise.',
          'A merged range goes with smaller bets: you bet a wide band of hands that are ahead of the opponent’s calling range, including medium ones. This works when the opponent calls with many worse hands.',
        ],
      },
      {
        heading: 'Reading the opponent’s structure',
        body: [
          'When an opponent makes a big bet after a passive line, their range is often polarized. Your medium hands become bluff-catchers: you decide based on the price and how often they bluff.',
          'When an opponent makes a small bet, their range is often merged: it contains many medium hands, and raising can sometimes fold out better hands or get value from worse ones.',
        ],
      },
    ],
    apply: [
      'Big bet → polarized range; check your medium hands.',
      'Small bet → merged range; include more medium hands.',
      'Against a big bet, treat medium hands as bluff-catchers.',
      'Against small bets, consider raising strong hands and some bluffs.',
    ],
    examples: [
      {
        title: 'River with a medium hand',
        steps: [
          'River: J♠ 9♦ 4♣ 2♠ 6♥, you hold J♥ 8♥ in position and the opponent checks.',
          'A large bet would fold most worse hands and get called by better jacks. Not a good polarized bet.',
          'A small bet could get called by 9x, 4x and weaker jacks against a loose player: a merged value bet. Against a tight player, checking is better.',
        ],
      },
    ],
    quiz: [
      { q: 'Against a polarized river bet, a medium pair is…', options: ['A bluff-catcher', 'A value raise', 'Always a fold'], answer: 0, explain: 'It beats the bluffs and loses to the value.' },
    ],
  },

  'sizing-continuing-range': {
    terms: [
      ['Continuing range', 'The hands that call or raise.'],
      ['Value target', 'The worse hands you want to call your value bets.'],
      ['Bluff target', 'The better hands you want to fold to your bluffs.'],
      ['Elastic / inelastic', 'Whether an opponent’s calling range changes a lot or a little with size.'],
    ],
    deeper: [
      {
        heading: 'Calling ranges shrink as size grows',
        body: [
          'Against a small bet, most pairs and draws continue. Against a medium bet, weak pairs and weak draws start to fold. Against a large bet, only strong pairs, good draws and better continue. The app’s reviews show this directly in the “continue vs fold” breakdown for each size.',
          'This means your value targets change with size. A large bet only gets called by strong hands, so your value hand must beat those. A small bet is called by weaker hands, so a medium hand can bet for value.',
        ],
      },
      {
        heading: 'Elastic and inelastic opponents',
        body: [
          'Some players fold more as the bet gets bigger, which is the expected response (elastic). Others call or fold based on their hand, almost regardless of size (inelastic). Against inelastic callers, bet bigger with value hands because they pay anyway. Against inelastic folders, bluff smaller because they fold anyway.',
          'Recognizing which type you face is one of the most valuable sizing reads.',
        ],
      },
    ],
    apply: [
      'For each size you consider, name the hands that continue.',
      'Check that your value hands beat the continuing range at that size.',
      'Against players who call regardless of size, bet bigger for value.',
      'Against players who fold regardless of size, bluff smaller.',
    ],
    examples: [
      {
        title: 'Watching the line move',
        steps: [
          'Flop: Q♥ 8♣ 4♦, big blind facing a c-bet.',
          '⅓ pot: the big blind continues with most pairs, gutshots, backdoor draws with overcards.',
          '¾ pot: it folds most gutshots without overcards, weak 4x hands and some 8x.',
          'Pot: it continues mostly with queens, strong 8x, sets and the best draws.',
        ],
      },
    ],
    quiz: [
      { q: 'A larger bet usually makes the calling range…', options: ['Stronger', 'Weaker', 'Unchanged'], answer: 0, explain: 'Weaker hands drop out.' },
    ],
  },

  'sizing-stack-board': {
    terms: [
      ['SPR', 'Stack-to-pot ratio.'],
      ['Wet board', 'A board with many draws.'],
      ['Commitment', 'When folding is rarely right because of how much is already in.'],
      ['Street count', 'The number of betting rounds left.'],
    ],
    deeper: [
      {
        heading: 'Stack depth',
        body: [
          'At low SPR, you need fewer or smaller bets to get all-in, and the hands that want to commit are wider. At high SPR, you need large bets on several streets to get stacks in, and only very strong hands want that.',
          'This is why 3-bet pots often use smaller flop bets (a quarter to a third of the pot): the stack is already small compared with the pot, so even small bets build towards all-in.',
        ],
      },
      {
        heading: 'Board and streets',
        body: [
          'On wet boards, bigger bets charge draws and protect vulnerable value. On dry boards, smaller bets lose little, because the opponent has few draws to charge.',
          'With three streets to go, sizes can be modest; on the river there is nothing left to protect, so the size is purely about value and fold equity.',
        ],
      },
    ],
    apply: [
      'Low SPR: smaller bets are enough; commit with good hands.',
      'High SPR: plan bigger bets with strong hands across several streets.',
      'Wet boards: larger. Dry boards: smaller.',
      'River: choose the size purely for value (who calls) or fold equity (who folds).',
    ],
    examples: [
      {
        title: 'Same hand, different SPR',
        steps: [
          'You hold A♠ A♦ on Q♣ 8♦ 3♥.',
          'In a 4-bet pot with SPR 1.2, a small bet commits everyone and you will happily go all-in.',
          'In a single-raised pot with SPR 12, you need large bets on several streets to get the stacks in, and you should be more careful if the opponent raises.',
        ],
      },
    ],
    quiz: [
      { q: 'Why do 3-bet pots often use small flop bets?', options: ['The SPR is low, so small bets still build towards all-in', 'Small bets are always best', 'To slow-play'], answer: 0, explain: 'With low SPR, there is less room, so small sizes are enough.' },
      { q: 'On which board does a bigger bet make most sense?', options: ['K♠ 7♦ 2♣', 'J♥ T♥ 9♣'], answer: 1, explain: 'More draws to charge and value to protect.' },
    ],
  },

  'exploitative-sizing': {
    terms: [
      ['Size tell', 'A pattern where a player’s bet size reveals their hand strength.'],
      ['Station', 'A player who calls too often.'],
      ['Nit', 'A very tight player who folds too often.'],
      ['Elasticity', 'How much a player’s calls depend on the bet size.'],
    ],
    deeper: [
      {
        heading: 'Common exploitative sizing adjustments',
        body: [
          'Against players who call too much, bet bigger with value hands and bluff less. They will pay off the larger size. Against players who fold too much, bluff with small sizes, because they fold anyway, and value-bet smaller, because they only call with strong hands.',
          'Against players who raise small bets a lot, bet larger or check more with weak hands to avoid being pushed off your equity.',
        ],
      },
      {
        heading: 'Spotting size tells',
        body: [
          'Many players bet bigger with strong hands and smaller with weak ones, or the reverse. Watch for consistent patterns at showdown. A player who always overbets the nuts and bets small with bluffs gives you a clear exploit: fold to their overbets and call or raise their small bets.',
          'Avoid giving size tells yourself: use the same sizes for value and bluffs in the same spot.',
        ],
      },
    ],
    apply: [
      'Station: bigger value bets, fewer bluffs.',
      'Nit: small bluffs, smaller value bets.',
      'Watch for size patterns at showdown; note them.',
      'Keep your own value and bluff sizes the same.',
    ],
    examples: [
      {
        title: 'Two opponents, same river',
        steps: [
          'River, you have top pair, good kicker and a missed draw in different hands.',
          'Against a station: bet ¾ to pot with top pair, check the missed draw.',
          'Against a nit: bet small with top pair (they only call with better or similar), and bluff small with the missed draw if they have shown weakness.',
        ],
      },
    ],
    quiz: [
      { q: 'A player bets big only with strong hands. Your best response?', options: ['Fold more to their big bets', 'Call every big bet', 'Ignore it'], answer: 0, explain: 'Their big bets are rarely bluffs.' },
    ],
  },
};
