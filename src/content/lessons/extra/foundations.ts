import type { LessonExtra } from '../types';

export const FOUNDATIONS_X: Record<string, LessonExtra> = {
  'rules-rankings': {
    terms: [
      ['Kicker', 'An unpaired side card used to break ties between hands of the same rank. With A♠K♦ on A♣9♥4♦7♠2♣, your kicker is the king.'],
      ['Board plays', 'When the five community cards are your best hand. Everyone still in the hand has at least that, so the pot is usually split.'],
      ['Counterfeited', 'When a board card improves everyone so that your hand no longer stands out, for example your two pair becomes a worse two pair once the board pairs.'],
      ['Nuts', 'The best possible hand given the board. “Near-nuts” are hands that are almost never beaten.'],
    ],
    deeper: [
      {
        heading: 'Reading the board in five seconds',
        body: [
          'A reliable routine stops you misreading a hand. First, check whether the board is paired: if it is, full houses and quads are possible. Second, count the suits: three cards of one suit means a flush is possible. Third, look for three cards within a five-card window (for example 7-8-T or 9-J-Q): that makes a straight possible.',
          'Then ask what the best possible hand is (the nuts), and which of the most likely hands beat you. On K♥ T♥ 9♣ 4♥ 2♠ the nuts is the ace-high flush, and any two hearts, any QJ, and any set or two pair is ahead of a hand like A♠ K♣.',
        ],
      },
      {
        heading: 'Ties, kickers and when kickers do not count',
        body: [
          'Only five cards play. If two players have a pair of kings, the next highest cards decide it, and only up to five cards in total. On K♠ K♦ Q♣ J♥ 9♠, A♣ 2♦ beats 7♣ 6♦ because the ace plays as a kicker, but 3♣ 2♦ and 4♥ 3♦ split because both play the board (K K Q J 9).',
          'Two pair compares the higher pair, then the lower pair, then the kicker. A flush compares the highest card, then the next, and so on through all five cards. Suits never matter.',
        ],
      },
      {
        heading: 'All-ins and side pots',
        body: [
          'A player can never win more from each opponent than they put in themselves. When a short stack is all-in and others keep betting, the extra chips go into a side pot that the all-in player cannot win.',
          'Example: A has 20bb, B and C have 100bb each. All three get 20bb in, then B and C bet another 50bb each. The main pot is 60bb (A, B and C can win it) and the side pot is 100bb (only B or C). If A has the best hand, A wins 60bb and the better of B and C wins the side pot.',
        ],
      },
    ],
    apply: [
      'Before acting on any street, say the nuts to yourself and the two or three most likely hands that beat you.',
      'Check whether the board is paired or has three of a suit before deciding your hand is strong.',
      'When a pot is split-prone (the board plays or nearly plays), be careful putting more money in with hands that only tie.',
      'Use “raise to” amounts: count the total you will have in front of you, not the extra.',
    ],
    examples: [
      {
        title: 'Kicker or split?',
        steps: [
          'Board: Q♠ Q♦ 8♣ 8♥ 3♠. You hold A♣ 5♦; your opponent holds K♣ J♦.',
          'Both of you have two pair, queens and eights, from the board. The fifth card decides: your ace beats their king.',
          'Change the river to an A♠: board Q Q 8 8 A. Now the ace on the board is the best kicker for everyone, so you split.',
        ],
      },
    ],
    quiz: [
      { q: 'Board: J♠ J♦ 7♣ 7♥ 2♠. You hold A♠ 3♦, opponent holds K♣ Q♦. Who wins?', options: ['You', 'Opponent', 'Split'], answer: 0, explain: 'Both have jacks and sevens; your ace is the best fifth card.' },
      { q: 'Three players: A all-in for 10bb, B and C put in 40bb each. How big is the main pot A can win?', options: ['30bb', '50bb', '90bb'], answer: 0, explain: 'A can win 10bb from each of the three players (including their own), so 30bb. The other 60bb is a side pot.' },
    ],
  },

  position: {
    terms: [
      ['In position (IP)', 'Acting after your opponent on the current and later streets.'],
      ['Out of position (OOP)', 'Acting first, before you know what your opponent will do.'],
      ['Equity realization', 'How much of your raw equity you actually win on average once betting is taken into account. Position raises it.'],
      ['Check behind', 'Checking as the last player to act, which ends the betting round and gives a free card.'],
    ],
    deeper: [
      {
        heading: 'Why acting last is worth so much',
        body: [
          'When you act last, every decision your opponent makes is information you get for free. If they check, they are usually weaker; if they bet, you can fold weak hands cheaply, call with draws, and raise strong hands. Out of position you have to guess first.',
          'Position also gives you control of the pot size. In position you can check behind to stop a pot growing with a medium hand, or to take a free card with a draw. Out of position, a check can be met with a bet, so you often face a choice between building a pot you did not want and folding.',
        ],
      },
      {
        heading: 'Position is relative, and it lasts the whole hand',
        body: [
          'Position is about who you are against, not just your seat. The cutoff is in position against the hijack but out of position against the button. Before you call a raise, ask who could still enter the pot behind you and who you will act after on the flop.',
          'Preflop, the blinds act last, but on every later street they act first. This is why the big blind defends many hands only because the price is good, and still loses money with most of them overall. It loses less by defending than by folding.',
        ],
      },
    ],
    apply: [
      'Before entering a pot, ask: who is left to act behind me, and will I be in or out of position after the flop?',
      'Open wider as you get closer to the button; tighten up when several players are still to act.',
      'Out of position, prefer hands that can stand pressure (pairs, strong aces, suited hands with draws) and avoid weak offsuit hands.',
      'In position, use your extra options: check behind with medium hands, take free cards, and bet when checked to.',
    ],
    examples: [
      {
        title: 'Calling a raise from the cutoff vs the button',
        steps: [
          'The hijack opens to 2.5bb. You hold A♦ J♣.',
          'From the cutoff, the button and both blinds still act after you, and the button will have position on you if it enters. Calling invites a squeeze and a multiway pot where you play out of position against the button. A 3-bet or a fold is usually cleaner.',
          'From the button, nobody can act behind you after the flop. Calling is reasonable because you will play the hand in position.',
        ],
      },
    ],
    quiz: [
      { q: 'You are in the cutoff. Who can be in position against you after the flop?', options: ['Only the button', 'The button and the blinds', 'Nobody'], answer: 0, explain: 'Only the button acts after the cutoff postflop.' },
      { q: 'Which is an advantage of acting last?', options: ['You can check behind to take a free card', 'You get better cards', 'You pay smaller blinds'], answer: 0, explain: 'Control over the pot size and free cards are positional benefits.' },
    ],
  },

  'blinds-antes-stacks': {
    terms: [
      ['Dead money', 'Chips already in the pot from players who have folded or posted. Nobody owns them; they go to the winner.'],
      ['Big-blind ante', 'A tournament format where the big blind pays one ante for the whole table, keeping the pot the same but speeding up play.'],
      ['Stack-to-pot ratio (SPR)', 'Effective stack divided by the pot at the start of a street. Low SPR means commitment comes quickly.'],
      ['Straddle', 'A voluntary extra blind (usually 2bb) posted before cards are dealt, used in some live cash games. It deepens the pot and reduces stack depth in big blinds.'],
    ],
    deeper: [
      {
        heading: 'Measuring stacks in big blinds',
        body: [
          'Strategy depends on how many big blinds deep you are, not the chip count. 10,000 chips at 50/100 is 100bb; the same 10,000 chips at 500/1,000 is 10bb, a completely different game. Always convert your stack and your opponent’s stack into big blinds.',
          'Rough bands: 100bb and deeper is a full multi-street game; 40–60bb is mid-stack, where 3-bet pots get close to committed by the flop; 25bb and below is short, where open-shoves and re-shoves dominate; under about 12–15bb most decisions become push or fold.',
        ],
      },
      {
        heading: 'Why antes change everything',
        body: [
          'Antes increase the pot without increasing the cost of opening. In a typical tournament structure the big-blind ante equals the big blind, so the pot is 2.5bb before anyone acts instead of 1.5bb, about 67% bigger.',
          'Because there is more to win, every player should play more hands: opens get wider, the big blind defends more (it is getting a better price), and re-steals become more profitable. Playing cash-game ranges in an ante tournament is a common leak.',
        ],
      },
    ],
    apply: [
      'Convert every stack at the table into big blinds before making a decision.',
      'Use the smallest relevant stack (the effective stack) against each opponent.',
      'In ante games, add the antes into the pot when working out the price of a steal or a call.',
      'If you cover a short stack, remember you can only win what they have — your extra chips do not add pressure in that pot.',
    ],
    examples: [
      {
        title: 'Effective stacks in a three-way pot',
        steps: [
          'You have 120bb, the cutoff has 35bb and the big blind has 80bb.',
          'Against the cutoff, only 35bb is at stake. Against the big blind, 80bb is.',
          'If the cutoff goes all-in and the big blind and you keep betting, the main pot is limited by the 35bb stack and any further betting builds a side pot between you and the big blind.',
        ],
      },
    ],
    quiz: [
      { q: 'At 400/800 with an 800 big-blind ante, how big is the pot before anyone acts (in big blinds)?', options: ['1.5bb', '2.5bb', '3bb'], answer: 1, explain: 'SB 0.5bb + BB 1bb + ante 1bb = 2.5bb.' },
      { q: 'You have 9,000 chips at 300/600. Roughly how deep are you?', options: ['15bb', '30bb', '90bb'], answer: 0, explain: '9,000 / 600 = 15 big blinds — a short stack.' },
    ],
  },

  'aggression-initiative': {
    terms: [
      ['Initiative', 'Being the last player to bet or raise. The preflop raiser usually has it going to the flop.'],
      ['Fold equity', 'The extra value a bet gains from the times the opponent folds.'],
      ['Showdown value', 'The chance a hand wins if no more betting happens.'],
      ['Pot control', 'Choosing to check or call to keep the pot small with a medium-strength hand.'],
    ],
    deeper: [
      {
        heading: 'The three reasons to bet',
        body: [
          'Every bet should have at least one clear purpose. Value: worse hands will call. Bluff: better hands will fold. Protection or denial: hands that are behind but have outs will fold instead of drawing for free. If none of these apply, checking is usually better.',
          'A useful test before betting is to name the hands that call and the hands that fold. If the callers are mostly better than you and the folders are mostly worse, the bet is doing the opposite of what you want.',
        ],
      },
      {
        heading: 'Why passive play is a leak',
        body: [
          'A player who mostly checks and calls never wins pots when both players miss, which happens on most flops. They also give their opponents free cards and let them control the size of the pot.',
          'But aggression without purpose is just as costly. The goal is selective aggression: bet and raise with hands that benefit (strong hands, good draws and well-chosen bluffs), and check with hands that want to keep the pot small or realize their equity cheaply.',
        ],
      },
    ],
    apply: [
      'Before betting, name the hands that call and the hands that fold.',
      'If you cannot name a purpose (value, bluff or denial), check.',
      'As the preflop raiser, expect to be checked to and use that initiative on boards that favor your range.',
      'With medium hands, ask whether keeping the pot small beats building it.',
    ],
    examples: [
      {
        title: 'Same flop, three hands, three plans',
        steps: [
          'You opened the button and the big blind called. Flop: Q♠ 7♦ 2♣, big blind checks.',
          'A♣ Q♦: bet for value. Many worse queens, sevens and pocket pairs call.',
          '8♣ 8♥: you can check behind. A bet folds out the hands you beat and gets called by queens. Checking keeps the pot small and lets you see the turn.',
          'K♥ J♥: a small bet is a reasonable bluff. You have two overcards and backdoor draws, and many small pairs and missed hands fold.',
        ],
      },
    ],
    quiz: [
      { q: 'Which is NOT one of the three main reasons to bet?', options: ['Get called by worse hands', 'Make better hands fold', 'Find out where you stand'], answer: 2, explain: '“Finding out” is not a goal on its own; the hands that call are usually better.' },
      { q: 'Who usually has the initiative on the flop?', options: ['The preflop raiser', 'The big blind', 'Whoever has the most chips'], answer: 0, explain: 'The last aggressor preflop.' },
    ],
  },

  'equity-vs-ev': {
    terms: [
      ['Equity', 'Your share of the pot if all cards were dealt with no more betting.'],
      ['EV (expected value)', 'The average profit of a decision across all the ways the hand can play out.'],
      ['Sunk cost', 'Chips you have already put in. They do not belong to you any more and should not affect your next decision.'],
      ['Realization', 'How much of your equity turns into actual winnings; above 100% when you win extra bets, below when you are forced to fold.'],
    ],
    deeper: [
      {
        heading: 'Why equity is not the whole story',
        body: [
          'Equity assumes you always see every card for free. In real hands you can be bet off your equity, or you can win extra money when you hit. Two hands with 35% equity can have very different EVs: a nut flush draw in position wins big pots when it hits, while a weak pair out of position may have to fold to a turn bet and win nothing.',
          'This is why players talk about equity realization. In position, with a hand that makes strong hands, you tend to realize more than your raw equity. Out of position, with a hand that makes weak pairs, you tend to realize less.',
        ],
      },
      {
        heading: 'Comparing actions, not judging them alone',
        body: [
          'EV is most useful as a comparison. Folding always has an EV of zero from now on, so a call is right whenever its EV is above zero. A bet is right when it earns more than checking, which can be true even when both are positive.',
          'The reviews in this app show the EV of each option side by side for exactly this reason: the question is never “is this good?” but “is this better than the alternatives?”.',
        ],
      },
    ],
    apply: [
      'Forget what you already put in; only future chips matter.',
      'For a river call: compare your equity with the price (call ÷ final pot).',
      'On earlier streets, adjust raw equity up for position and strong draws, down for weak hands out of position.',
      'Compare the EV of every option; pick the highest, not the first one that is positive.',
    ],
    examples: [
      {
        title: 'Two calls with the same equity',
        steps: [
          'Flop, pot 10bb, you face a 5bb bet. Hand A: A♥ 5♥ on K♥ 8♥ 2♣ in position. Hand B: 4♠ 4♦ on the same board, out of position.',
          'Both have roughly 35% equity against a typical betting range.',
          'Hand A makes the nut flush and can win a big pot; it will rarely be bet off its equity. It realizes more than 35%.',
          'Hand B will face more bets on most turns and has to fold often; when it improves to a set it can win, but it hits only about 4% per card. It realizes much less than 35%.',
        ],
      },
    ],
    quiz: [
      { q: 'You put 20bb into the pot earlier. Should that make you more likely to call now?', options: ['Yes, to protect your investment', 'No, those chips are sunk'], answer: 1, explain: 'Only the future cost and the current pot matter.' },
      { q: 'Which usually realizes more of its equity?', options: ['A nut flush draw in position', 'A small pair out of position'], answer: 0, explain: 'Position and the ability to make strong hands increase realization.' },
    ],
  },

  'variance-sample': {
    terms: [
      ['Standard deviation (SD)', 'A measure of how spread out results are. In poker usually quoted in bb per 100 hands.'],
      ['Win rate', 'Average profit, usually in big blinds per 100 hands (bb/100).'],
      ['Downswing', 'A stretch of results well below expectation, often caused by variance alone.'],
      ['All-in adjusted (EV) results', 'Results that replace the actual outcome of all-ins with their expected value, removing some luck.'],
    ],
    deeper: [
      {
        heading: 'Why short-term results mislead',
        body: [
          'In a single session, the cards you are dealt and how the board runs out dominate. A strong player who gets stacks in as an 80% favorite still loses one time in five. Over a few hundred hands, a handful of these spots can decide the whole result.',
          'Skill shows up only as an average over many hands. That is why serious players track results over tens of thousands of hands, and why reviewing decisions is a much faster feedback loop than looking at profit.',
        ],
      },
      {
        heading: 'Downswings are normal',
        body: [
          'With a realistic win rate and standard deviation, a winning player will regularly have stretches of thousands of hands where they lose. Simulations commonly show downswings of 20–50 buy-ins over large samples even for solid winners.',
          'Expecting this in advance makes it easier to keep playing well when it happens, and it is the reason bankroll guidelines exist.',
        ],
      },
    ],
    apply: [
      'Judge a session by the quality of its decisions, not the result.',
      'Do not change strategy based on fewer than tens of thousands of hands of results.',
      'When reviewing a big loss, ask “what did I know, and what was the best play?” — not “how did I lose?”.',
      'Use the app’s decision scores to track improvement; they are not affected by card luck.',
    ],
    examples: [
      {
        title: 'A favorite loses',
        steps: [
          'You get all-in preflop with A♠ A♦ against K♣ K♥. You win about 82% of the time.',
          'If this happens five times, losing at least once is more likely than not: 1 − 0.82⁵ ≈ 63%.',
          'Each of those all-ins was a good decision regardless of how it ended.',
        ],
      },
    ],
    quiz: [
      { q: 'You win 82% of the time in a spot. Chance of winning it five times in a row?', options: ['About 37%', 'About 63%', 'About 82%'], answer: 0, explain: '0.82⁵ ≈ 0.37, so you lose at least once about 63% of the time.' },
      { q: 'What is the most reliable short-term feedback?', options: ['Session profit', 'Reviewing decisions', 'How many pots you won'], answer: 1, explain: 'Decision quality is visible immediately; results need huge samples.' },
    ],
  },

  'thinking-in-ranges': {
    terms: [
      ['Range', 'All the hands a player could hold at a given point, with their likelihoods.'],
      ['Combo', 'One specific two-card holding, such as A♠K♦. AK has 16 combos.'],
      ['Weighted range', 'A range where hands are included only part of the time, for example 50% of 76s.'],
      ['Range category', 'A group of hands that play similarly: strong value, medium made hands, draws, air.'],
    ],
    deeper: [
      {
        heading: 'Building a range step by step',
        body: [
          'Start preflop: which hands would this player open, call or 3-bet from this seat? Then filter street by street. For each action, ask which hands in their range would take it. A player who calls a flop bet keeps their pairs and draws and drops most of their misses; a player who check-raises keeps their strongest hands and some draws.',
          'Count combinations, not just hand types. There are 6 combos of each pocket pair, 4 of each suited hand and 12 of each offsuit hand. Cards you can see remove combos: if you hold an ace, there are fewer aces left for your opponent.',
        ],
      },
      {
        heading: 'Thinking about your own range',
        body: [
          'Your opponent is doing the same to you. If you only bet big with strong hands, a thoughtful opponent will fold everything except the hands that beat you. Good play mixes some bluffs in with value hands and some strong hands in with checks so that your actions do not give your hand away.',
          'You do not need to be perfectly balanced against most opponents, but you should know what your range looks like after each action so that you can tell when it is strong (and can bet a lot) or weak (and should be careful).',
        ],
      },
    ],
    apply: [
      'Start with their preflop range for the seat and action.',
      'At each action, remove the hands that would have played differently.',
      'Group what is left into categories: strong value, medium made hands, draws, air.',
      'Ask how your hand does against each category, then against the whole range.',
      'Finally, ask what your own range looks like to them.',
    ],
    examples: [
      {
        title: 'Narrowing a range across three streets',
        steps: [
          'The cutoff opens and you call on the button. Flop: J♠ 8♠ 3♦. The cutoff bets small.',
          'A small bet on this board comes from a wide range: overpairs, jacks, flush draws, straight draws and some air.',
          'Turn 2♣, the cutoff bets big. Weak air and some marginal hands give up; strong jacks, overpairs, sets and the best draws continue.',
          'River K♦, the cutoff bets big again. Draws missed, so the range is now polarized: strong value (overpairs, sets, two pair, maybe AK) plus missed draws that decided to bluff.',
        ],
      },
    ],
    quiz: [
      { q: 'How many combos of AKs exist?', options: ['4', '6', '12'], answer: 0, explain: 'One per suit: A♠K♠, A♥K♥, A♦K♦, A♣K♣.' },
      { q: 'You hold A♥ 5♥. How many combos of AA can your opponent have?', options: ['6', '3', '1'], answer: 1, explain: 'With one ace removed, three aces remain: 3 × 2 / 2 = 3 combos.' },
    ],
  },
};
