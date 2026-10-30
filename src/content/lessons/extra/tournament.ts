import type { LessonExtra } from '../types';

export const TOURNAMENT_X: Record<string, LessonExtra> = {
  'antes-stack-depth': {
    terms: [
      ['Blind level', 'A period of the tournament with fixed blinds and antes.'],
      ['M-ratio', 'Stack ÷ (blinds + antes): how many orbits you can survive without playing.'],
      ['Big-blind ante', 'A single ante paid by the big blind for the whole table.'],
      ['Effective stack', 'The smaller stack in a confrontation, measured in big blinds.'],
    ],
    deeper: [
      {
        heading: 'Why tournament stacks keep shrinking',
        body: [
          'Blinds rise at every level, but your chips do not unless you win pots. A 100bb starting stack can be 40bb a few levels later without losing a hand. Strategy has to change as depth falls.',
          'Keep track of your stack in big blinds, not chips. Each level, recalculate where you are: deep (60bb+), medium (25–60bb), short (12–25bb) or push/fold (under about 12bb).',
        ],
      },
      {
        heading: 'How antes change ranges',
        body: [
          'With a big-blind ante, the pot starts at 2.5bb instead of 1.5bb. Steals need fewer folds to profit, so opening ranges widen, especially from late position. The big blind also gets a better price and should defend more.',
          'Smaller open sizes (2–2.2bb) are common with antes, because the dead money makes even small raises profitable and they lose less when re-shoved on.',
        ],
      },
    ],
    apply: [
      'Recalculate your stack in big blinds at every level.',
      'Widen opens from late position when antes are in play.',
      'Defend the big blind wider with antes.',
      'Shift toward shove-or-fold strategies as you get short.',
    ],
    examples: [
      {
        title: 'Stealing with and without antes',
        steps: [
          'Button opens 2.2bb with no ante: risk 2.2 to win 1.5, needs about 59% folds.',
          'With a 1bb big-blind ante: risk 2.2 to win 2.5, needs about 47% folds.',
          'The same hand can be a fold without antes and a clear open with them.',
        ],
      },
    ],
    quiz: [
      { q: 'At 1,000/2,000 with a 2,000 BB ante, you have 30,000. How many big blinds?', options: ['10bb', '15bb', '30bb'], answer: 1, explain: '30,000 / 2,000 = 15bb.' },
      { q: 'Antes make steals…', options: ['More profitable', 'Less profitable'], answer: 0, explain: 'More dead money to win.' },
    ],
  },

  'short-stack': {
    terms: [
      ['Re-shove / re-steal', 'Going all-in over someone else’s open.'],
      ['Open-shove', 'Going all-in as the first raise.'],
      ['Fold equity', 'Value from the times opponents fold.'],
      ['Stack-to-raise ratio', 'How big your stack is compared with the open you face.'],
    ],
    deeper: [
      {
        heading: 'Why re-shoves are so strong',
        body: [
          'When a player opens from late position, their range is wide. If you re-shove 15–25bb, many of their hands cannot call profitably, so they fold and you win the open plus the blinds and antes. That is often 4–5bb of dead money (the open, the blinds and the ante) for a hand that might be behind.',
          'When called, you are often flipping or slightly behind, but the fold equity makes the whole play profitable. The best re-shove hands have good equity when called (pairs, strong aces, suited broadways) and block the opener’s calling hands.',
        ],
      },
      {
        heading: 'Avoid the middle ground',
        body: [
          'With 15–20bb, raising and folding to a shove wastes chips, and flat-calling with weak hands lets you get squeezed. Many short-stack decisions are best as shove or fold, or as a small raise with hands you will happily call a shove with.',
          'Keep track of who is likely to open wide (late position, aggressive players) and who is likely to call wide (big stacks, players who do not respect ICM).',
        ],
      },
    ],
    apply: [
      'At 12–25bb, look for re-shoves over late-position opens.',
      'Choose re-shove hands with good equity when called and good blockers.',
      'Avoid raise-folding a large share of your stack.',
      'Consider who might call: big stacks call wider, medium stacks tighter.',
    ],
    examples: [
      {
        title: 'Re-shove math',
        steps: [
          'You have 18bb in the big blind, not counting the 1bb ante you posted. The button opens to 2.2bb; with blinds and the ante the pot is 4.7bb.',
          'You shove 18bb. If the button folds 65% of the time, you win 4.7bb immediately.',
          'When called (35%), you have about 45% against their calling range: the pot is then 18 + 18 + 0.5 + 1 = 37.5bb, so you win about 0.45 × 37.5bb and risk 17bb more.',
          'EV ≈ 0.65 × 4.7 + 0.35 × (0.45 × 37.5 − 17) ≈ 3.1 − 0.04 ≈ +3bb. The fold equity is what makes it profitable.',
        ],
      },
    ],
    quiz: [
      { q: 'Why is a re-shove over a button open often better than calling?', options: ['Fold equity against a wide range', 'Calling is never allowed', 'Shoves always win'], answer: 0, explain: 'Many of the button’s hands cannot call an all-in.' },
      { q: 'Which hand is a better re-shove?', options: ['A9o', '72o'], answer: 0, explain: 'Good equity when called and blocks some calling hands (AT+).' },
    ],
  },

  'push-fold': {
    terms: [
      ['Push/fold', 'A strategy of only going all-in or folding preflop.'],
      ['Nash push/fold chart', 'An equilibrium chart for shoving and calling in a simplified model.'],
      ['Calling range', 'The hands that call a shove.'],
      ['Chip EV', 'Expected value in chips, ignoring payouts.'],
    ],
    deeper: [
      {
        heading: 'Why push/fold works at short stacks',
        body: [
          'At around 10bb or less, a normal raise commits a large share of your stack. If you raise and fold to a shove, you have wasted a big chunk. Going all-in instead uses your fold equity fully and avoids difficult postflop decisions.',
          'The equilibrium ranges are wider than most players expect. In heads-up small blind vs big blind at 10bb, the small blind can shove more than half of all hands, because the big blind cannot call wide enough to punish it.',
        ],
      },
      {
        heading: 'Calling ranges are tighter than shoving ranges',
        body: [
          'The shover wins the blinds when the caller folds, so they can shove wide. The caller has no fold equity and needs real equity against the shoving range. This asymmetry is why calling ranges are noticeably tighter.',
          'In tournaments with ICM pressure, both ranges tighten, but calling ranges tighten more, especially near pay jumps.',
        ],
      },
    ],
    apply: [
      'Under about 10–12bb, use push/fold as your default first-in strategy.',
      'Shove wider in late position and against tight players.',
      'Call shoves tighter than you would shove.',
      'Tighten calls further near pay jumps (ICM).',
    ],
    examples: [
      {
        title: 'Shove vs call at 8bb',
        steps: [
          'You are in the small blind with K♦ 7♣, 8bb effective, folded to you.',
          'The computed chart in the Ranges tab (SB shove, 8bb) includes K7o: shove.',
          'If you were the big blind facing an 8bb shove, the computed calling chart also calls K7o — the price is good — but its calling range (about 45% of hands) is much narrower than the 63% shoving range, because the caller has no fold equity.',
        ],
      },
    ],
    quiz: [
      { q: 'Why can the shover play wider than the caller?', options: ['The shover wins the blinds when the caller folds', 'Shoving is cheaper', 'The caller has position'], answer: 0, explain: 'Fold equity adds value only for the aggressor.' },
      { q: 'At 6bb, raising to 2bb and folding to a shove loses…', options: ['A third of your stack', 'Nothing', 'All your chips'], answer: 0, explain: '2 of 6bb.' },
    ],
  },

  'chip-ev-vs-icm': {
    terms: [
      ['Chip EV (cEV)', 'Expected chips gained or lost.'],
      ['$EV', 'Expected prize money gained or lost.'],
      ['ICM', 'The Independent Chip Model, a way of converting stacks into prize equity.'],
      ['Pay jump', 'The increase in prize money when another player busts.'],
    ],
    deeper: [
      {
        heading: 'Why chips are not money',
        body: [
          'In a cash game, a chip is always worth its face value. In a tournament, your prize depends on your finishing position, not your chip count. Doubling your stack does not double your prize; losing your stack ends your tournament.',
          'So the chips you might lose are worth more to you than the chips you might win. A play that is +EV in chips can be −EV in prize money, especially near pay jumps.',
        ],
      },
      {
        heading: 'When cEV and $EV agree',
        body: [
          'Early in a tournament, far from the money, chip EV is a reasonable guide. Near the bubble and at final tables, the difference grows. Winner-take-all formats make chips closer to linear, so chip EV is a better guide there.',
          'Satellites (where all top finishers win the same prize) are the extreme: once you have enough chips to secure a seat, extra chips are worth almost nothing.',
        ],
      },
    ],
    apply: [
      'Early on, use chip EV.',
      'Near pay jumps, use ICM: avoid marginal all-ins, especially calls.',
      'Steal more from players who are under more ICM pressure than you.',
      'In satellites, protect a safe stack above everything.',
    ],
    examples: [
      {
        title: 'A +cEV call that loses money',
        steps: [
          'Bubble, four players, three paid. You are a medium stack and the chip leader shoves on you.',
          'You have 47% equity, and with the dead money in the pot the call is slightly +EV in chips.',
          'If you lose, you bust with no prize; if you win, you gain chips but your prize equity rises less. ICM shows the call loses money. Fold.',
        ],
      },
    ],
    quiz: [
      { q: 'In which format is chip EV the best guide?', options: ['Winner-take-all', 'Satellite', 'Final table with big pay jumps'], answer: 0, explain: 'Prize value is almost proportional to chips.' },
    ],
  },

  icm: {
    terms: [
      ['ICM', 'Assigns each player a share of the prize pool based on stack sizes.'],
      ['Risk premium', 'Extra equity needed above chip-EV break-even because of ICM.'],
      ['Bubble factor', 'The ratio of what you lose by busting to what you gain by doubling, in prize terms.'],
      ['Malmuth–Harville', 'The standard method used by ICM to estimate finishing probabilities.'],
    ],
    deeper: [
      {
        heading: 'How ICM works, in short',
        body: [
          'ICM estimates the chance that each player finishes in each position. It assumes the chance of finishing first is proportional to stack size, then repeats for the remaining places. Multiply each place’s probability by its prize, add them up, and you have each player’s prize equity.',
          'It ignores skill, position and blind levels, so it is an approximation. But it captures the key effect: bigger stacks gain less per chip, and busting near the money is very costly.',
        ],
      },
      {
        heading: 'Who feels pressure',
        body: [
          'Medium stacks facing covering stacks feel the most pressure: they have a lot to lose and can bust. Big stacks feel less, because they can lose a pot and still be fine. Very short stacks often feel less too, because they are likely to bust soon anyway.',
          'This creates a dynamic: big stacks can attack medium stacks, medium stacks should avoid each other and big stacks, and short stacks should look for good spots to double.',
        ],
      },
    ],
    apply: [
      'Identify the pay jumps and how close you are to them.',
      'Note who covers whom.',
      'Medium stack facing a big stack: tighten calls significantly.',
      'Big stack: apply pressure to medium stacks who cannot call lightly.',
    ],
    examples: [
      {
        title: 'Risk premium in numbers',
        steps: [
          'A call is break-even in chips at 45% equity.',
          'Near the bubble, ICM might raise the requirement to 55% or more for a medium stack facing the chip leader.',
          'That 10% gap is the risk premium. Hands that were clear calls become folds.',
        ],
      },
    ],
    quiz: [
      { q: 'ICM assumes the chance of winning is…', options: ['Proportional to stack size', 'Equal for everyone', 'Based on skill'], answer: 0, explain: 'That is the Malmuth–Harville assumption.' },
      { q: 'Who usually has the smallest risk premium on the bubble?', options: ['The big stack', 'A medium stack', 'Everyone equal'], answer: 0, explain: 'They can lose a pot and survive.' },
    ],
  },

  'final-table': {
    terms: [
      ['Ladder', 'Moving up the payouts as other players bust.'],
      ['Short stack', 'A player with very few big blinds, likely to bust soon.'],
      ['Chip leader', 'The player with the most chips.'],
      ['Pay jump', 'Extra money from finishing one place higher.'],
    ],
    deeper: [
      {
        heading: 'Pay jumps change everyone’s incentives',
        body: [
          'At a final table every bust usually means a pay jump. A player with an average stack may prefer to fold marginal hands and let short stacks bust first. This is called laddering.',
          'The chip leader can use this: open more, especially into medium stacks who would rather fold. But the leader also needs to avoid big confrontations with the second-biggest stack.',
        ],
      },
      {
        heading: 'Short stacks and medium stacks',
        body: [
          'Short stacks should look for good spots to double up, often by shoving first in. Medium stacks should avoid calling off their stack lightly, especially against big stacks, while a shorter stack is still at the table.',
          'As the table gets shorter (fewer players), ranges widen again, and heads-up play is close to chip EV because only the final pay jump remains.',
        ],
      },
    ],
    apply: [
      'Note the pay jumps and who is short.',
      'Medium stack: avoid big all-ins against covering stacks while shorter stacks remain.',
      'Big stack: open more into medium stacks.',
      'Short stack: look for first-in shoves and good double-up spots.',
    ],
    examples: [
      {
        title: 'Folding a good hand on purpose',
        steps: [
          'Final table, six players. One player has 3bb. You have 20bb, and the chip leader (60bb) shoves into you.',
          'You hold A♠ J♦, a hand you would call in chip EV terms.',
          'If you lose, you bust before the 3bb stack. If you fold, there is a good chance the short stack busts first and you move up. ICM often favors folding.',
        ],
      },
    ],
    quiz: [
      { q: 'Heads-up at the end of a tournament, play is closest to…', options: ['Chip EV', 'Extreme ICM'], answer: 0, explain: 'Only one pay jump remains.' },
    ],
  },

  'covering-stacks': {
    terms: [
      ['Cover', 'Having more chips than an opponent, so you can bust them.'],
      ['Covered', 'Having fewer chips, so a loss can bust you.'],
      ['Elimination risk', 'The chance of busting from a confrontation.'],
      ['Stack leverage', 'Pressure you can apply because you cover others.'],
    ],
    deeper: [
      {
        heading: 'Why covering matters',
        body: [
          'When you cover an opponent, the worst case in an all-in is losing part of your stack. When you are covered, the worst case is busting. Near pay jumps, that asymmetry is large.',
          'Covering stacks can open and shove more against covered players, who must call tighter. Covered players should avoid marginal confrontations with the stacks that can bust them.',
        ],
      },
      {
        heading: 'Choosing your targets',
        body: [
          'As a big stack, target medium stacks: they have a lot to lose and cannot call lightly. Be more careful against other big stacks, because a loss there costs you a lot and both of you can absorb it.',
          'As a medium stack, attack shorter stacks you cover and avoid the big stacks.',
        ],
      },
    ],
    apply: [
      'Before an all-in, check who covers whom.',
      'If you cover them, apply pressure, especially near pay jumps.',
      'If they cover you, tighten your calls.',
      'Attack medium stacks; avoid big stacks unless you are strong.',
    ],
    examples: [
      {
        title: 'Same hand, covered vs covering',
        steps: [
          'You have 25bb on the bubble. A player with 40bb shoves; you hold 9♠ 9♦.',
          'They cover you: a loss busts you. ICM makes this a tight call.',
          'If the shover had 15bb (you cover them), a loss leaves you with 10bb. The call becomes much easier.',
        ],
      },
    ],
    quiz: [
      { q: 'Near the bubble, who should you target as a big stack?', options: ['Medium stacks', 'Other big stacks', 'Nobody'], answer: 0, explain: 'They have the most to lose.' },
      { q: 'You are covered by the shover. Your call should be…', options: ['Tighter', 'Looser'], answer: 0, explain: 'A loss busts you.' },
    ],
  },

  payouts: {
    terms: [
      ['Top-heavy', 'A payout structure where most money goes to the top few places.'],
      ['Flat', 'A structure where prizes are more evenly spread.'],
      ['Satellite', 'A tournament where several top finishers win the same prize (often a seat).'],
      ['Min-cash', 'The smallest prize, for finishing just inside the money.'],
    ],
    deeper: [
      {
        heading: 'Top-heavy payouts reward chips',
        body: [
          'When most of the prize pool goes to first, second and third, building a big stack is valuable, and survival alone is worth less. Players can take more risks to accumulate chips.',
          'Most large tournaments are fairly top-heavy at the final table, which is why chip accumulation remains important even with ICM.',
        ],
      },
      {
        heading: 'Flat payouts reward survival',
        body: [
          'When prizes are similar across places, the most important thing is to finish in the money. ICM pressure is high: folding strong hands to avoid busting can be correct. Satellites are the extreme case.',
          'In satellites with a safe stack, you may fold even AA preflop near the bubble, because winning chips adds almost nothing while busting loses your seat.',
        ],
      },
    ],
    apply: [
      'Look at the payout structure before the bubble.',
      'Top-heavy: chips matter; take more good risks.',
      'Flat: survival matters; avoid marginal all-ins.',
      'Satellites: once safe, fold almost everything.',
    ],
    examples: [
      {
        title: 'Two structures, same spot',
        steps: [
          'Four players left, three paid. You have a medium stack and face a shove with A♦ T♣.',
          'Top-heavy payouts (50/30/20): calling is reasonable if the equity is there.',
          'Flat payouts (34/33/33): the call risks almost the whole prize for little extra gain. Fold.',
        ],
      },
    ],
    quiz: [
      { q: 'In a satellite, ICM pressure is…', options: ['Very high', 'Very low'], answer: 0, explain: 'All top finishers win the same prize.' },
      { q: 'Top-heavy payouts make chip accumulation…', options: ['More important', 'Less important'], answer: 0, explain: 'Most money goes to the top.' },
    ],
  },

  bounties: {
    terms: [
      ['Bounty', 'A cash prize for eliminating a player.'],
      ['Progressive knockout (PKO)', 'A format where part of each bounty you win is added to your own bounty.'],
      ['Bounty equity', 'The value of the bounty times your chance to win it.'],
      ['Covering for the bounty', 'You can only win a bounty if you have more chips than the eliminated player.'],
    ],
    deeper: [
      {
        heading: 'How bounties change calls',
        body: [
          'A bounty adds extra money to a pot when you can eliminate a player. If you cover them, the bounty acts like extra dead money: you need less equity to call. The bigger the bounty relative to the pot, the bigger the effect.',
          'If you are covered, the bounty does not help you: you cannot win it in that pot. Your calls stay normal (or tighter under ICM).',
        ],
      },
      {
        heading: 'Converting a bounty into big blinds',
        body: [
          'To compare a bounty with pot odds, convert it into chips. One common approach is to divide the bounty’s cash value by the tournament buy-in’s value per chip. The result depends on the format, so treat it as an estimate.',
          'In PKOs, only part of the bounty is paid immediately; the rest goes to your own head. This makes the immediate value smaller than the headline figure early on, and larger later.',
        ],
      },
    ],
    apply: [
      'Check whether you cover the all-in player.',
      'If you do, convert the bounty to big blinds and add it to the pot.',
      'Call wider with that extra value; open-shove into covered players with big bounties less often if they call wide.',
      'If you are covered, ignore the bounty for this decision.',
    ],
    examples: [
      {
        title: 'A bounty lowers the required equity',
        steps: [
          'An opponent shoves 10bb. The pot after your call would be 21.5bb, and you must call 9bb (you are in the big blind).',
          'Without a bounty, you need 9 / 21.5 ≈ 42% equity.',
          'If the bounty is worth about 8bb to you, the pot is effectively 29.5bb: 9 / 29.5 ≈ 31%. Many more hands become calls.',
        ],
      },
    ],
    quiz: [
      { q: 'You are covered by the shover. Does their bounty help your call?', options: ['Yes', 'No'], answer: 1, explain: 'You cannot eliminate them in this pot.' },
      { q: 'A bounty you can win makes your calls…', options: ['Wider', 'Tighter'], answer: 0, explain: 'It is extra money in the pot.' },
    ],
  },
};
