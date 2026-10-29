import type { LessonExtra } from '../types';

export const POSTFLOP_X: Record<string, LessonExtra> = {
  'board-texture': {
    terms: [
      ['Dry board', 'A board with few draws, such as K♠ 7♦ 2♣.'],
      ['Wet board', 'A board with many draws and strong hands possible, such as J♥ T♥ 8♣.'],
      ['Two-tone / monotone / rainbow', 'Two cards of one suit / all three the same suit / three different suits.'],
      ['Dynamic board', 'A board where the best hand often changes on later streets.'],
    ],
    deeper: [
      {
        heading: 'A checklist for any flop',
        body: [
          'High card: an ace- or king-high board usually favors the preflop raiser, who has more strong aces and kings. Low, connected boards (such as 7-6-5) favor the caller, especially the big blind, who has more small suited and connected hands.',
          'Connectedness: count the straight draws. Three cards within a five-card window allow made straights; two connected cards allow open-enders. Suits: a two-tone flop allows flush draws; a monotone flop makes flushes possible already. Pairing: a paired board reduces the number of strong hands and makes trips and full houses the nuts.',
        ],
      },
      {
        heading: 'Static and dynamic boards',
        body: [
          'On static boards like A♠ 7♦ 2♣, the best hand on the flop is usually still best on the river. There is little to protect, so you can bet small, check strong hands sometimes, and spread value over several streets.',
          'On dynamic boards like 9♥ 8♥ 6♣, almost any turn changes who is ahead. Strong hands want to charge draws now, and medium hands often lose value as draws complete. Bets tend to be larger, and checks with medium hands are common.',
        ],
      },
    ],
    apply: [
      'Name the board: high card, connected or not, suits, paired or not.',
      'Ask whose preflop range has more top pairs, overpairs, sets and straights here.',
      'On dry boards, lean toward small bets with a wide range.',
      'On wet boards, lean toward bigger bets with a narrower range, and fewer slow-plays.',
    ],
    examples: [
      {
        title: 'Monotone flop',
        steps: [
          'Flop: Q♦ 8♦ 3♦. Anyone with two diamonds already has a flush; anyone with one diamond has a draw.',
          'Strong-looking hands without a diamond (such as A♠ Q♣) are weaker than usual, because many turns put a fourth diamond out.',
          'Bets on monotone flops are usually small and less frequent; hands with the A♦ or K♦ gain value as blockers and draws.',
        ],
      },
    ],
    quiz: [
      { q: 'Which flop is the most dynamic?', options: ['A♠ 7♦ 2♣', 'T♥ 9♥ 7♣', 'K♣ K♦ 4♠'], answer: 1, explain: 'Many straight and flush draws; most turns change something.' },
      { q: 'On a paired board, strong hands are…', options: ['More common', 'Less common', 'Unchanged'], answer: 1, explain: 'Pairing the board removes combos of the paired rank.' },
    ],
  },

  'range-advantage': {
    terms: [
      ['Range advantage', 'Having more equity than the opponent across your whole range on this board.'],
      ['Nut advantage', 'Having more of the very strongest hands (sets, straights, top two pair).'],
      ['Capped', 'A range that rarely contains the strongest hands.'],
      ['Range bet', 'Betting (usually small) with every hand in your range.'],
    ],
    deeper: [
      {
        heading: 'Where range advantage comes from',
        body: [
          'It comes from preflop. The preflop raiser has more big pairs and big cards; the big blind defends many more small and connected hands. When the flop is high, the raiser’s range does better on average. When it is low and connected, the defender catches up or gets ahead.',
          'Nut advantage is separate. On A♠ 8♦ 3♣, the button has more strong aces and AA, but both players have 88 and 33. On 7♥ 6♥ 5♣, the big blind has more two pair and straights (98, 84, 76, 65), while the button has more overpairs. Overpairs are strong hands but not the nuts.',
        ],
      },
      {
        heading: 'How it shapes strategy',
        body: [
          'With a big range advantage, you can bet often and small: many hands want to bet, and the opponent has many weak hands that must fold or call with little equity. With a nut advantage, larger bets and overbets work, because the opponent cannot easily have the hands that beat you.',
          'Without either, check more. Your bets will run into the hands that beat you more often, and you can win at showdown with many hands that would not enjoy facing a raise.',
        ],
      },
    ],
    apply: [
      'Before looking at your hand, ask who has more overpairs and top pairs on this board.',
      'Then ask who has more sets, two pair and straights.',
      'Range advantage → frequent, small bets. Nut advantage → bigger bets are possible.',
      'Without either, check more and protect your checking range with some strong hands.',
    ],
    examples: [
      {
        title: 'K♠ Q♦ 4♣: button vs big blind',
        steps: [
          'The button opens many kings and queens, AK, AQ, KQ and all the big pairs. The big blind defends some of these but folded many, and 3-bet some of the best.',
          'The button has a clear range advantage and some nut advantage (KK, QQ, AA and KQ are more frequent in its range).',
          'A small c-bet with most of the range works well: weaker big-blind hands such as 86s or 75s have almost nothing.',
        ],
      },
    ],
    quiz: [
      { q: 'Flop 6♠ 5♠ 4♦, button opened and the big blind called. Who has the nut advantage?', options: ['Button', 'Big blind', 'Equal'], answer: 1, explain: 'The big blind defends many more 87, 73, 32, sets of small pairs and small suited hands.' },
      { q: 'With a strong nut advantage, which sizes become attractive?', options: ['Only tiny bets', 'Large bets and overbets', 'Only checks'], answer: 1, explain: 'The opponent rarely has the hands that beat you.' },
    ],
  },

  'position-spr': {
    terms: [
      ['SPR', 'Stack-to-pot ratio: effective stack divided by the pot at the start of the flop.'],
      ['Committed', 'Having put in enough of your stack that folding is rarely right.'],
      ['Pot control', 'Keeping the pot small with medium hands.'],
      ['Stack off', 'Put your whole stack in.'],
    ],
    deeper: [
      {
        heading: 'SPR as a commitment guide',
        body: [
          'A low SPR (about 1–3) means a couple of normal bets put everyone all-in. Top pair is usually strong enough to commit, and draws should often get it in too. A medium SPR (about 4–8) means you should be selective: one pair is good, but facing heavy action you may be behind. A high SPR (10+) means one pair rarely wants to play for stacks, while sets and straights can.',
          'Single-raised pots at 100bb usually start the flop with an SPR of about 10–15. 3-bet pots are about 3–5 and 4-bet pots about 1–2. So the same top pair can be an easy stack-off in a 4-bet pot and a pot-control hand in a single-raised pot.',
        ],
      },
      {
        heading: 'Position multiplies the effect',
        body: [
          'At high SPR, there are many decisions left, and the player in position makes each one with more information. That is why deep-stacked pots out of position are hard to play with medium hands.',
          'At low SPR, position matters less: decisions come quickly and there are few streets left to use the information.',
        ],
      },
    ],
    apply: [
      'Work out the SPR when the flop comes: stack ÷ pot.',
      'Low SPR: plan to get it in with top pair or better and with strong draws.',
      'High SPR: keep the pot smaller with one pair, build it with very strong hands.',
      'Out of position and deep, be more careful with medium hands.',
    ],
    examples: [
      {
        title: 'Planning the hand from the SPR',
        steps: [
          'You 3-bet to 10bb from the small blind and the button calls. Pot about 21bb, stacks about 90bb: SPR ≈ 4.3.',
          'Flop A♥ 9♣ 4♦, you hold A♠ Q♠. With a third-pot bet on the flop, a half-pot bet on the turn and a big river bet, the stacks go in naturally.',
          'With SPR 4 and top pair, good kicker, you are usually happy to get all-in against most ranges in a 3-bet pot.',
        ],
      },
    ],
    quiz: [
      { q: 'Pot 30bb, effective stack 45bb on the flop. What is the SPR?', options: ['0.67', '1.5', '3'], answer: 1, explain: '45 / 30 = 1.5 — low; one bet will nearly commit everyone.' },
      { q: 'In which pot is top pair the easiest stack-off?', options: ['Single-raised pot, SPR 12', '4-bet pot, SPR 1.5'], answer: 1, explain: 'At low SPR the stacks go in quickly and the range you face is wider relative to the money.' },
    ],
  },

  'value-bluff-semibluff': {
    terms: [
      ['Value bet', 'A bet that expects to be called by worse hands.'],
      ['Bluff', 'A bet with a hand that rarely wins at showdown, aiming for folds.'],
      ['Semi-bluff', 'A bet with a draw: it can win by a fold now or by improving later.'],
      ['Merged bet', 'A bet with a medium hand that gets some value and some protection.'],
    ],
    deeper: [
      {
        heading: 'Why semi-bluffs are so useful',
        body: [
          'A semi-bluff wins in two ways: the opponent folds now, or you hit your draw later. That combination often makes betting a draw better than checking it. Even when called, you still have outs.',
          'The best semi-bluffs have strong draws (flush draws, open-enders, combo draws) and some showdown or blocker value. Weak draws (gutshots) work better as smaller bets or checks, depending on the board.',
        ],
      },
      {
        heading: 'The streets change the balance',
        body: [
          'On the flop, many hands have some equity, so pure bluffs are rare and semi-bluffs are common. On the river there are no more cards, so a bet is either value (called by worse) or a bluff (folds out better). Medium hands that want to see a showdown usually check.',
          'A simple river test: list the hands that call a bet. If most of them beat you, it is not a value bet. List the hands that fold. If most of them are worse than you, it is not a good bluff either.',
        ],
      },
    ],
    apply: [
      'Label the bet: value, bluff or semi-bluff.',
      'For value, name worse hands that call.',
      'For a bluff, name better hands that fold.',
      'With draws on the flop and turn, prefer betting strong draws and checking weak ones.',
    ],
    examples: [
      {
        title: 'Combo draw on the turn',
        steps: [
          'Turn: K♥ 9♥ 4♣ 8♦. You hold J♥ T♥: an open-ended straight draw plus a flush draw.',
          'You have about 15 outs (9 hearts plus 6 non-heart queens and sevens), roughly 33% to hit on the river.',
          'Betting can win the pot now, and when called you still often make the best hand. This is a strong semi-bluff.',
        ],
      },
    ],
    quiz: [
      { q: 'On the river, a bet with a hand that only worse hands fold to and only better hands call is…', options: ['A good value bet', 'A good bluff', 'A bet that achieves nothing useful'], answer: 2, explain: 'It loses to the callers and wins nothing from the folders.' },
      { q: 'Which is the best semi-bluff?', options: ['A gutshot with no overcards', 'A flush draw with an overcard', 'Ace-high with no draw'], answer: 1, explain: 'More outs and some showdown value.' },
    ],
  },

  'equity-denial-realization': {
    terms: [
      ['Equity denial', 'Making hands with some equity fold so they cannot draw out.'],
      ['Free card', 'A card seen without paying, because everyone checked.'],
      ['Protection', 'Betting partly to deny equity to hands that could outdraw you.'],
      ['Realization', 'The share of a hand’s equity it actually wins.'],
    ],
    deeper: [
      {
        heading: 'When denial matters',
        body: [
          'Denial matters when your hand is ahead but vulnerable and the opponent has many hands with live outs. An overpair on J♥ T♥ 7♣ faces flush draws, straight draws and overcards. A bet makes some of them fold, and the others pay to draw.',
          'Denial matters little on dry boards where the opponent’s weak hands have almost no outs. Checking K♠ 7♦ 2♣ with a king gives away very little: most hands that are behind have two or three outs at best.',
        ],
      },
      {
        heading: 'How realization decides calls',
        body: [
          'A hand that realizes its equity well can continue with less raw equity. In position, with a draw to the nuts, you can call more. Out of position, with a weak pair that will face bets on many turns, you need more.',
          'The app’s rollouts take this into account: they simulate the rest of the hand, so a call that looks fine on raw equity can show a lower EV once realization is included.',
        ],
      },
    ],
    apply: [
      'Ask: how many outs do the hands I beat have?',
      'Many outs and a vulnerable hand → bet to deny equity.',
      'Few outs → checking and keeping their bluffs in is often fine.',
      'When calling, adjust your equity down out of position and up with nut draws in position.',
    ],
    examples: [
      {
        title: 'Overpair on two boards',
        steps: [
          'You hold Q♠ Q♦ and are first to act.',
          'Board A: 9♥ 8♥ 5♣. Many hands have 8+ outs against you (flush draws, straight draws, combo draws). Betting is important: checking gives these hands a free shot.',
          'Board B: 7♣ 4♦ 2♠. Few hands have more than two or three outs. Checking sometimes is fine and keeps the opponent’s bluffs and weak pairs in.',
        ],
      },
    ],
    quiz: [
      { q: 'On which board does an overpair most need protection?', options: ['K♠ 7♦ 2♣', 'J♥ T♥ 8♣', 'A♠ A♦ 3♣'], answer: 1, explain: 'Wet and connected: many hands have strong draws.' },
      { q: 'Which hand realizes its equity better?', options: ['A nut flush draw in position', 'Bottom pair out of position'], answer: 0, explain: 'It can continue easily and wins big when it hits.' },
    ],
  },

  cbetting: {
    terms: [
      ['C-bet', 'A continuation bet: the preflop raiser bets the flop.'],
      ['Range c-bet', 'C-betting with every hand, usually small.'],
      ['Checking range', 'The hands you check with. It needs some strong hands so you are not exploited.'],
      ['Float', 'Calling a bet in position, planning to bet when the opponent checks later.'],
    ],
    deeper: [
      {
        heading: 'Frequency and size go together',
        body: [
          'On boards where your range is much stronger, a high frequency with a small size (about a third of the pot) is efficient. Most of your hands benefit, and the opponent must defend with weak holdings.',
          'On boards where the ranges are close, bet less often and use a larger size (about two-thirds to pot). Your bets will be a stronger, more polarized group, and you check the middle of your range.',
        ],
      },
      {
        heading: 'Protecting your checks',
        body: [
          'If you only check weak hands, the opponent can bet every time you check and win the pot. Keep some strong hands in your checks, especially hands that do not need protection (for example a set on a dry board, or top pair with a blocker to their bluffs).',
          'Multiway, c-bet less often and with stronger hands. More players means it is much more likely that someone has connected.',
        ],
      },
    ],
    apply: [
      'Ask whose range the board favors.',
      'Favorable board → c-bet often and small.',
      'Neutral or bad board → c-bet less, size up, and check the middle of your range.',
      'Keep some strong hands in your checks.',
      'Multiway → c-bet much less and mostly for value.',
    ],
    examples: [
      {
        title: 'A board that is bad for the raiser',
        steps: [
          'Button opens, big blind calls. Flop: 8♠ 7♠ 6♦.',
          'The big blind has more two pair, straights and strong draws. The button has more overpairs.',
          'The button checks a lot here. When it bets, it chooses a larger size with sets, overpairs with a spade, and strong draws. Hands like A♦ K♣ and K♥ Q♥ usually check.',
        ],
      },
    ],
    quiz: [
      { q: 'On a board that strongly favors your range, the usual c-bet plan is…', options: ['High frequency, small size', 'Low frequency, large size', 'Never bet'], answer: 0, explain: 'Most hands benefit and the opponent’s range is weak.' },
      { q: 'Why keep some strong hands in your checking range?', options: ['So opponents cannot bet every time you check', 'Because strong hands never want to bet', 'It is required'], answer: 0, explain: 'Otherwise your checks are an easy target.' },
    ],
  },

  'delayed-cbet': {
    terms: [
      ['Delayed c-bet', 'The preflop raiser checks the flop, then bets the turn after the opponent checks again.'],
      ['Check back', 'Checking as the last player to act.'],
      ['Turn card equity', 'How the turn card changes each player’s range.'],
      ['Range protection', 'Keeping strong hands in a range so it cannot be attacked freely.'],
    ],
    deeper: [
      {
        heading: 'Why the delay works',
        body: [
          'When you check back the flop, you keep the pot small, realize your equity and give the opponent a chance to bet. When they check again on the turn, their range is weaker: many players would bet the turn with their good hands and draws.',
          'Your checked-back range contains many medium hands and some strong ones you slow-played. Betting the turn after two checks often gets folds from weak hands and value from worse pairs.',
        ],
      },
      {
        heading: 'Good turns and bad turns',
        body: [
          'Turns that improve your range (overcards, cards that complete few draws, cards that give you new draws) are good for delayed c-bets. Turns that improve the opponent (low connected cards, flush cards) are worse, unless your hand improved too.',
          'Avoid automatic delayed bets. Pick turns that help you and hands that benefit from betting.',
        ],
      },
    ],
    apply: [
      'Check back flops that do not favor your range or where your hand wants pot control.',
      'On the turn after a check-check, bet when the card helps your range or gives you equity.',
      'Use the opponent’s turn check as evidence that their range is weaker.',
      'Keep some strong hands in your flop checks so the delayed line is credible.',
    ],
    examples: [
      {
        title: 'Turn overcard after a check-back',
        steps: [
          'You open the cutoff and the big blind calls. Flop: 7♥ 6♥ 3♣. You hold A♠ K♣ and check back.',
          'Turn: K♦, and the big blind checks again. You now have top pair, top kicker, and the king is better for your range than theirs.',
          'A delayed c-bet of about half to two-thirds of the pot gets value from 7x, 6x and pairs, and charges draws.',
        ],
      },
    ],
    quiz: [
      { q: 'Which turn is usually best for a delayed c-bet from the preflop raiser?', options: ['A card that helps the raiser’s range', 'A card that completes many draws', 'Any card'], answer: 0, explain: 'Pick cards that improve your range relative to theirs.' },
      { q: 'Why is the opponent’s turn check informative?', options: ['They would often bet strong hands and draws', 'It means they have nothing every time', 'It is not informative'], answer: 0, explain: 'It removes many strong hands, though not all.' },
    ],
  },

  'probe-donk': {
    terms: [
      ['Donk bet', 'Betting into the previous street’s aggressor before they act.'],
      ['Probe bet', 'Betting the turn out of position after the aggressor checked back the flop.'],
      ['Lead', 'Any bet made first into the preflop raiser.'],
      ['Capped by check-back', 'A range that has fewer strong hands because it declined to bet.'],
    ],
    deeper: [
      {
        heading: 'When betting first makes sense',
        body: [
          'Normally, the player who checks to the aggressor lets them bet with their stronger range. Donk-betting makes sense on cards that shift the advantage toward you: for example, a low connected turn after the big blind called a flop bet, which completes many of the big blind’s straights and two pairs.',
          'Probing makes sense after the aggressor checks back the flop. Their range is capped (they would bet many strong hands), so a turn bet can win from weak hands and get value from medium ones.',
        ],
      },
      {
        heading: 'Common mistakes with leads',
        body: [
          'Many players donk-bet small with medium hands “to see where they are”. This lets the aggressor raise with strong hands and bluffs and fold the rest, and it takes weak hands out of the checking range.',
          'A lead should come from a range that is strong on that card, and the size should suit what you want: small to probe weak ranges, larger when the card favors you heavily.',
        ],
      },
    ],
    apply: [
      'Lead when the new card clearly favors your range.',
      'Probe the turn after a check-back, with a range of value hands and good draws.',
      'Avoid small “blocking” leads with medium hands unless you have a specific read.',
      'Keep checking most of your range when the card favors the aggressor.',
    ],
    examples: [
      {
        title: 'A turn that favors the caller',
        steps: [
          'Button opens, big blind calls. Flop K♠ 8♦ 6♣: button bets small, big blind calls.',
          'Turn 7♥. The big blind has many 9-5s, 5-4, T-9, 8-7, 7-6 and 8-6 that made straights or two pair. The button has fewer of these.',
          'The big blind can lead with a range of these strong hands plus strong draws, rather than check and let the button choose.',
        ],
      },
    ],
    quiz: [
      { q: 'After the button checks back the flop, a turn bet by the big blind is called…', options: ['A probe bet', 'A 3-bet', 'A c-bet'], answer: 0, explain: 'Betting into a player who declined to bet.' },
      { q: 'A good reason to donk-bet the turn is…', options: ['The turn card favors your range', 'You want to find out where you stand', 'You always lead with pairs'], answer: 0, explain: 'Leads work best from ranges that improved.' },
    ],
  },

  'check-raising': {
    terms: [
      ['Check-raise', 'Checking, then raising after the opponent bets.'],
      ['Raise-or-fold', 'A spot where calling is poor, so continuing hands either raise or fold.'],
      ['Polar raise', 'A raising range of strong hands and bluffs.'],
      ['Facing a raise', 'Responding to a raise, where ranges become much stronger.'],
    ],
    deeper: [
      {
        heading: 'Building a check-raising range',
        body: [
          'Value: sets, two pair, and strong top pairs on wet boards where they want to build the pot and deny equity. Bluffs: the best draws (flush draws with overcards, open-enders, combo draws) that gain a lot from fold equity and still have outs when called.',
          'Medium hands like middle pair usually call rather than raise: raising them folds out worse hands and gets called by better ones.',
        ],
      },
      {
        heading: 'Responding to a check-raise',
        body: [
          'When you are check-raised, the opponent’s range is narrow and strong. One pair hands lose a lot of value, especially in single-raised pots with deep stacks. Continue with strong hands and good draws, and be prepared to fold top pair with a weak kicker.',
          'Small c-bets get check-raised more often, because the raiser risks little. Do not fold too much to them, but do not call down with anything either. Count how many of your hands beat the value part of their range.',
        ],
      },
    ],
    apply: [
      'Check-raise strong hands on boards where they want to build the pot.',
      'Add your best draws as bluffs; call with medium made hands.',
      'Facing a check-raise, narrow down hard: one pair loses value.',
      'Defend enough against small c-bet raises that light check-raises do not print money.',
    ],
    examples: [
      {
        title: 'Facing a flop check-raise',
        steps: [
          'You open the button and c-bet small on T♠ 9♠ 4♦ with K♠ T♣. The big blind check-raises to 4× your bet.',
          'Their range is now sets, T9, 9-8 and 8-7 straight draws, flush draws, and some combo draws. Your top pair is ahead of the draws but behind the value hands.',
          'With the K♠ (which gives you a king-high flush draw and blocks some of their flush draws) plus top pair, calling is reasonable. A hand like A♦ 4♣ (bottom pair) would fold.',
        ],
      },
    ],
    quiz: [
      { q: 'Which hand is a good check-raise bluff on J♥ 8♥ 3♣?', options: ['A♥ 5♥', '8♣ 7♣', 'A♠ 2♦'], answer: 0, explain: 'Nut flush draw plus an overcard: lots of equity when called.' },
      { q: 'Facing a big check-raise, one-pair hands usually…', options: ['Gain value', 'Lose value', 'Do not change'], answer: 1, explain: 'The raising range is much stronger than the betting range.' },
    ],
  },

  'turn-river-planning': {
    terms: [
      ['Barrel', 'Betting again on a later street after betting the previous one.'],
      ['Blank', 'A turn or river card that changes little.'],
      ['Scare card', 'A card that improves the opponent’s perceived range or yours dramatically.'],
      ['Pot geometry', 'How bet sizes across streets add up to the remaining stack.'],
    ],
    deeper: [
      {
        heading: 'Plan before you bet the flop',
        body: [
          'Before you c-bet, think about the turn and river. Which cards will you keep betting on? Which will you give up on? If you have a strong hand, how will the stacks go in by the river? If you are bluffing, which rivers give you the best story?',
          'A plan makes later decisions easier and stops you from drifting into a big pot with a medium hand or giving up too early with your bluffs.',
        ],
      },
      {
        heading: 'Choosing turns to barrel',
        body: [
          'Good barrel cards are cards that improve your range more than the opponent’s (often overcards to the board when you were the preflop raiser), and cards that give your bluffs extra equity (new draws). Bad barrel cards complete the opponent’s likely draws or pair the low cards they hold.',
          'With value hands, keep barrelling on most turns. With bluffs, barrel the best cards and give up on the worst. With medium hands, check more often to control the pot.',
        ],
      },
    ],
    apply: [
      'Before the flop bet, decide which turns you will continue on.',
      'Bet good cards for your range; check back cards that help the caller.',
      'With strong hands, size so that the stacks go in by the river.',
      'With bluffs, choose the ones with the most equity or the best blockers to keep betting.',
    ],
    examples: [
      {
        title: 'Two turns after the same flop',
        steps: [
          'You open the button and c-bet A♠ 7♦ 3♣; the big blind calls. You hold K♥ Q♥ (a bluff with backdoor draws).',
          'Turn Q♦: you now have second pair. Checking back to see a cheap river is reasonable.',
          'Turn J♥: you have a gutshot and a backdoor flush draw has become a flush draw. A second barrel has good equity when called: a strong turn to continue the bluff.',
        ],
      },
    ],
    quiz: [
      { q: 'Which turn is usually a good barrel for the preflop raiser on 9♠ 6♦ 2♣?', options: ['K♥', '7♦', '5♣'], answer: 0, explain: 'An overcard helps the raiser’s range more than the caller’s.' },
      { q: 'Why plan the turn and river before betting the flop?', options: ['To avoid drifting into bad spots with medium hands and bluffs', 'Because the rules require it', 'It is not useful'], answer: 0, explain: 'Plans keep sizes and decisions consistent.' },
    ],
  },

  'thin-value': {
    terms: [
      ['Thin value', 'A value bet with a hand only slightly ahead of the calling range.'],
      ['Called by worse', 'The test for any value bet.'],
      ['Check-raise risk', 'The chance a thin bet is raised and you must fold.'],
      ['Showdown value', 'Winning chances if the hand is checked down.'],
    ],
    deeper: [
      {
        heading: 'When thin value works',
        body: [
          'Thin value works when the opponent’s calling range contains enough worse hands that you win more often than you lose when called. It works best against players who call too much, in position (you are rarely raised as a bluff), and with smaller sizes that keep worse hands in.',
          'It works worst against tight players who call only with better hands, out of position, and on boards where many draws missed (those hands fold, not call).',
        ],
      },
      {
        heading: 'The size matters',
        body: [
          'A thin value bet is usually small: a third to half of the pot. Bigger bets fold out the worse hands you want to call and keep the better ones in. A small size also reduces the cost when you are called by better.',
          'If you would fold to a raise, think about how often you will be raised. Against opponents who rarely bluff-raise, a raise means you are beaten, which makes betting cheaper in practice.',
        ],
      },
    ],
    apply: [
      'List the hands that call. Are more than half of them worse than yours?',
      'Bet small to keep worse hands in.',
      'Thin-value more against callers, less against tight players.',
      'In position, thin value is easier because you are rarely raised as a bluff.',
    ],
    examples: [
      {
        title: 'Second pair vs a station',
        steps: [
          'River: K♣ 9♦ 5♠ 3♥ 2♣. You hold 9♥ 8♥ and the opponent, a calling station, checks.',
          'This player calls with any pair, including 5x, 3x and 2x, and with some ace-high.',
          'A small bet gets called by many worse hands. Against a tight player, who would only call with kings, check instead.',
        ],
      },
    ],
    quiz: [
      { q: 'Thin value bets are usually sized…', options: ['Small', 'Very large', 'All-in'], answer: 0, explain: 'Small sizes keep worse hands calling.' },
      { q: 'Against which opponent is thin value best?', options: ['A calling station', 'A very tight nit'], answer: 0, explain: 'They call with more worse hands.' },
    ],
  },

  'bluff-catching': {
    terms: [
      ['Bluff-catcher', 'A hand that beats only bluffs and loses to all value hands.'],
      ['Pot odds', 'The equity you need to call: call ÷ (pot + call).'],
      ['Blocker', 'A card that removes some of the opponent’s value hands or bluffs.'],
      ['Under-bluffing', 'Bluffing less than the price requires.'],
    ],
    deeper: [
      {
        heading: 'Choosing which bluff-catchers to call with',
        body: [
          'Not every bluff-catcher is equal. Prefer hands that block the opponent’s value bets and do not block their bluffs. On a river where the flush missed, a hand without the key flush card is better, because it leaves the missed flush draws (the bluffs) in their range.',
          'Also prefer hands that beat some of their thin value bets. If they sometimes bet top pair weak kicker, a top-pair good-kicker hand beats those too and is a better call than a weak pair.',
        ],
      },
      {
        heading: 'How often to call',
        body: [
          'In theory, a defender facing a bet needs to keep enough of their range to stop the bettor bluffing with any two cards (see MDF). In practice, how often the opponent actually bluffs matters more. Many players bluff too little in big pots and on rivers; against them, folding more bluff-catchers is fine.',
          'Against aggressive players who reach the river with many missed draws, calling more can be right. Use what you know about the player, and fall back on pot odds when you have no reads.',
        ],
      },
    ],
    apply: [
      'Compute the price: call ÷ (pot + call).',
      'Estimate how often this player bluffs in this spot.',
      'Prefer bluff-catchers that block value and do not block bluffs.',
      'Fold more against under-bluffers; call more against over-bluffers.',
    ],
    examples: [
      {
        title: 'Two bluff-catchers on the same river',
        steps: [
          'Board: Q♥ J♥ 6♣ 3♠ 2♦. The flush missed. The opponent bets pot on the river.',
          'Hand A: Q♣ T♣. You beat missed heart draws. You do not hold a heart, so you leave their bluffs in.',
          'Hand B: Q♥ 9♠. You also beat bluffs, but your Q♥ blocks some of their heart draws (bluffs). Hand A is the better call.',
        ],
      },
    ],
    quiz: [
      { q: 'Facing a half-pot river bet, what equity do you need to call?', options: ['25%', '33%', '50%'], answer: 0, explain: '0.5 / (1 + 0.5 + 0.5) = 25%.' },
      { q: 'A good bluff-catcher…', options: ['Blocks the opponent’s bluffs', 'Blocks the opponent’s value hands', 'Blocks nothing'], answer: 1, explain: 'Removing value hands raises the share of bluffs you face.' },
    ],
  },

  multiway: {
    terms: [
      ['Multiway pot', 'A pot with three or more players.'],
      ['Overcall', 'Calling after someone else has already called.'],
      ['Squeezed', 'Being caught between two players who might both act aggressively.'],
      ['Equity share', 'Each player’s share of the pot; it falls as more players are involved.'],
    ],
    deeper: [
      {
        heading: 'Why multiway pots are different',
        body: [
          'With more opponents, the chance that someone has a strong hand rises sharply. If each of two opponents hits a board 30% of the time, at least one hits about 51% of the time. Bluffs need everyone to fold, which happens much less often.',
          'Value hands also need to be stronger: top pair weak kicker is often good heads-up and often beaten three-way. Draws to the nuts gain value, because when they hit they can get paid by more players.',
        ],
      },
      {
        heading: 'Position in multiway pots',
        body: [
          'The player in the middle is in a tough spot: they might face a bet and then a raise behind. Hands that want to call need to be stronger in that seat. The last player to act has the most information and can play the widest.',
          'Aggression from one player into several others is usually strong. Respect it more than you would heads-up.',
        ],
      },
    ],
    apply: [
      'Bluff much less often multiway, and only with real equity.',
      'Value bet stronger hands; slow down with one pair.',
      'Favor nut draws over weak draws.',
      'Respect bets and raises into several players.',
    ],
    examples: [
      {
        title: 'Top pair three-way',
        steps: [
          'Three players see a flop of K♦ 9♠ 5♣. You hold K♣ 7♣, and the first player bets into two others.',
          'Heads-up, top pair with a weak kicker is often good. Here the bettor is betting into two players, which suggests strength, and a third player can still act behind you.',
          'Calling is reasonable, raising is usually not, and you should slow down if there is more action.',
        ],
      },
    ],
    quiz: [
      { q: 'Each of two opponents has a 30% chance to have a strong hand. Chance at least one does?', options: ['30%', 'About 51%', '60%'], answer: 1, explain: '1 − 0.7 × 0.7 = 0.51.' },
      { q: 'In multiway pots, bluffing should usually…', options: ['Increase', 'Decrease'], answer: 1, explain: 'Everyone must fold for a bluff to work.' },
    ],
  },
};
