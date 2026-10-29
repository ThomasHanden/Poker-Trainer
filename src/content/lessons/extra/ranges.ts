import type { LessonExtra } from '../types';

export const RANGES_X: Record<string, LessonExtra> = {
  'constructing-ranges': {
    terms: [
      ['Opening range', 'The hands you raise first in from a seat.'],
      ['Continuing range', 'The hands that call or raise after a bet.'],
      ['Range notation', 'Short text for ranges, such as 22+, A2s+, KTo+.'],
      ['Baseline', 'A sensible default range before adjusting for opponents.'],
    ],
    deeper: [
      {
        heading: 'Start from a baseline, then adjust',
        body: [
          'Building a range from scratch is hard. Start from a baseline (the charts in the Ranges tab), then adjust for the game: tighter against aggressive players behind you, wider against tight blinds, tighter with high rake, wider with antes.',
          'Write your ranges down in range notation and save them. That makes it easy to compare them with the reference charts and see exactly where you differ.',
        ],
      },
      {
        heading: 'Reading opponents’ ranges',
        body: [
          'For opponents, start from what most players do in that spot, then use what you know about them. A tight player’s early-position open is narrower than the chart; a loose player’s cold call includes many more weak hands.',
          'Pay attention to what is missing. A player who just calls preflop rarely has AA or KK (most would raise them). A player who checks back the flop rarely has their best hands.',
        ],
      },
    ],
    apply: [
      'Use a baseline chart for each common spot.',
      'Save your own versions and compare them with the baseline.',
      'For opponents, adjust the baseline using what you know about them.',
      'Always ask which strong hands are missing from their range.',
    ],
    examples: [
      {
        title: 'Building a button opening range in steps',
        steps: [
          'Start with every pair, every suited ace and every suited king.',
          'Add suited queens down to about Q4s, suited jacks to about J6s, and suited connectors and one-gappers down to about 53s.',
          'Add offsuit aces, offsuit broadways and the best offsuit kings and connectors.',
          'Check the total: around 40–50% is a typical button open at 100bb.',
        ],
      },
    ],
    quiz: [
      { q: 'What does “A2s+” mean?', options: ['A2s through AKs', 'A2s only', 'Any ace'], answer: 0, explain: 'All suited aces from A2s up to AKs.' },
      { q: 'A player flat-calls an open. What is usually missing from their range?', options: ['Their best hands (AA, KK)', 'Small pairs', 'Suited connectors'], answer: 0, explain: 'Most players 3-bet their best hands.' },
    ],
  },

  'weighted-combos': {
    terms: [
      ['Weight', 'How often a hand is included, from 0% to 100%.'],
      ['Mixed hand', 'A hand played in more than one way at some frequency.'],
      ['Weighted combos', 'Combos multiplied by their weight.'],
      ['Frequency', 'How often an action is taken.'],
    ],
    deeper: [
      {
        heading: 'Why weights exist',
        body: [
          'Real ranges are rarely all-or-nothing. A player might open 76s half the time from the hijack, or 3-bet A5s a quarter of the time. Weights capture this. In the editor, the fill height of a cell shows the weight.',
          'For opponents, weights also express uncertainty: “they have AQo here sometimes” can be written as AQo at 50%.',
        ],
      },
      {
        heading: 'Counting with weights',
        body: [
          'Multiply each hand’s combos by its weight. 76s at 50% is 4 × 0.5 = 2 combos. TT at 25% is 6 × 0.25 = 1.5 combos. Add these up for the total.',
          'This lets you compare parts of a range fairly: 2 combos of 76s and 1.5 of TT are close, even though TT feels more “present”.',
        ],
      },
    ],
    apply: [
      'Use weights for hands you play sometimes, or are unsure about.',
      'Count weighted combos: combos × weight.',
      'Compare categories by weighted combos, not hand names.',
      'Use the editor’s brushes to paint weights.',
    ],
    examples: [
      {
        title: 'A weighted 3-bet range',
        steps: [
          'Range: QQ+ (18 combos), AK (16), A5s at 50% (2), KQs at 50% (2).',
          'Total: 38 weighted combos.',
          'Value (QQ+, AK) is 34 of 38: about 89%. Bluffs (A5s, KQs as semi-bluff) are about 11%.',
        ],
      },
    ],
    quiz: [
      { q: 'AJo at 25%: how many weighted combos?', options: ['1', '3', '12'], answer: 1, explain: '12 × 0.25 = 3.' },
      { q: 'Why use weights for opponents?', options: ['To express uncertainty and mixing', 'To make ranges bigger', 'They are not useful'], answer: 0, explain: 'Weights capture “sometimes”.' },
    ],
  },

  'narrowing-ranges': {
    terms: [
      ['Bayesian updating', 'Adjusting how likely each hand is based on how likely it was to take the observed action.'],
      ['Likelihood', 'How likely a hand is to take an action.'],
      ['Prior', 'The range before the new action.'],
      ['Posterior', 'The range after taking the action into account.'],
    ],
    deeper: [
      {
        heading: 'Every action is evidence',
        body: [
          'When an opponent acts, ask how likely each hand in their range was to take that action. Hands that would always take it keep their full weight; hands that would rarely take it lose most of theirs. This is how the app’s opponents update ranges, and it is a good habit for you too.',
          'Strong actions (raises, big bets) remove weak hands. Passive actions (checks, calls) remove some strong hands, but often not all, because strong hands sometimes slow-play.',
        ],
      },
      {
        heading: 'Avoiding over-narrowing',
        body: [
          'A common mistake is to narrow too fast: “they called, so they must have a draw”. In reality calls include pairs, draws and some strong hands. Keep categories, with rough weights, rather than one hand.',
          'Another mistake is ignoring the size. A small bet and a big bet narrow differently: small bets come from wide ranges, big bets from polarised ones.',
        ],
      },
    ],
    apply: [
      'Start from their range before the action.',
      'Ask how likely each category was to take the action.',
      'Reduce weights for unlikely categories; keep likely ones.',
      'Keep several categories in mind, not one hand.',
    ],
    examples: [
      {
        title: 'Narrowing a check-raise',
        steps: [
          'Big blind defends wide; flop 9♠ 7♠ 3♦; you c-bet small; they check-raise.',
          'Strong hands (sets, 97, 98, 76 with draws) check-raise often. Flush draws and straight draws check-raise sometimes. Weak pairs almost never do.',
          'Their range after the raise: mostly sets, two pair, strong draws. Your one-pair hands are now in a much worse spot than against their range before the raise.',
        ],
      },
    ],
    quiz: [
      { q: 'A tight player makes a big river raise. Which part of their range is most likely?', options: ['Strong value hands', 'Missed draws', 'Weak pairs'], answer: 0, explain: 'Tight players rarely bluff-raise big.' },
      { q: 'A small bet usually comes from…', options: ['A wide range', 'Only the nuts'], answer: 0, explain: 'Small bets are cheap and used with many hands.' },
    ],
  },

  blockers: {
    terms: [
      ['Blocker', 'A card you hold that reduces the opponent’s combos of certain hands.'],
      ['Unblocker', 'A card that does not block (or blocks the hands you want them to have).'],
      ['Nut blocker', 'A card that removes the opponent’s strongest possible hand, such as the ace of a flush suit.'],
      ['Card removal', 'The general effect of known cards on combos.'],
    ],
    deeper: [
      {
        heading: 'Blockers for bluffs',
        body: [
          'A good bluff blocks the hands that would call you and does not block the hands that would fold. On a three-flush river, holding the ace of that suit means the opponent cannot have the nut flush, so your bluff is called less often.',
          'Avoid bluffing with hands that block the opponent’s folds. If the opponent’s missed draws are the hands that fold, and you hold a card from those draws, you have made those folds less likely.',
        ],
      },
      {
        heading: 'Blockers for calls',
        body: [
          'When calling, you want to block the opponent’s value hands and unblock their bluffs. For example, holding a card that appears in their likely value bets (top pair) reduces those combos and raises the share of bluffs.',
          'Blockers adjust close decisions. They rarely turn a clear fold into a call or a clear bluff into a good one on their own.',
        ],
      },
    ],
    apply: [
      'For bluffs: block their calls, unblock their folds.',
      'For calls: block their value, unblock their bluffs.',
      'Use blockers to choose between similar hands, not to override clear decisions.',
      'Count the combos your blocker removes before relying on it.',
    ],
    examples: [
      {
        title: 'Choosing a bluff when the flush misses',
        steps: [
          'Board: A♣ 9♥ 6♥ 3♠ 2♦. The hearts missed. The opponent check-calls with aces and 9x and folds missed heart draws and small pairs.',
          'Hand A: K♥ Q♥. Your hearts remove some of the opponent’s missed heart draws — exactly the hands that would fold. That makes the bluff work less often.',
          'Hand B: K♠ Q♠. No hearts, so all of their missed draws are still there to fold. This is the better bluff.',
          'A hand with an ace would block their calls even more, but it has showdown value, so it usually checks instead.',
        ],
      },
    ],
    quiz: [
      { q: 'On a three-heart river, which hand is the best bluff?', options: ['A♥ with nothing else', 'A hand with no hearts', 'A small heart'], answer: 0, explain: 'The A♥ blocks the nut flush.' },
      { q: 'When bluff-catching, you prefer to block…', options: ['Their value hands', 'Their bluffs'], answer: 0, explain: 'That raises the share of bluffs you face.' },
    ],
  },

  'capped-uncapped': {
    terms: [
      ['Capped range', 'A range missing its strongest hands.'],
      ['Uncapped range', 'A range that can still contain the nuts.'],
      ['Slow-play', 'Playing a strong hand passively to disguise it.'],
      ['Range protection', 'Keeping some strong hands in passive lines.'],
    ],
    deeper: [
      {
        heading: 'How ranges get capped',
        body: [
          'Ranges become capped when a player takes a passive line that strong hands would usually avoid. Flat-calling preflop caps a range (no AA or KK, most of the time). Checking back the flop caps it (no sets on wet boards, usually). Calling instead of raising on wet boards caps it a little.',
          'An uncapped player can bet very big, because they could hold the nuts. A capped player cannot easily do this, which limits how much pressure they can apply.',
        ],
      },
      {
        heading: 'Attacking and protecting',
        body: [
          'When your opponent is capped and you are not, larger bets and overbets become strong: their best hands are medium hands that do not want to call big bets.',
          'To avoid being capped yourself, keep a few strong hands in your passive lines: check back some sets on dry boards, flat some strong pairs preflop in position. This is not needed against every opponent, but it stops observant players from attacking your checks.',
        ],
      },
    ],
    apply: [
      'Track who has been passive: their range is probably capped.',
      'Against a capped range with an uncapped range, size up.',
      'Keep some strong hands in your own passive lines.',
      'Do not assume a cap against tricky players who slow-play often.',
    ],
    examples: [
      {
        title: 'Check-back caps the range',
        steps: [
          'You call the button’s open from the big blind. Flop: Q♥ 9♥ 4♣, checked through.',
          'The button would usually bet strong hands like sets, two pair and strong queens on this wet board. Its checked range is capped: mostly medium and weak hands, plus some draws.',
          'On the turn, you can bet larger with strong hands and good draws, because the button rarely has a hand that wants to call big.',
        ],
      },
    ],
    quiz: [
      { q: 'Which action usually caps a range the most?', options: ['Checking back a wet flop', 'Raising the flop', 'Shoving'], answer: 0, explain: 'Strong hands usually bet wet flops.' },
      { q: 'Against a capped opponent, you can often…', options: ['Bet larger', 'Never bet', 'Only check'], answer: 0, explain: 'Their best hands do not like large bets.' },
    ],
  },

  'range-board-interaction': {
    terms: [
      ['Range-board fit', 'How well a preflop range hits a given flop.'],
      ['High-card board', 'A flop with an ace or king, often good for the preflop raiser.'],
      ['Low connected board', 'A flop like 7-6-5, often good for wide defending ranges.'],
      ['Equity distribution', 'How a range’s equity is spread across strong, medium and weak hands.'],
    ],
    deeper: [
      {
        heading: 'Predict before you look',
        body: [
          'Before you look at your own two cards, ask how the board hits each range. A raiser’s range from early position has many big cards and big pairs, so ace- and king-high boards suit it. A big-blind defending range has many small suited and connected hands, so low connected boards suit it.',
          'This one question explains most c-bet strategies: bet often on boards that suit your range, and check more on boards that suit theirs.',
        ],
      },
      {
        heading: 'Equity distribution, not just average',
        body: [
          'Two ranges can have similar average equity but different distributions. One might have many medium hands; the other many strong and many weak ones. The second range can bet bigger and more polarised. The first wants smaller bets or checks.',
          'The range-practice drill “Who does the board favour?” trains exactly this.',
        ],
      },
    ],
    apply: [
      'Before looking at your hand, decide whose range the board favours.',
      'High boards: usually the raiser. Low connected boards: usually the caller.',
      'Check whether the advantage is in the top (nut advantage) or the middle.',
      'Use this to choose your betting frequency and size.',
    ],
    examples: [
      {
        title: 'Three flops, one matchup',
        steps: [
          'UTG opens, the big blind calls.',
          'A♠ K♦ 4♣: strongly favours UTG — many AK, AQ, AA, KK.',
          '8♥ 7♥ 5♣: favours the big blind, which has more 96, 64, 87, 75 and small sets.',
          'Q♣ 8♦ 3♠: closer, but UTG still has more overpairs and strong queens.',
        ],
      },
    ],
    quiz: [
      { q: 'Which flop most favours a big-blind defending range against a UTG open?', options: ['A♠ K♦ 4♣', '7♥ 6♥ 5♣', 'K♠ Q♦ 2♣'], answer: 1, explain: 'Low and connected: the BB has more of these hands.' },
      { q: 'Should you decide whose board it is before or after looking at your hand?', options: ['Before', 'After'], answer: 0, explain: 'It is a range question first.' },
    ],
  },

  'value-bluff-composition': {
    terms: [
      ['Value hand', 'A hand that wants to be called.'],
      ['Bluff', 'A hand that wants a fold.'],
      ['Composition', 'The mix of value and bluffs in a betting range.'],
      ['Over-bluffing / under-bluffing', 'Too many / too few bluffs for the size.'],
    ],
    deeper: [
      {
        heading: 'Building the betting range',
        body: [
          'Start with the value hands: the hands that beat enough of the opponent’s calling range at your chosen size. Then add bluffs in proportion. On the river, the toy-model ratio is bet ÷ (pot + 2 × bet) of the range; on earlier streets, more bluffs are fine because they have equity.',
          'Choose bluffs that have no showdown value (they cannot win by checking) and good blockers. Do not bluff with medium hands that could win at showdown.',
        ],
      },
      {
        heading: 'Why it matters',
        body: [
          'With too few bluffs, observant opponents fold everything but strong hands, and your value bets get paid less. With too many, they call wide and your bluffs lose money.',
          'Most players at low stakes under-bluff, especially in big pots. A good default is to under-bluff slightly against unknown players and adjust as you learn.',
        ],
      },
    ],
    apply: [
      'Count your value hands for the size.',
      'Add bluffs: on the river, about bet ÷ (pot + 2 × bet) of the range.',
      'Bluff with no-showdown hands that have good blockers.',
      'Adjust toward fewer bluffs against stations and more against folders.',
    ],
    examples: [
      {
        title: 'River pot-size bet composition',
        steps: [
          'Value: 20 combos of sets and two pair.',
          'Pot-size bet: bluffs should be about 1/3 of the range, so about 10 bluff combos.',
          'You have 25 missed-draw combos. Choose the 10 with the best blockers and check the rest.',
        ],
      },
    ],
    quiz: [
      { q: 'With 30 value combos and a pot-size river bet, about how many bluffs?', options: ['10', '15', '30'], answer: 1, explain: 'Bluffs = 1/3 of the range → 30 × 0.5 = 15.' },
      { q: 'Which hand should usually NOT be a river bluff?', options: ['A missed draw', 'Second pair with showdown value', 'Ace-high with a key blocker'], answer: 1, explain: 'It can win by checking.' },
    ],
  },

  'mixed-strategies': {
    terms: [
      ['Mixed strategy', 'Playing the same hand in different ways at set frequencies.'],
      ['Indifference', 'When two actions have equal EV for a hand.'],
      ['Pure strategy', 'Always taking the same action with a hand.'],
      ['Randomiser', 'A way to pick actions at frequencies, such as the second hand of a watch.'],
    ],
    deeper: [
      {
        heading: 'Why equilibrium strategies mix',
        body: [
          'At equilibrium, some hands are on the border between two actions: both have the same EV. Mixing them keeps the overall range balanced, so the opponent cannot exploit either line. If you always bet a hand, the opponent can adjust; mixing makes that harder.',
          'For hands in the middle of a mix, the EV difference between the actions is often tiny. This is why the app’s reviews treat several actions as “good” in close spots.',
        ],
      },
      {
        heading: 'Mixing in practice',
        body: [
          'You do not need exact frequencies. Use simple rules: “I bet this hand half the time”, and use a randomiser (the second hand of a clock, the colour of a card) to choose. Or mix by similar hands: bet the hands with a backdoor flush draw and check the others.',
          'Against weak opponents, pure exploitative strategies are often better than mixing. Mixing matters most against strong opponents who adapt.',
        ],
      },
    ],
    apply: [
      'Notice spots where two actions are close in EV.',
      'Mix by hand features (e.g. backdoor draws bet, the rest check).',
      'Or use a simple randomiser for frequencies.',
      'Against weaker players, prefer the exploitative pure action.',
    ],
    examples: [
      {
        title: 'Mixing by hand features',
        steps: [
          'You plan to c-bet about half of your medium pairs on K♠ 7♦ 2♣.',
          'Rule: bet the ones with a spade (backdoor flush draw), check the rest.',
          'That produces a roughly 50% mix, with the better-equity hands in the betting range.',
        ],
      },
    ],
    quiz: [
      { q: 'Why do equilibrium strategies mix some hands?', options: ['To stay hard to exploit when actions have equal EV', 'Because it is random', 'To confuse the dealer'], answer: 0, explain: 'Mixing balances the range at the margin.' },
      { q: 'Against a weak, non-adapting opponent you should usually…', options: ['Mix exactly', 'Use the best exploitative action'], answer: 1, explain: 'Exploits beat mixing against players who do not adjust.' },
    ],
  },

  'range-visualization': {
    terms: [
      ['13×13 grid', 'A matrix of all 169 starting-hand types.'],
      ['Diagonal', 'Pocket pairs from AA (top-left) to 22 (bottom-right).'],
      ['Above the diagonal', 'Suited hands.'],
      ['Below the diagonal', 'Offsuit hands.'],
    ],
    deeper: [
      {
        heading: 'How to read the grid quickly',
        body: [
          'The top row is ace-x suited (AKs to A2s). The left column is ace-x offsuit (AKo to A2o). Pairs run down the diagonal. Hands closer to the top-left are stronger in raw terms; hands near the diagonal are more connected.',
          'Typical opening ranges look like a triangle in the top-left plus a band along the diagonal (suited connectors and pairs) and a stretch along the top row (suited aces).',
        ],
      },
      {
        heading: 'Counting combos visually',
        body: [
          'Each pair cell is 6 combos, each suited cell 4, each offsuit cell 12. Offsuit cells count three times as much as suited ones, which is why adding a few offsuit hands widens a range much more than adding suited ones.',
          'The Ranges tab shows the share of each hand family (pairs, suited aces, offsuit broadways and so on) beside every chart to help you read this.',
        ],
      },
    ],
    apply: [
      'Find pairs on the diagonal, suited above, offsuit below.',
      'Remember offsuit cells are 12 combos, suited 4, pairs 6.',
      'Look for shapes: top-left triangle, diagonal band, top row.',
      'Use the family breakdown to compare ranges quickly.',
    ],
    examples: [
      {
        title: 'Why offsuit hands widen ranges fast',
        steps: [
          'Adding all suited connectors from 54s to T9s adds 6 cells × 4 = 24 combos (about 1.8% of hands).',
          'Adding KTo, QTo and JTo adds 3 cells × 12 = 36 combos (about 2.7%).',
          'Three offsuit cells add more combos than six suited ones.',
        ],
      },
    ],
    quiz: [
      { q: 'Where is A5s on the grid?', options: ['Top row', 'Left column', 'Diagonal'], answer: 0, explain: 'Suited aces are in the top row.' },
      { q: 'How many combos does one offsuit cell represent?', options: ['4', '6', '12'], answer: 2, explain: 'Offsuit non-pair hands have 12 combos.' },
    ],
  },
};
