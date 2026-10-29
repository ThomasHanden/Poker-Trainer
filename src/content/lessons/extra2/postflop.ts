import type { LessonDrills } from '../types';

export const POSTFLOP_D: Record<string, LessonDrills> = {
  'board-texture': {
    takeaways: [
      'Check four things on every flop: high card, connectedness, suits and pairing.',
      'Dry, static boards: small bets, many hands can bet, slow-plays are safer.',
      'Wet, dynamic boards: bigger bets, fewer bets, protect vulnerable strong hands.',
      'Ask which preflop range the board helps before looking at your own hand.',
    ],
    problems: [
      { q: 'Classify these flops as dry or wet: A♠ 7♦ 2♣, J♥ T♥ 8♣, K♣ K♦ 4♠, 7♠ 6♠ 5♦.', a: 'A-7-2 rainbow: dry. J-T-8 two-tone: very wet. K-K-4 rainbow: dry (paired). 7-6-5 two-tone: very wet.' },
      { q: 'On 9♥ 8♥ 6♣, which made hands already exist and which draws are common?', a: 'Straights (T7, 75) and sets (99, 88, 66) and two pairs (98, 96, 86). Common draws: flush draws (two hearts), open-enders (T7 is already a straight; hands like JT, 75, 54) and gutshots.' },
    ],
  },
  'range-advantage': {
    takeaways: [
      'Range advantage: more equity overall. Nut advantage: more of the very best hands.',
      'High boards usually favor the preflop raiser; low, connected boards often favor the caller.',
      'Range advantage supports frequent small bets; nut advantage supports big bets.',
      'With neither, check more and protect your checks.',
    ],
    problems: [
      { q: 'UTG opens and the big blind calls. Flop: A♦ K♠ 7♣. Who has the range advantage and why?', a: 'UTG. Its range has far more AK, AQ, AA, KK and strong aces. The big blind 3-bets many of those hands or folds weaker ones, so it holds more middling and weak hands.' },
      { q: 'On 8♥ 7♥ 6♣ after a button open and big-blind call, why might the button check often even with an overpair?', a: 'The big blind has more straights, sets and two pairs here, so it has the nut advantage. The button’s overpairs are vulnerable and could face check-raises from stronger hands.' },
    ],
  },
  'position-spr': {
    takeaways: [
      'SPR = effective stack ÷ pot at the start of the flop.',
      'Low SPR (1–3): top pair is usually strong enough to commit.',
      'High SPR (10+): one pair rarely wants to play for stacks; very strong hands do.',
      'Position matters more the deeper the stacks.',
    ],
    problems: [
      { q: 'Single-raised pot: 5.5bb on the flop, stacks 97.5bb. What is the SPR, and how should top pair weak kicker usually play?', a: 'About 17.7. That is deep, so top pair weak kicker should mostly keep the pot manageable rather than aim to get all-in.' },
      { q: '4-bet pot: 50bb on the flop, stacks 75bb. What is the SPR and what does it suggest?', a: 'SPR 1.5. One normal bet commits most of the stack, so top pair and better (and strong draws) usually want to get it in.' },
    ],
  },
  'value-bluff-semibluff': {
    takeaways: [
      'Value: worse hands call. Bluff: better hands fold. Semi-bluff: a draw that can win either way.',
      'Strong draws make the best semi-bluffs; weak draws often check.',
      'On the river, a bet is only value or a bluff — medium hands usually check.',
      'Name the callers and the folders before you bet.',
    ],
    problems: [
      { q: 'Flop 9♠ 8♠ 2♦. You hold J♠ T♠. What kind of bet would this be and how many outs do you have?', a: 'A semi-bluff. You have a flush draw (9 spades) plus an open-ended straight draw (four queens and four sevens, of which Q♠ and 7♠ are already counted): 9 + 6 = 15 outs.' },
      { q: 'River, you hold the third-best possible pair and the opponent checks. Is a bet a value bet or a bluff?', a: 'Usually neither: better pairs call and worse hands fold. Checking for showdown value is normally best unless the opponent calls with many worse hands.' },
    ],
  },
  'equity-denial-realization': {
    takeaways: [
      'Bet to deny equity when the hands you beat have many outs.',
      'Checking costs little when the opponent’s weak hands have almost no outs.',
      'Position and nut potential raise how much of your equity you realize.',
      'Out of position, weak one-pair hands realize much less than their raw equity.',
    ],
    problems: [
      { q: 'You hold A♠ A♦ on J♥ T♥ 7♣. Name three types of hands with good equity against you.', a: 'Flush draws (two hearts), straight draws (Q9, 98, KQ, 86) and combo draws (Q♥9♥, 9♥8♥). Sets and two pair are already ahead.' },
      { q: 'On K♠ 7♦ 2♣ with K♦ Q♣, why is checking sometimes fine?', a: 'Most hands behind you have two or three outs at best. A free card rarely costs you the pot, and checking keeps bluffs and weaker hands in for later streets.' },
    ],
  },
  cbetting: {
    takeaways: [
      'Favorable board: c-bet often and small. Unfavorable board: c-bet less and larger.',
      'Keep some strong hands in your checking range.',
      'Multiway, c-bet much less and mostly for value.',
      'The flop size and frequency should match the board, not your hand alone.',
    ],
    problems: [
      { q: 'Button vs big blind, flop K♠ 7♦ 2♣. Rough plan for the button’s c-bets?', a: 'This board strongly favors the button. A high-frequency, small c-bet (about a third of the pot) with most of the range is a sensible plan.' },
      { q: 'Same matchup, flop 7♠ 6♠ 5♦. How does the plan change?', a: 'This board favors the big blind. The button checks much more and uses a larger size with sets, overpairs with a spade and strong draws when it does bet.' },
    ],
  },
  'delayed-cbet': {
    takeaways: [
      'Check back the flop, then bet the turn when the opponent checks again.',
      'A second check usually weakens the opponent’s range.',
      'Pick turns that help your range or give your hand new equity.',
      'Keep some strong hands in your flop checks so the line stays credible.',
    ],
    problems: [
      { q: 'You check back A♣ K♦ on 8♥ 7♥ 3♣. Turn: A♠, checked to you. Good spot for a delayed c-bet?', a: 'Yes. You now have top pair, top kicker, and the ace helps your range more than the big blind’s. Bet for value from Ax, 8x and pairs, and to charge heart draws.' },
      { q: 'Why is a turn card like the 6♥ (on 8♥ 7♥ 3♣) a poor card for a delayed bluff?', a: 'It completes flushes and many straights (54, T9, 95) that the caller has, so the caller’s range improves and folds less.' },
    ],
  },
  'probe-donk': {
    takeaways: [
      'Donk bet: leading into the previous aggressor. Probe: betting the turn after they checked back the flop.',
      'Lead when the new card favors your range.',
      'Probe because a checked-back range is capped.',
      'Avoid small “blocking” leads with medium hands without a reason.',
    ],
    problems: [
      { q: 'The button c-bets K♠ 7♦ 6♣ and you call in the big blind. Turn: 5♥. Why might the big blind lead?', a: 'The 5 completes straights for 98, 84 and 43 and two pair for 75 and 65. The big blind defends many more of these low connected hands than the button opens, so the card shifts the nut advantage toward the big blind. Leading with those hands and strong draws, instead of checking, can be right.' },
      { q: 'The button checks back the flop. On the turn, why is a bet from the big blind often profitable?', a: 'The button usually bets its strong hands on the flop, so its checked range is capped and weaker. A turn probe gets folds from weak hands and value from medium ones.' },
    ],
  },
  'check-raising': {
    takeaways: [
      'Check-raise with strong hands that want a big pot and with your best draws.',
      'Call, rather than raise, with medium made hands.',
      'Facing a check-raise, one-pair hands lose a lot of value.',
      'Do not fold so much to small-bet check-raises that light raises become automatic.',
    ],
    problems: [
      { q: 'Flop J♥ 9♥ 4♣. Which is the better check-raise: 9♣ 8♣ or K♥ Q♥?', a: 'K♥ Q♥. It has a flush draw, a gutshot (any ten makes K-Q-J-T-9) and two overcards, so it has plenty of equity when called. 9♣ 8♣ is middle pair, which plays better as a call.' },
      { q: 'You c-bet top pair weak kicker and face a big check-raise from a tight player. What usually happens to your hand’s value?', a: 'It drops sharply. A tight player’s check-raise range is mostly two pair, sets and strong draws, so your one pair is often behind or flipping.' },
    ],
  },
  'turn-river-planning': {
    takeaways: [
      'Plan your turn and river before you bet the flop.',
      'Barrel cards that help your range; slow down on cards that help theirs.',
      'With strong hands, size so the stacks can go in by the river.',
      'With bluffs, keep betting the ones with the most equity or best blockers.',
    ],
    problems: [
      { q: 'You c-bet 9♠ 6♦ 2♣ as the preflop raiser and get called. Which turn is a better barrel: K♥ or 7♠?', a: 'K♥. It helps the raiser’s range (more Kx and overpairs). The 7 helps the caller, who has more 87, 85, 76 and 75.' },
      { q: 'Pot 6bb, stacks 50bb on the flop with a strong hand. Why plan sizes now?', a: 'SPR is about 8. To get the stacks in by the river you need substantial bets on each street (roughly two-thirds pot geometrically). Planning prevents ending the hand with a big stack behind.' },
    ],
  },
  'thin-value': {
    takeaways: [
      'Thin value: you are only slightly ahead of the calling range.',
      'Bet small to keep worse hands calling.',
      'Thin value works best in position and against callers.',
      'Skip thin value against tight players who call only with better.',
    ],
    problems: [
      { q: 'River A♦ 9♣ 6♠ 3♥ 2♦. You hold A♣ 8♣ in position and are checked to. Which hands call a small bet, and which beat you?', a: 'Worse aces (A7–A4), some 9x and 6x call. Better aces (AK–A9), two pair, sets and the 54 straight beat you. Against a loose player who calls with those worse hands, a small bet earns value.' },
      { q: 'Why is thin value harder out of position?', a: 'Your bet can be raised as a bluff and you must often fold, and when you check the opponent can check back hands you would have got value from. Position gives you control.' },
    ],
  },
  'bluff-catching': {
    takeaways: [
      'A bluff-catcher beats only bluffs; its value depends on how often they bluff.',
      'Required equity = call ÷ (pot + call); pot-size bets need 33%.',
      'Prefer bluff-catchers that block value and do not block bluffs.',
      'Fold more against under-bluffers, call more against over-bluffers.',
    ],
    problems: [
      { q: 'The opponent bets ¾ pot on the river. What share of bluffs do you need them to have to call with a pure bluff-catcher?', a: '0.75 ÷ (1 + 0.75 + 0.75) = 30%.' },
      { q: 'Board Q♥ J♥ 6♣ 3♠ 2♦: the heart draw missed. Which bluff-catcher is better: Q♣ T♣ or Q♥ T♦?', a: 'Q♣ T♣. The Q♥ removes some of the opponent’s missed heart draws — exactly the bluffs you want them to have — so Q♥ T♦ faces fewer bluffs.' },
    ],
  },
  multiway: {
    takeaways: [
      'More opponents means a much higher chance someone has a strong hand.',
      'Bluff less, and value-bet stronger hands.',
      'Nut draws gain value; weak draws lose it.',
      'Respect bets and raises into several players.',
    ],
    problems: [
      { q: 'Each of three opponents has a 25% chance of a strong hand. What is the chance at least one does?', a: '1 − 0.75³ ≈ 58%.' },
      { q: 'Three-way flop, you hold the nut flush draw. Why is it stronger than heads-up?', a: 'When it hits, more players can pay you off, and it is rarely second-best. Its implied odds grow with the number of players.' },
    ],
  },
};
