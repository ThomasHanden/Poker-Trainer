import type { LessonExtra } from '../types';

export const MATH_X: Record<string, LessonExtra> = {
  'pot-odds': {
    terms: [
      ['Pot odds', 'The ratio of the pot to the cost of calling, or equivalently the equity you need: call ÷ (pot + call).'],
      ['Price', 'Another name for the equity a call requires.'],
      ['Ratio form', 'Pot odds written like 3:1 — the pot is three times the call.'],
      ['Percentage form', 'Pot odds written as required equity, such as 25%.'],
    ],
    deeper: [
      {
        heading: 'Two ways to write the same thing',
        body: [
          'If the pot (including the bet) is 30bb and you must call 10bb, you are getting 30:10 or 3:1. To convert to a percentage, add the parts: 10 / (30 + 10) = 25%. You need at least 25% equity to call.',
          'Percentages are easier to compare with equity. A useful shortcut for common bet sizes, where the bet is a fraction of the pot before it: ⅓ pot → 20%, ½ pot → 25%, ⅔ pot → 28.6%, ¾ pot → 30%, pot → 33%, 2× pot → 40%.',
        ],
      },
      {
        heading: 'Where pot odds are exact and where they are not',
        body: [
          'Pot odds are exact when calling ends the betting: on the river, or when the opponent is all-in. On earlier streets, the call is only the first payment. You may face more bets (reverse implied odds) or win more when you hit (implied odds), and you will not always realise your equity.',
          'Still, pot odds are the starting point. If your equity is far above the price, calling is usually fine; if it is far below, you need a strong reason (implied odds, fold equity) to continue.',
        ],
      },
    ],
    apply: [
      'Add the bet to the pot; that is what you are playing for.',
      'Divide your call by (pot + your call).',
      'Compare with your equity against their range, not against one hand.',
      'On earlier streets, adjust for implied odds and position.',
    ],
    examples: [
      {
        title: 'Quick pot odds for common sizes',
        steps: [
          'Pot 12bb, opponent bets 4bb (⅓ pot). You call 4bb to win 16bb + 4bb = 20bb: 4/20 = 20%.',
          'Pot 12bb, opponent bets 12bb (pot). You call 12bb into 36bb: 12/36 = 33%.',
          'Pot 12bb, opponent bets 24bb (2× pot). You call 24bb into 60bb: 24/60 = 40%.',
        ],
      },
    ],
    quiz: [
      { q: 'Opponent bets ⅔ pot. Equity needed to call?', options: ['About 25%', 'About 28.6%', 'About 40%'], answer: 1, explain: '(2/3) / (1 + 2/3 + 2/3) = 2/7 ≈ 28.6%.' },
      { q: 'You get 4:1 pot odds. Equity needed?', options: ['20%', '25%', '40%'], answer: 0, explain: '1 / (4 + 1) = 20%.' },
    ],
  },

  'break-even-equity': {
    terms: [
      ['Break-even equity', 'The equity at which calling has zero EV.'],
      ['Break-even fold rate', 'The fold frequency at which a bluff has zero EV.'],
      ['Risk', 'The amount you put in with a bet or raise.'],
      ['Reward', 'The pot you win when everyone folds.'],
    ],
    deeper: [
      {
        heading: 'The mirror between calls and bluffs',
        body: [
          'A caller needs equity of call ÷ (pot + bet + call). A bluffer needs folds of bet ÷ (pot + bet). For a pot-size bet, the caller needs 33% and the bluffer needs 50%. The bluffer needs more because the caller’s money is not yet in the pot when they decide.',
          'These two numbers frame most river decisions. If you think the opponent folds more than the bluffer needs, bluff. If you think you have more equity than the caller needs, call.',
        ],
      },
      {
        heading: 'Raises',
        body: [
          'For a raise used as a bluff, the risk is the whole raise and the reward is everything already in the pot, including the opponent’s bet. If the pot is 10bb, the opponent bets 5bb and you raise to 15bb, you risk 15bb to win 15bb: the raise must work 50% of the time with no equity.',
          'Semi-bluff raises need fewer folds, because when they are called they still win sometimes.',
        ],
      },
    ],
    apply: [
      'Calls: compare equity with call ÷ (pot + call).',
      'Bluffs: compare expected folds with bet ÷ (pot + bet).',
      'Raises: risk is your full raise; reward is the pot including their bet.',
      'Reduce the fold requirement for semi-bluffs by the equity you have when called.',
    ],
    examples: [
      {
        title: 'Raise-bluff math',
        steps: [
          'Pot 20bb on the river. The opponent bets 10bb. You raise to 35bb.',
          'Risk: 35bb. Reward if they fold: 20 + 10 = 30bb.',
          'Break-even fold rate: 35 / (35 + 30) ≈ 54%. Their betting range must fold more than that to your raise.',
        ],
      },
    ],
    quiz: [
      { q: 'A half-pot bluff needs to work how often?', options: ['25%', '33%', '50%'], answer: 1, explain: '0.5 / 1.5 ≈ 33%.' },
      { q: 'For a pot-size bet, which needs more: the caller’s equity or the bluffer’s fold rate?', options: ['Caller’s equity (50%)', 'Bluffer’s fold rate (50%)', 'They are equal'], answer: 1, explain: 'Caller needs 33%; bluffer needs 50%.' },
    ],
  },

  outs: {
    terms: [
      ['Out', 'A card that improves your hand to the likely winner.'],
      ['Clean out', 'An out that does not also improve the opponent.'],
      ['Tainted out', 'An out that may give someone else a better hand.'],
      ['Rule of 2 and 4', 'Multiply outs by 2 for one card to come, by 4 for two (flop all-in).'],
    ],
    deeper: [
      {
        heading: 'Counting outs carefully',
        body: [
          'Start with the obvious outs, then remove the ones that are tainted. With a flush draw on a paired board, some flush cards may give the opponent a full house. With an open-ender where one end makes a flush for the opponent, those cards are tainted.',
          'Also count partial outs. Two overcards might each be an out against one pair, but not if the opponent has a better kicker or a set. Discount outs you are not sure about by half or more.',
        ],
      },
      {
        heading: 'When the rule of 4 overestimates',
        body: [
          'The rule of 4 works because two chances of about outs/47 roughly add up. With many outs it overestimates: 15 outs × 4 = 60%, but the exact chance is about 54%. A better approximation with more than about 8 outs is 4 × outs − (outs − 8).',
          'Also, the rule of 4 assumes you see both cards. If you will face a big bet on the turn, use the rule of 2 for the next card only.',
        ],
      },
    ],
    apply: [
      'Count outs; remove tainted ones; discount uncertain ones.',
      'Use ×2 for one card to come, ×4 only if you will see both cards.',
      'With more than about 8 outs, subtract (outs − 8) from the ×4 estimate.',
      'Compare the result with your pot odds.',
    ],
    examples: [
      {
        title: 'Counting a combo draw',
        steps: [
          'You hold 8♥ 7♥ on 9♥ 6♣ 2♥. Flush draw: 9 hearts. Open-ended straight draw: four 5s and four Ts, of which the 5♥ and T♥ are already counted as hearts.',
          'Total: 9 + 6 = 15 outs.',
          'Rule of 4 gives 60%; the corrected rule gives 60 − 7 = 53%. The exact chance by the river is about 54%.',
        ],
      },
    ],
    quiz: [
      { q: 'How many outs does an open-ended straight draw have?', options: ['4', '8', '9'], answer: 1, explain: 'Four cards on each end.' },
      { q: '12 outs, two cards to come. Best estimate?', options: ['About 48%', 'About 44%', 'About 24%'], answer: 1, explain: '4 × 12 − (12 − 8) = 44%; the exact figure is about 45%.' },
    ],
  },

  'implied-odds': {
    terms: [
      ['Implied odds', 'Extra money you expect to win after you hit.'],
      ['Reverse implied odds', 'Extra money you expect to lose when you make a second-best hand.'],
      ['Disguised hand', 'A hand the opponent is unlikely to put you on, which gets paid more.'],
      ['Effective stack', 'The money still available to win.'],
    ],
    deeper: [
      {
        heading: 'When implied odds are real',
        body: [
          'Implied odds are only as good as the opponent’s willingness to pay. They are large when stacks are deep, your hand is disguised (for example a set or a gutshot straight), and the opponent has a strong hand they will not fold. They are small when the opponent is tight, stacks are short, or your draw is obvious (a third flush card often kills the action).',
          'Implied odds also need you to be in a position to collect. Out of position, you may not get the chance to make a good bet or raise.',
        ],
      },
      {
        heading: 'Reverse implied odds',
        body: [
          'Some hands lose more when they hit than they win: weak flush draws against bigger flushes, top pair with a weak kicker against better kickers, low straights on boards with higher straights possible.',
          'These hands should be played more cautiously than their equity suggests. A hand that “hits” and then loses a big pot is worse than a hand that misses and folds.',
        ],
      },
    ],
    apply: [
      'Estimate how much more you can win when you hit.',
      'Discount it if your draw is obvious or the opponent is tight.',
      'Watch for reverse implied odds: weak draws and weak kickers.',
      'Use implied odds most with deep stacks and disguised hands, in position.',
    ],
    examples: [
      {
        title: 'Calling with a gutshot',
        steps: [
          'Turn: pot 20bb, opponent bets 10bb. You have a gutshot (4 outs) to the nuts. Stacks 150bb.',
          'Immediate price: 10 / 40 = 25%. Your chance to hit: 4/46 ≈ 8.7%. You are well short on direct odds.',
          'To break even, you need to win W extra when you hit: 0.087 × (40 + W) = 10 → W ≈ 75bb. That is possible against a strong hand deep-stacked, but not likely against most players.',
        ],
      },
    ],
    quiz: [
      { q: 'Which draw has the best implied odds?', options: ['A disguised gutshot to the nuts, deep stacks', 'An obvious flush draw, short stacks', 'A low flush draw on a four-flush board'], answer: 0, explain: 'Disguised, deep, to the nuts.' },
      { q: 'Which hand has reverse implied odds?', options: ['A low flush draw', 'The nut flush draw'], answer: 0, explain: 'When it hits it can still lose to a bigger flush.' },
    ],
  },

  'expected-value': {
    terms: [
      ['EV', 'Expected value: the average result of a decision.'],
      ['Outcome tree', 'The list of things that can happen after a decision, with their probabilities.'],
      ['Baseline', 'The action you compare others against, usually checking or folding.'],
      ['EV difference', 'How much better one action is than another.'],
    ],
    deeper: [
      {
        heading: 'Building a simple EV tree',
        body: [
          'List the outcomes of an action and their probabilities. For a bet: opponent folds (you win the pot), opponent calls (you win or lose at showdown), opponent raises (you fold or continue). Multiply each outcome by its probability and add them up.',
          'You do not need precise numbers. Even rough estimates (“they fold about half the time; when they call I win about 30%”) often make the better action clear.',
        ],
      },
      {
        heading: 'Comparing, not just computing',
        body: [
          'Folding is always worth 0 from this point. Checking is worth the share of the pot you win from here without betting. A bet is right when its EV is higher than checking, even if both are positive.',
          'The app’s reviews compute EVs for several options with the same simulated runouts, so the differences between them are more reliable than the absolute numbers.',
        ],
      },
    ],
    apply: [
      'List the outcomes of each option.',
      'Estimate their probabilities roughly.',
      'Compute and compare EVs; pick the highest.',
      'If two options are close, prefer the simpler or less risky one.',
    ],
    examples: [
      {
        title: 'Bluff EV on the river',
        steps: [
          'Pot 20bb. You bet 15bb with a hand that never wins at showdown.',
          'If they fold 50%: EV = 0.5 × 20 − 0.5 × 15 = 10 − 7.5 = +2.5bb.',
          'If they fold 40%: EV = 0.4 × 20 − 0.6 × 15 = 8 − 9 = −1bb.',
          'The break-even fold rate is 15/35 ≈ 43%.',
        ],
      },
    ],
    quiz: [
      { q: 'Pot 10bb, you bluff 10bb, they fold 60%. EV?', options: ['+2bb', '+6bb', '−2bb'], answer: 0, explain: '0.6 × 10 − 0.4 × 10 = 2bb.' },
      { q: 'What is the EV of folding (from now on)?', options: ['0', 'Minus what you put in', 'Depends'], answer: 0, explain: 'Chips already in are sunk.' },
    ],
  },

  'fold-equity': {
    terms: [
      ['Fold equity', 'The value from the times your opponent folds.'],
      ['Shove', 'Going all-in.'],
      ['Calling range', 'The hands that call your shove or bet.'],
      ['Equity when called', 'Your chance to win if the opponent calls.'],
    ],
    deeper: [
      {
        heading: 'Fold equity plus equity when called',
        body: [
          'A bet’s EV has two parts: the times they fold (you win the pot) and the times they call (you win your share of the bigger pot). EV = fold% × pot + call% × (equity × final pot − your bet).',
          'This is why semi-bluffs are powerful: even when fold equity is not enough on its own, the equity when called fills the gap.',
        ],
      },
      {
        heading: 'What increases fold equity',
        body: [
          'Bigger bets (to a point), boards and lines that make your range look strong, opponents who fold too much, and situations where the opponent has a lot to lose (ICM in tournaments). Fold equity falls against stations, in multiway pots, and when the opponent is already committed.',
          'Fold equity also depends on your stack. A shove with a short stack has less fold equity than a raise with a deep stack, because the caller risks less.',
        ],
      },
    ],
    apply: [
      'Estimate how often they fold and your equity when called.',
      'Combine them: fold% × pot + call% × (equity × final pot − bet).',
      'Add fold equity to draws; it often makes betting better than calling.',
      'Reduce your fold-equity estimate in multiway pots and against stations.',
    ],
    examples: [
      {
        title: 'Semi-bluff shove on the flop',
        steps: [
          'Pot 20bb, you have 30bb left with a flush draw (about 36% when called, all-in on the flop).',
          'If they fold 40%: EV = 0.4 × 20 + 0.6 × (0.36 × 80 − 30) = 8 + 0.6 × (−1.2) ≈ +7.3bb.',
          'Without fold equity (they always call): EV = 0.36 × 80 − 30 = −1.2bb. Fold equity turns a slightly losing call into a strong shove.',
        ],
      },
    ],
    quiz: [
      { q: 'Which opponent gives you the least fold equity?', options: ['A calling station', 'A nit', 'A tight regular'], answer: 0, explain: 'They call too much.' },
      { q: 'Fold equity matters most for…', options: ['Semi-bluffs and bluffs', 'Pure value bets', 'Checks'], answer: 0, explain: 'Value bets want calls; bluffs want folds.' },
    ],
  },

  'equity-vs-range': {
    terms: [
      ['Equity vs a hand', 'Your chance to win against one specific holding.'],
      ['Equity vs a range', 'Your average equity against all hands in the range, weighted by likelihood.'],
      ['Range breakdown', 'Your equity against each category of their range.'],
      ['Card removal', 'How your cards change the combos they can hold.'],
    ],
    deeper: [
      {
        heading: 'Why a single-hand view misleads',
        body: [
          'It is tempting to think “they probably have AK, so I am behind”. But their range contains many hands. Against some you are crushed, against others you are far ahead. Your real equity is the weighted average.',
          'For example, 99 facing a shove has about 55% against AK and about 18% against QQ+. Against a range of QQ+ and AK, the average depends on how many combos of each there are: 18 combos of QQ+ and 16 of AK gives roughly 35%.',
        ],
      },
      {
        heading: 'Think in categories',
        body: [
          'Split their range into categories: hands that beat you, hands you beat, and draws. Your equity against each is easy to estimate. Then weight by how many combos are in each.',
          'The app’s range breakdowns and the equity calculator on the Ranges page let you check these numbers precisely.',
        ],
      },
    ],
    apply: [
      'Write down their range, not one hand.',
      'Split it into hands you beat, hands that beat you and draws.',
      'Weight by combos.',
      'Use the equity calculator to check your estimate.',
    ],
    examples: [
      {
        title: 'Calling a shove with AJ',
        steps: [
          'An opponent shoves with a range of 88+, AQ+. After removing the ace and jack you hold, that is 36 pair combos and 24 AQ/AK combos.',
          'AJ vs 88–TT: about 44%. AJ vs QQ/KK: about 28%; vs JJ about 12%; vs AA about 8%. AJ vs AQ/AK: about 26%.',
          'Weighting by combos gives roughly 30%. If the price requires 40%, it is a fold even though AJ “looks good”.',
        ],
      },
    ],
    quiz: [
      { q: 'Which matters for your decision?', options: ['Equity against their most likely hand', 'Equity against their whole range'], answer: 1, explain: 'You face the whole range, weighted.' },
      { q: 'How many combos of AK exist without card removal?', options: ['12', '16', '4'], answer: 1, explain: '4 suited + 12 offsuit = 16.' },
    ],
  },

  combinatorics: {
    terms: [
      ['Combo', 'A specific two-card hand.'],
      ['Pair combos', '6 per pocket pair (4 choose 2).'],
      ['Suited / offsuit combos', '4 per suited hand, 12 per offsuit hand.'],
      ['Card removal', 'Visible cards reduce the combos available.'],
    ],
    deeper: [
      {
        heading: 'The basic counts',
        body: [
          'Pocket pairs: 6 combos each. Suited non-pairs: 4 each. Offsuit non-pairs: 12 each. So AK has 16 combos, AKs 4 and AKo 12. There are 1,326 two-card hands in total.',
          'Card removal: if one card of a rank is visible, pairs of that rank drop from 6 to 3 combos, and non-pair hands containing that rank drop by a quarter (from 16 to 12 for AK if one ace is visible). If two are visible, pairs drop to 1.',
        ],
      },
      {
        heading: 'Using combos in decisions',
        body: [
          'Counting combos tells you how often each part of a range really appears. On a board of K♠ 8♦ 3♣, sets of kings have only 3 combos (one king is on the board), while AK has 12 combos. So “they could have a set” is true, but AK is four times as likely.',
          'On the river, count value combos and bluff combos. If they would bet 20 combos of value and 15 of bluffs, bluffs are 43% of their range — enough to call against most sizes.',
        ],
      },
    ],
    apply: [
      'Use 6 / 4 / 12 for pairs, suited and offsuit hands.',
      'Remove combos for every card you can see.',
      'Compare the number of value combos and bluff combos.',
      'Use the counts, not just the names, when deciding.',
    ],
    examples: [
      {
        title: 'Sets vs top pair on a king-high board',
        steps: [
          'Board: K♠ 8♦ 3♣. You hold A♦ K♣.',
          'Sets: KK has 1 combo (two kings are known), 88 has 3, 33 has 3: 7 combos.',
          'AK: you hold an ace and a king, and one king is on the board, so only 3 aces × 2 kings = 6 combos remain.',
          'KQ: 4 queens × 2 kings = 8 combos.',
        ],
      },
    ],
    quiz: [
      { q: 'How many combos of KQo exist without card removal?', options: ['4', '12', '16'], answer: 1, explain: 'Offsuit non-pair: 12.' },
      { q: 'One king is on the board. How many combos of KK remain?', options: ['6', '3', '1'], answer: 1, explain: 'Three kings left: 3 choose 2 = 3.' },
    ],
  },

  'bluff-value-ratios': {
    terms: [
      ['Value-to-bluff ratio', 'How many value combos the bettor has for each bluff.'],
      ['Indifference', 'When two actions have the same EV, so the player does not mind which they choose.'],
      ['Polarised river', 'A river spot where the bettor has only strong hands or bluffs.'],
      ['Toy game', 'A simplified model used to understand a principle.'],
    ],
    deeper: [
      {
        heading: 'Where the formula comes from',
        body: [
          'In a simple river game, the bettor has either the nuts or nothing, and the caller has a bluff-catcher. The caller is indifferent when the bluff share of the betting range equals the price: bet ÷ (pot + 2 × bet). For a pot-size bet that is 1/3: one bluff for every two value hands.',
          'Smaller bets need fewer bluffs (a half-pot bet: 25% bluffs), larger bets allow more (a 2× pot bet: 40% bluffs).',
        ],
      },
      {
        heading: 'Why real spots differ',
        body: [
          'Real ranges are not split into nuts and air: some value hands lose to better value, some bluffs have equity, and the caller has a range of bluff-catchers of different strength. On the flop and turn, “bluffs” are usually draws with real equity, so the ratios can contain many more bluffs.',
          'Use the ratio as a reference for river decisions, especially when you are deciding how many missed draws to bluff with.',
        ],
      },
    ],
    apply: [
      'On the river, count your value combos for the chosen size.',
      'Bluff with about bet ÷ (pot + 2 × bet) of the betting range.',
      'Pick bluffs with good blockers and no showdown value.',
      'Adjust: more bluffs against folders, fewer against stations.',
    ],
    examples: [
      {
        title: 'How many bluffs?',
        steps: [
          'River, you plan a ¾-pot bet. You have 24 value combos.',
          'Bluff share: 0.75 / (1 + 1.5) = 30%. Bluffs = 24 × 0.3 / 0.7 ≈ 10 combos.',
          'Choose about 10 missed-draw combos with blockers, and check the rest.',
        ],
      },
    ],
    quiz: [
      { q: 'For a half-pot river bet, what bluff share makes a bluff-catcher indifferent?', options: ['20%', '25%', '33%'], answer: 1, explain: '0.5 / (1 + 1) = 25%.' },
      { q: 'Why can flop betting ranges contain more “bluffs”?', options: ['Bluffs on the flop usually have equity', 'Flop bets are always called', 'They cannot'], answer: 0, explain: 'Draws win often when called.' },
    ],
  },

  mdf: {
    terms: [
      ['MDF', 'Minimum defence frequency: pot ÷ (pot + bet).'],
      ['Any-two-cards bluff', 'A bluff that would profit with any hand because you fold too often.'],
      ['Over-folding', 'Folding more than MDF suggests.'],
      ['Exploitative deviation', 'Folding or calling more than MDF based on the opponent’s tendencies.'],
    ],
    deeper: [
      {
        heading: 'What MDF really says',
        body: [
          'If you fold more than 1 − MDF of your range, the opponent can bet any two cards and profit immediately. For a pot-size bet, MDF is 50%: you must continue with half your range to stop that.',
          'MDF is a property of your whole range, not a rule for each hand. It tells you how wide your continuing range should be, not whether a specific hand calls.',
        ],
      },
      {
        heading: 'When not to follow it',
        body: [
          'MDF assumes the opponent might bluff with anything. Real opponents bluff far less in many spots, especially on rivers and in big pots. Against them, folding more than MDF is correct. MDF also ignores rake, future streets, and the fact that your range may be weak because of earlier mistakes.',
          'Use it as a warning light: if you are folding far more than MDF suggests against an aggressive player, you may be exploitable.',
        ],
      },
    ],
    apply: [
      'Compute MDF: pot ÷ (pot + bet).',
      'Check whether your continuing range is close to that share of your range.',
      'Fold more against players who rarely bluff; call more against aggressive ones.',
      'Use MDF as a check on your range, not a rule for each hand.',
    ],
    examples: [
      {
        title: 'MDF on three bet sizes',
        steps: [
          'Half pot: MDF = 1 / 1.5 = 67%.',
          'Pot: MDF = 1 / 2 = 50%.',
          '2× pot: MDF = 1 / 3 = 33%.',
          'Bigger bets let you fold more, but each call costs more.',
        ],
      },
    ],
    quiz: [
      { q: 'Facing a ⅓-pot bet, MDF is about…', options: ['50%', '67%', '75%'], answer: 2, explain: '1 / (1 + 1/3) = 75%.' },
      { q: 'Against a player who almost never bluffs, you should…', options: ['Fold more than MDF', 'Defend exactly MDF', 'Call more than MDF'], answer: 0, explain: 'MDF assumes bluffs that are not there.' },
    ],
  },

  'equity-not-action': {
    terms: [
      ['Raw equity', 'All-in equity with no more betting.'],
      ['Realisation', 'How much of your equity you actually win.'],
      ['Fold equity', 'Value from the opponent folding.'],
      ['Strategic value', 'Things equity does not capture: position, future decisions, ranges.'],
    ],
    deeper: [
      {
        heading: 'Three reasons equity is not enough',
        body: [
          'First, realisation: out of position, or with weak hands, you win less than your equity. Second, fold equity: a bet can win the pot even when you are behind, so a hand with low equity can still bet. Third, what happens next: a hand with high equity may still prefer to check if a bet only gets called by better hands.',
          'This is why “I had 60% so I should bet” and “I had 30% so I should fold” are both incomplete. Compare the EV of the actions instead.',
        ],
      },
      {
        heading: 'Typical surprises',
        body: [
          'A strong hand on a dry board may check because it is rarely outdrawn and checking keeps bluffs in. A draw with 35% may raise because the fold equity and the equity when called add up. A pair with 55% may check-call because betting gets called only by better hands and folds out the rest.',
          'Reviews in this app often show these: the best action is not always the one equity points to.',
        ],
      },
    ],
    apply: [
      'Treat equity as one input, not the answer.',
      'Ask how much of it you will realise.',
      'Ask how the opponent responds to each action.',
      'Compare EVs of all options before choosing.',
    ],
    examples: [
      {
        title: 'Same equity, different actions',
        steps: [
          'Two hands each have about 50% equity on the turn against the opponent’s range.',
          'Hand A is a pair that loses to every hand that calls a bet. Best: check, and call some bets.',
          'Hand B is a combo draw that gets many folds from better pairs. Best: bet or raise.',
        ],
      },
    ],
    quiz: [
      { q: 'A hand with 60% equity should always bet. True?', options: ['True', 'False'], answer: 1, explain: 'If only better hands call, betting can earn less.' },
      { q: 'Which factor can make a low-equity hand a good bet?', options: ['Fold equity', 'Bad position', 'Rake'], answer: 0, explain: 'Folds win the pot outright.' },
    ],
  },
};
