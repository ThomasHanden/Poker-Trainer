import type { LessonExtra } from '../types';

export const PREFLOP_X: Record<string, LessonExtra> = {
  'starting-hands-position': {
    terms: [
      ['UTG / HJ / CO / BTN', 'Under the gun (first to act), hijack, cutoff and button — the 6-max seats from earliest to latest.'],
      ['Raise first in (RFI)', 'Opening the pot with a raise when everyone before you has folded.'],
      ['Domination', 'Sharing a card with a better hand, such as A9 against AK.'],
      ['VPIP', 'How often a player voluntarily puts money in preflop. A rough measure of how loose they are.'],
    ],
    deeper: [
      {
        heading: 'Why the number of players behind you matters',
        body: [
          'Each player still to act might hold a strong hand. If each of five players has roughly a 5% chance of a hand that will 3-bet you, the chance that at least one does is about 1 − 0.95⁵ ≈ 23%. With only two players behind (the blinds), it falls to about 10%.',
          'That is the main reason early-position ranges are tight: your hand has to do well against the stronger ranges you are more likely to meet, and you are less likely to steal the blinds outright.',
        ],
      },
      {
        heading: 'What makes a hand good from early position',
        body: [
          'From early seats, prefer hands that make strong top pairs or better without being dominated: big pairs, AK, AQ, AJs, KQs, and suited aces (which make the nut flush). Medium pairs and the best suited connectors are fine because they make sets and strong draws.',
          'Hands that look nice but cause trouble are offsuit hands with a weak kicker (KTo, QJo, A9o) and small offsuit connectors. They make second-best hands against the ranges that continue.',
        ],
      },
      {
        heading: 'Widening toward the button',
        body: [
          'From the cutoff and button, add more suited kings and queens, more suited connectors and gappers, and more offsuit broadways. These hands profit because you will often win the blinds immediately and you will have position when called.',
          'The small blind is a special case: it acts before only the big blind preflop but is out of position for the rest of the hand. Many strategies open it fairly wide but raise larger (about 3bb), or mix raising and limping.',
        ],
      },
    ],
    apply: [
      'Count the players left to act. More players means a tighter range.',
      'From early position, cut offsuit hands with weak kickers first.',
      'From late position, add suited hands and connectors before weak offsuit hands.',
      'Check the Ranges tab (“Show changes vs …”) to see exactly what each seat adds.',
    ],
    examples: [
      {
        title: 'Same hand, three seats: Q♣ J♦',
        steps: [
          'UTG: borderline. It is dominated by AQ, KQ and AJ, which are common in the ranges that continue against you. The baseline mixes it.',
          'Cutoff: a standard open. Fewer players remain and the blinds often fold.',
          'Button: an easy open. You will have position against whichever blind calls.',
        ],
      },
    ],
    quiz: [
      { q: 'Which hand loses the most value when moved from the button to UTG?', options: ['KTo', 'QQ', 'AKs'], answer: 0, explain: 'KTo is dominated by much of an early-position calling range; premium hands play well anywhere.' },
      { q: 'About what share of hands does the app’s 6-max button chart open?', options: ['About 15%', 'About 45%', 'About 80%'], answer: 1, explain: 'Roughly 45% at 100bb in this illustrative chart.' },
    ],
  },

  'opening-ranges': {
    terms: [
      ['Open-raise', 'The first raise preflop.'],
      ['Limp', 'Calling the big blind instead of raising. Usually weaker than raising when first in.'],
      ['Steal', 'An open from late position aimed mostly at winning the blinds.'],
      ['Sizing tell', 'Information given away by changing your bet size with hand strength.'],
    ],
    deeper: [
      {
        heading: 'Why raise instead of limp',
        body: [
          'A raise wins the blinds outright some of the time, takes the initiative into the flop, and builds the pot when you have a strong hand. A limp does none of these. It invites several players in cheaply, and you rarely win without a showdown.',
          'There are exceptions: some strategies limp part of the small-blind range, and very passive live games can make limping some hands acceptable. As a default, raise or fold.',
        ],
      },
      {
        heading: 'Choosing your size',
        body: [
          'Smaller opens are cheaper steals and lose less when you have to fold to a 3-bet. Larger opens charge the blinds more to call and make the pot bigger with your strong hands. The right size depends on the game: online cash games favour 2–2.5bb, live games often 3bb or more because players call more, and ante tournaments about 2–2.2bb.',
          'Adjust for specific opponents. Against blinds who call too much, open larger and tighter. Against blinds who 3-bet a lot, open smaller so their 3-bets win less.',
        ],
      },
    ],
    apply: [
      'Use one size per seat and situation for your whole range.',
      'Add about 1bb for each limper in front of you (see isolation raises).',
      'Open larger against blinds who call too much; smaller against blinds who 3-bet a lot.',
      'Only open-limp in spots where you have a specific reason to.',
    ],
    examples: [
      {
        title: 'Price of a steal at different sizes',
        steps: [
          'Blinds 0.5/1, no ante, button opens. Break-even fold frequencies (ignoring postflop play): 2bb → 2/3.5 = 57%; 2.5bb → 62.5%; 3bb → 3/4.5 = 67%.',
          'If the blinds together fold about 60% of the time, a 2bb open shows an immediate profit and a 3bb open does not.',
          'Real opens also win money when called, so these numbers are a floor, not the whole picture.',
        ],
      },
    ],
    quiz: [
      { q: 'Which is a reason to raise rather than limp when first in?', options: ['You can win the blinds immediately', 'It is cheaper', 'It makes the pot multiway'], answer: 0, explain: 'Raising gives fold equity and initiative.' },
      { q: 'The blinds call far too often. Your adjustment?', options: ['Open smaller with more hands', 'Open larger with a tighter, stronger range', 'Limp more'], answer: 1, explain: 'Charge them more with hands that are ahead of their calling range.' },
    ],
  },

  'calling-vs-raising': {
    terms: [
      ['Flat call', 'Calling a raise instead of re-raising.'],
      ['Closing the action', 'Calling when no one behind you can still act, so the flop comes next.'],
      ['Squeeze', 'A 3-bet after an open and one or more calls.'],
      ['Isolate', 'Raise to make the pot heads-up against one player.'],
    ],
    deeper: [
      {
        heading: 'The three-way choice',
        body: [
          'Against an open, each hand falls into fold, call or 3-bet. Strong hands 3-bet for value. Hands that play well after the flop and will have position can call. Hands that are too weak to call but have useful features (an ace blocker, suitedness) can be 3-bet as bluffs. Everything else folds.',
          'A good question for each hand: “Would I rather play this in a bigger pot with the initiative, or a smaller pot where I can see a flop cheaply?” Pairs and suited connectors usually prefer the small pot; AK and big pairs prefer the big one.',
        ],
      },
      {
        heading: 'Who is behind you matters',
        body: [
          'If you call with players still to act behind you, you risk being squeezed and forced to fold, losing your call. The more aggressive the players behind, the more your calling range should tighten and turn into 3-bets or folds.',
          'When you close the action (for example in the big blind), there is no squeeze risk, so you can call much wider.',
        ],
      },
    ],
    apply: [
      'Ask whether you will be in or out of position after the flop.',
      'Count the players behind you who could squeeze.',
      'Call with hands that play well postflop; 3-bet hands that want a big pot or make good bluffs.',
      'Fold dominated offsuit hands, especially out of position.',
    ],
    examples: [
      {
        title: 'Small blind facing a button open',
        steps: [
          'The button opens to 2.5bb. You hold 9♠ 9♦ in the small blind.',
          'A flat call leaves the big blind behind you with a great price, so the pot often becomes three-way with you out of position against both players.',
          'A 3-bet to about 11bb takes the initiative, often wins the pot, and plays heads-up against the button when called. That is why many strategies 3-bet or fold most hands from the small blind.',
        ],
      },
    ],
    quiz: [
      { q: 'Which spot best suits a flat call with 87s?', options: ['Button vs a cutoff open', 'Small blind vs a button open with an aggressive big blind', 'UTG+1 vs a UTG open'], answer: 0, explain: 'In position, with only the blinds behind.' },
      { q: 'Why can the big blind call wider than other seats?', options: ['It closes the action and already has 1bb in', 'It has position', 'It sees more cards'], answer: 0, explain: 'No squeeze risk and a discount on the call.' },
    ],
  },

  'three-four-betting': {
    terms: [
      ['3-bet', 'The first re-raise preflop (the blinds count as the first bet, the open as the second).'],
      ['4-bet', 'A re-raise of a 3-bet.'],
      ['Cold 4-bet', 'A 4-bet from a player who had not yet put money in the pot.'],
      ['SPR', 'Stack-to-pot ratio on the flop. Low in 3-bet and 4-bet pots.'],
    ],
    deeper: [
      {
        heading: 'Building a 3-bet range',
        body: [
          'Start with your value hands: the hands that are clearly ahead of the range that will call or 4-bet you. Against a late-position open that is often TT+, AQ+ and some KQs; against an early-position open it is tighter, often QQ+ and AK.',
          'Then add bluffs. The best candidates are hands that are not good enough to call but have blockers to the opponent’s strong continuing hands (an ace or a king) and can still make strong hands when called: A5s–A2s, K9s, suited connectors. A common starting point is roughly one to two bluffs for each value combo, adjusted for how often the opponent folds.',
        ],
      },
      {
        heading: 'Facing a 3-bet',
        body: [
          'Your continuing range against a 3-bet is much tighter than your opening range. In position, call with hands that play well (pairs, suited broadways, the best suited connectors) and 4-bet your best hands plus a few blockers. Out of position, calling becomes worse, so more hands either 4-bet or fold.',
          'Folding too often to 3-bets lets opponents 3-bet you with anything. If you open 25% of hands and continue only with the top 5%, you fold 80% of your opens to a 3-bet, which is far too often against an aggressive player.',
        ],
      },
    ],
    apply: [
      'Decide the value hands first, then add bluffs with blockers and playability.',
      '3-bet about 3× the open in position and about 4× out of position.',
      'Facing a 3-bet, continue with a range wide enough that you are not folding most of your opens.',
      'At 100bb, plan for 4-bet pots to be nearly all-in by the flop.',
    ],
    examples: [
      {
        title: 'How often are you folding to a 3-bet?',
        steps: [
          'You open the cutoff with about 29% of hands (about 385 combos).',
          'If you continue only with QQ+, AK (34 combos), you fold about 91% of the time.',
          'Adding calls with TT–JJ, AQs, AJs, KQs, JTs, T9s and some 4-bet bluffs (about 60 more combos) brings the fold rate down to roughly 75%. That is harder to exploit with light 3-bets.',
        ],
      },
    ],
    quiz: [
      { q: 'Which is the better 3-bet bluff against a button open?', options: ['A4s', 'K7o', '72o'], answer: 0, explain: 'An ace blocker plus straight and flush potential.' },
      { q: 'You open 30% and fold 90% of that to 3-bets. What can opponents do?', options: ['3-bet you with any two cards profitably', 'Nothing', 'They must call more'], answer: 0, explain: 'If you fold that often, a 3-bet bluff profits straight away.' },
    ],
  },

  'linear-polarized': {
    terms: [
      ['Linear (merged) range', 'A range made of the best hands down to a cutoff point.'],
      ['Polarised range', 'A range of very strong hands plus bluffs, with the middle removed.'],
      ['Condensed range', 'A range made mostly of medium-strength hands, often the result of calling.'],
      ['Blocker', 'A card in your hand that makes certain opponent hands less likely.'],
    ],
    deeper: [
      {
        heading: 'Why ranges take these shapes',
        body: [
          'If calling is a good option for your middle-strength hands, there is no need to 3-bet them, so your 3-bets become the hands that most want a big pot (value) plus hands that cannot call but benefit from fold equity (bluffs). That is a polarised range.',
          'If calling is not a good option, because you are out of position or there are players behind, then your middle hands either fold or raise. Raising the best of them for thin value gives a linear range.',
        ],
      },
      {
        heading: 'How the opponent changes the answer',
        body: [
          'Against opponents who call 3-bets with too many weaker hands, linear ranges earn more because AJ, KQ and TT are ahead of what calls. Against opponents who fold a lot, polarised ranges earn more because the bluffs win the pot often and the value hands still get action from the strongest part of their range.',
          'In practice most strategies are a blend: a mostly linear 3-bet from the small blind, and a more polarised 3-bet from the button or big blind.',
        ],
      },
    ],
    apply: [
      'If you can call profitably (in position, closing the action), polarise your 3-bets.',
      'If you cannot call (small blind, squeeze risk), use a more linear 3-bet.',
      'Against stations, make the range more linear; against folders, add more bluffs.',
      'Choose bluffs with blockers and playability, not random weak hands.',
    ],
    examples: [
      {
        title: 'Small blind vs button: linear',
        steps: [
          'The button opens and you are in the small blind. Calling is unattractive (out of position, big blind behind).',
          'A linear 3-bet range might include TT+, AT+, KQ, KJs, QJs and some suited connectors.',
          'Hands like A9o and KTo mostly fold rather than call.',
        ],
      },
    ],
    quiz: [
      { q: 'Which seat most often uses a linear 3-bet range?', options: ['Small blind vs button', 'Button vs cutoff', 'Big blind vs button'], answer: 0, explain: 'Calling from the small blind is poor, so medium hands raise or fold.' },
      { q: 'A polarised range contains…', options: ['Only medium hands', 'Strong hands and bluffs', 'Only bluffs'], answer: 1, explain: 'The middle is removed.' },
    ],
  },

  'blind-defense': {
    terms: [
      ['Defend', 'Continue (call or 3-bet) from the blinds against a steal.'],
      ['Price', 'How much equity you need to call, given the pot and the bet.'],
      ['Realisation factor', 'The share of raw equity a hand actually wins on average once later betting is accounted for.'],
      ['Blind vs blind', 'Pots where it folds to the small blind, who plays against the big blind.'],
    ],
    deeper: [
      {
        heading: 'Raw equity versus realised equity',
        body: [
          'The price tells you the raw equity needed if the hand went straight to showdown. Out of position you will not get there for free: you will face bets on the flop and turn and sometimes have to fold the best hand. Common estimates put out-of-position realisation at around 70–85% of raw equity for decent hands, and lower for weak offsuit hands.',
          'So if you need 27% to call and a hand has 33% raw equity but only realises 75% of it, it effectively has about 25%. That is just short. Suited and connected hands realise more and pass the test; weak offsuit hands often fail it.',
        ],
      },
      {
        heading: 'Using 3-bets from the big blind',
        body: [
          'If the big blind only ever calls, the opener can steal freely and never has to fear a big pot out of the blinds. A sensible 3-bet range mixes value (big pairs, AK, AQ) with bluffs that do not call well, such as A5s–A2s and some suited kings. This makes stealing more expensive for the opener.',
          'Against a button who opens very wide and folds often to 3-bets, the big blind can 3-bet more. Against a tight early-position opener, 3-bet mainly for value.',
        ],
      },
    ],
    apply: [
      'Work out the price: call ÷ (pot after you call).',
      'Lower your estimate for out-of-position play; raise it for suited and connected hands.',
      'Defend wider against late-position opens and small sizes; tighter against early opens and big sizes.',
      'Include some 3-bets so that openers cannot steal for free.',
    ],
    examples: [
      {
        title: 'Defending against two open sizes',
        steps: [
          'Button opens to 2bb: you call 1bb into a 4.5bb pot, needing about 22%. Many hands, including weak suited and connected ones, are clear defends.',
          'Button opens to 3bb: you call 2bb into 6.5bb, needing about 31%. Hands like J4s and 85o become folds.',
          'The opener pays for the bigger size by risking more when you fold, so both sizes can be fine for them. Your defend range just changes.',
        ],
      },
    ],
    quiz: [
      { q: 'Against a 3bb button open, what raw equity does the big blind need to call?', options: ['About 22%', 'About 27%', 'About 31%'], answer: 2, explain: 'Call 2bb into a final pot of 6.5bb: 2/6.5 ≈ 31%.' },
      { q: 'Why should the big blind 3-bet some hands instead of only calling?', options: ['So the opener cannot steal without fear', 'Because calling is never allowed', 'To make the pot multiway'], answer: 0, explain: 'A call-only strategy is easy to exploit.' },
    ],
  },

  'isolation-limped': {
    terms: [
      ['Limper', 'A player who called the big blind preflop without raising.'],
      ['Over-limp', 'Calling behind a limper.'],
      ['Limp-raise', 'Limping and then re-raising when someone raises behind. Often a sign of strength.'],
      ['Iso size', 'The raise size used to isolate a limper, usually your open plus about 1bb per limper.'],
    ],
    deeper: [
      {
        heading: 'Why limpers are a target',
        body: [
          'Most good players raise their strong hands, so a limp usually comes from a range without its best hands. Recreational players often limp a very wide range and then play fit-or-fold after the flop, which is easy to beat with a raise and a continuation bet.',
          'The goal of an iso-raise is to play heads-up against that weak range, ideally in position, with the initiative. The more players you let in, the less that works.',
        ],
      },
      {
        heading: 'Choosing hands to isolate with',
        body: [
          'Iso with hands that are ahead of a limping range and play well heads-up: pairs, broadways, good aces and suited kings. Against a player who calls raises a lot and then plays passively, lean toward value hands; against one who folds a lot to raises, you can iso wider.',
          'Hands that do best multiway — small pairs and suited connectors — can over-limp instead, especially when the blinds are passive and rarely raise.',
        ],
      },
    ],
    apply: [
      'Note who limped and how they play after the flop.',
      'Iso-raise to your open + about 1bb per limper, larger against players who call a lot.',
      'Prefer isolating in position; tighten up from the blinds.',
      'Respect limp-raises from players who rarely raise.',
    ],
    examples: [
      {
        title: 'Two limpers, one plan',
        steps: [
          'Two players limp. You are in the cutoff with A♠ T♣. Normal open is 2.5bb.',
          'Iso to about 4.5–5bb. That charges both limpers, and the button and blinds still to act, enough that you usually play heads-up.',
          'If both limpers call, you are in a three-way pot with the initiative and a hand that is ahead of their ranges. Continuation-bet boards that hit your range and check more on boards that do not.',
        ],
      },
    ],
    quiz: [
      { q: 'Two limpers, normal open 2.5bb. A sensible iso size?', options: ['2.5bb', 'About 4.5bb', '15bb'], answer: 1, explain: 'About 2.5 + 1 per limper, or a little more against callers.' },
      { q: 'A tight player limps and then re-raises your iso. This usually means…', options: ['A bluff', 'A strong hand', 'Nothing'], answer: 1, explain: 'Limp-raises from tight players are usually very strong.' },
    ],
  },

  squeezes: {
    terms: [
      ['Squeeze', 'A 3-bet after an open and at least one call.'],
      ['Capped range', 'A range missing its strongest hands, such as a flat-caller who would have 3-bet them.'],
      ['Cold call', 'Calling a raise without having put money in before.'],
      ['Dead money', 'Chips from players who will usually fold.'],
    ],
    deeper: [
      {
        heading: 'Why squeezing works',
        body: [
          'A squeeze puts the opener in a tough spot. If they call, the original caller is still behind them and might wake up with a hand. And the caller usually has a capped range that will rarely 4-bet.',
          'The extra call also adds dead money, so a successful squeeze wins more than a normal 3-bet. But two players can continue, so the bluff needs more folds overall.',
        ],
      },
      {
        heading: 'Sizing and hand selection',
        body: [
          'A rough sizing rule: your normal 3-bet size plus about one open-size per caller. From the blinds, 4.5–6× the open is typical. Smaller squeezes give both players a good price and often end up multiway.',
          'Value hands are similar to a normal 3-bet, slightly tighter. Bluffs should have an ace or king blocker and be able to make strong hands when called. Avoid squeezing weak offsuit hands that do neither.',
        ],
      },
    ],
    apply: [
      'Look for opens from late position followed by flat calls from players who would 3-bet their best hands.',
      'Size up: normal 3-bet + about one open per caller.',
      'Squeeze for value a little tighter than a normal 3-bet; bluff with blockers.',
      'When you flat-call, think about who might squeeze behind you.',
    ],
    examples: [
      {
        title: 'Squeeze math',
        steps: [
          'Cutoff opens 2.5bb, button calls, you are in the big blind. Pot: 2.5 + 2.5 + 0.5 + 1 = 6.5bb.',
          'You squeeze to 14bb, risking 13bb more to win 6.5bb. Break-even fold frequency: 13 / 19.5 ≈ 67% (both must fold).',
          'If the cutoff folds 70% and the button folds 85% (its range is capped), both fold about 60% of the time. That falls short of 67%, so the bluff needs equity when called to be profitable — another reason to pick hands with playability.',
        ],
      },
    ],
    quiz: [
      { q: 'Pot 7bb, you squeeze to 15bb from the big blind (14bb more). Break-even fold rate?', options: ['About 50%', 'About 67%', 'About 80%'], answer: 1, explain: '14 / (14 + 7) ≈ 67%.' },
      { q: 'Why is the flat-caller’s range often weak against a squeeze?', options: ['It is capped', 'They have fewer chips', 'They act first'], answer: 0, explain: 'They would 3-bet many of their best hands.' },
    ],
  },

  'stack-depth-preflop': {
    terms: [
      ['Implied odds', 'Money you expect to win on later streets when you hit.'],
      ['Reverse implied odds', 'Money you expect to lose on later streets when you make a second-best hand.'],
      ['Set-mining', 'Calling with a small pair mainly to flop a set.'],
      ['Effective stack', 'The smaller of the two stacks in a pot.'],
    ],
    deeper: [
      {
        heading: 'What changes as stacks get deeper',
        body: [
          'Deeper stacks mean more money behind after the flop, so hands that can make the nuts or near-nuts gain value: small pairs (sets), suited connectors (straights and flushes), suited aces (nut flushes). Hands that make one strong pair lose value, because one pair is rarely good enough to win a very large pot.',
          'Position also matters more when stacks are deep, because there are more streets and more decisions where acting last helps.',
        ],
      },
      {
        heading: 'What changes as stacks get shorter',
        body: [
          'With 20–40bb, a 3-bet and a flop bet can put most of the stack in. Hands with high-card strength and blockers (AJ, KQ, A5s for its ace) gain value; speculative hands lose it, because there is not enough behind to pay off a set or flush.',
          'Below about 20bb, open-shoving and re-shoving become standard, and charts are best computed with push/fold models (see the tournament section).',
        ],
      },
    ],
    apply: [
      'Note the effective stack in big blinds before every preflop decision.',
      'Deep: play more suited connectors and small pairs in position; be careful with offsuit broadways.',
      'Short: prefer high cards and blockers; drop speculative hands that need big implied odds.',
      'Set-mine only when the stack you can win is roughly 10–20 times the call or more.',
    ],
    examples: [
      {
        title: 'Set-mining with 44',
        steps: [
          'A player opens to 3bb and you consider calling with 4♠ 4♦.',
          'You flop a set or better about 11.8% of the time. You need to win about 7.5 times the call when you hit to break even, more in practice.',
          'Effective stack 100bb: you can win far more than 22.5bb when you hit, so the call can be fine in position.',
          'Effective stack 15bb: you can win at most about 12bb more, which is not enough. Fold or shove instead.',
        ],
      },
    ],
    quiz: [
      { q: 'Which hand gains the most at 200bb compared with 100bb?', options: ['A5s', 'AJo', 'KQo'], answer: 0, explain: 'It can make the nut flush and wheel straights; one-pair hands gain less.' },
      { q: 'About how often does a pocket pair flop a set or better?', options: ['5%', '12%', '25%'], answer: 1, explain: 'About 11.8%, roughly 1 in 8.5.' },
    ],
  },

  'rake-effects': {
    terms: [
      ['Rake', 'The fee the house takes from each pot.'],
      ['Cap', 'The maximum rake taken from one pot.'],
      ['No flop, no drop', 'A rule where pots that end preflop are not raked.'],
      ['Rakeback', 'A share of rake returned to players by the site.'],
    ],
    deeper: [
      {
        heading: 'Where rake hurts most',
        body: [
          'Rake is usually a percentage of the pot up to a cap. Small and medium pots pay close to the full percentage, while big pots hit the cap. So rake hurts most in the many small pots that come from limped and single-raised pots, and least in big 3-bet and 4-bet pots.',
          'Under “no flop, no drop”, pots won preflop pay nothing. That makes 3-bets and steals that win immediately relatively better than calls.',
        ],
      },
      {
        heading: 'Practical adjustments',
        body: [
          'At high-rake levels (common in low-stakes online and live games), tighten the bottom of your calling ranges, especially big-blind defence and cold calls. Raise or fold more often.',
          'As stakes rise and rake falls as a share of the pot, strategies can widen again. Solver outputs computed without rake are often too loose for high-rake games.',
        ],
      },
    ],
    apply: [
      'Know your game’s rake: percentage, cap and whether it has no flop, no drop.',
      'In high-rake games, cut the weakest calls first, especially from the blinds.',
      'Prefer 3-bets over flats with hands that are borderline either way.',
      'Remember that big pots usually hit the cap, so rake matters less there.',
    ],
    examples: [
      {
        title: 'How much rake does a small pot pay?',
        steps: [
          'A single-raised pot reaches the flop with 5.5bb and ends at 12bb. At 5% rake with a 3bb cap, the winner pays 0.6bb.',
          'If you call in the big blind and win this pot 40% of the time, you pay about 0.24bb per hand in rake. For a borderline call, that can be the whole edge.',
          'A 3-bet pot that ends at 60bb would pay 3bb at 5% but is capped at 3bb, so it pays a smaller share.',
        ],
      },
    ],
    quiz: [
      { q: 'With “no flop, no drop”, which wins the pot without paying rake?', options: ['A steal that wins preflop', 'A call that wins at showdown', 'Both'], answer: 0, explain: 'Pots that end preflop pay no rake.' },
      { q: 'In a high-rake game, which defend hands should you cut first?', options: ['The weakest offsuit hands', 'Suited aces', 'Big pairs'], answer: 0, explain: 'They have the thinnest edge.' },
    ],
  },

  playability: {
    terms: [
      ['Playability', 'How easily a hand continues profitably after the flop.'],
      ['Backdoor draw', 'A draw that needs both the turn and river, such as three to a flush on the flop.'],
      ['Second-best hand', 'A strong-looking hand that loses to a better one, such as top pair, weak kicker.'],
      ['Nut potential', 'How often a hand can make the best possible hand.'],
    ],
    deeper: [
      {
        heading: 'What makes a hand easy to play',
        body: [
          'Easy hands either make strong hands that are rarely beaten, or they make draws that let them continue without risking much. Suited aces make nut flushes. Suited connectors make straights and flushes and flop many draws. Pocket pairs make sets that are well disguised.',
          'Hard hands make mostly one pair with a weak kicker. They often face a difficult decision on the turn or river, and when they do win a big pot they are often behind.',
        ],
      },
      {
        heading: 'Raw equity is not the deciding factor',
        body: [
          'Against a random hand, K8o has about 56% equity and 65s about 43%. Yet in many positions 65s is the better hand to play, because it realises more of its equity and loses less when it is behind. Equity tables measure all-in strength, not how a hand plays over several streets.',
          'Playability matters most when stacks are deep and you will see several streets. When you are all-in preflop, only raw equity matters.',
        ],
      },
    ],
    apply: [
      'Prefer suited hands to their offsuit versions, and connected hands to gapped ones.',
      'Be wary of offsuit hands that share a card with common strong hands (KJo, QTo, A8o).',
      'On the flop, count backdoor draws: they add to how often you can continue.',
      'For all-in preflop decisions, use raw equity instead of playability.',
    ],
    examples: [
      {
        title: 'Facing an early-position open: KJo vs 76s',
        steps: [
          'UTG opens. You are on the button.',
          'KJo flops top pair often, but against UTG’s range it is frequently dominated by AK, KQ and AJ. When it wins it tends to win small pots, and when it loses it can lose a big one.',
          '76s flops top pair less, but it makes two pair, straights and flushes that beat big pairs. It also flops draws it can continue with.',
          'Many charts fold KJo here and call 76s for these reasons.',
        ],
      },
    ],
    quiz: [
      { q: 'Which hand has better playability?', options: ['98s', 'K7o'], answer: 0, explain: 'Suited and connected: straights, flushes and many draws.' },
      { q: 'When does playability matter least?', options: ['When all-in preflop', 'When 200bb deep', 'When in position'], answer: 0, explain: 'With no more betting, only raw equity matters.' },
    ],
  },
};
