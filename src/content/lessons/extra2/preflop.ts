import type { LessonDrills } from '../types';

export const PREFLOP_D: Record<string, LessonDrills> = {
  'starting-hands-position': {
    takeaways: [
      'The more players left to act, the tighter your range should be.',
      'Early position: big pairs, strong aces, suited broadways, the best suited connectors.',
      'Late position: add suited kings and queens, suited connectors and more offsuit broadways.',
      'Offsuit hands with weak kickers are the first to cut from early seats.',
    ],
    problems: [
      { q: 'Rank these from most to least suited for a UTG open in 6-max: A9o, 76s, AQs, KJo.', a: 'AQs (strong and rarely dominated), 76s (plays well and makes strong hands), KJo (often dominated by AK, KQ, AJ), A9o (dominated by every better ace). The baseline opens AQs and KJo, opens 76s half the time, and folds A9o.' },
      { q: 'Why does the chance of facing a strong hand grow with the number of players behind you?', a: 'Each player has a small chance of a strong hand. The chance that at least one does is 1 − (chance none do), which grows quickly: with a 5% chance each, about 10% with two players and about 23% with five.' },
    ],
  },
  'opening-ranges': {
    takeaways: [
      'When first in, raise or fold; limping gives up fold equity and initiative.',
      'Use one open size per seat for your whole range, so the size tells nothing.',
      'Typical sizes: 2–2.5bb online, 2.5–3bb+ live, about 3bb from the small blind, 2–2.2bb with antes.',
      'Open bigger and tighter against blinds who call too much.',
    ],
    problems: [
      { q: 'Blinds 0.5/1, no ante. What fold rate does a 2.5bb button open need to profit immediately?', a: '2.5 ÷ (2.5 + 1.5) = 62.5%. Real opens also win after being called, so they can be profitable with fewer folds.' },
      { q: 'You raise 4bb with aces and 2.5bb with everything else. What is the problem?', a: 'Your size reveals your hand. Observant opponents will fold to your 4bb raises and play back at your 2.5bb ones.' },
    ],
  },
  'calling-vs-raising': {
    takeaways: [
      'Against an open, each hand is a fold, a call or a 3-bet.',
      'Call with hands that play well, especially in position or when closing the action.',
      '3-bet strong hands for value and some hands with blockers as bluffs.',
      'Out of position with players behind, flatting gets worse: prefer 3-bet or fold.',
    ],
    problems: [
      { q: 'The cutoff opens. Sort these button hands into call, 3-bet or fold: QQ, 87s, A5s, K8o.', a: 'QQ: 3-bet for value. 87s: call (plays well in position). A5s: 3-bet bluff candidate (ace blocker, wheel and flush potential). K8o: fold (dominated and poor as a bluff).' },
      { q: 'Why can the big blind call wider than the small blind against a button open?', a: 'The big blind already has 1bb in, gets a better price, and closes the action so no one can squeeze behind it.' },
    ],
  },
  'three-four-betting': {
    takeaways: [
      '3-bet about 3× the open in position and about 4× out of position.',
      'Build 3-bet ranges from value first, then add bluffs with blockers and playability.',
      'Do not fold most of your opening range to 3-bets, or light 3-bets become profitable.',
      'At 100bb, 4-bet pots are close to all-in by the flop; a 5-bet is usually a shove.',
    ],
    problems: [
      { q: 'The button opens to 2.5bb. You are in the big blind. Roughly what size should your 3-bet be?', a: 'About 4× the open out of position: around 10–11bb.' },
      { q: 'You open 25% of hands and continue only with QQ+ and AK against 3-bets. Roughly what share of your opens do you fold?', a: 'QQ+ and AK are 34 combos out of about 330 (25% of 1,326), so you fold about 90% of the time. That lets opponents 3-bet you with almost any two cards.' },
    ],
  },
  'linear-polarized': {
    takeaways: [
      'Linear: raise the best hands down to a cutoff. Polarized: raise strong hands and bluffs, call the middle.',
      'When calling is a good option, polarize; when it is not, go linear.',
      'Against callers, go more linear; against folders, add bluffs.',
      'Choose bluffs with blockers and playability.',
    ],
    problems: [
      { q: 'From the small blind against a button open, why do many strategies 3-bet AJo instead of calling?', a: 'Calling is poor from the small blind (out of position, the big blind can squeeze), so medium-strong hands like AJo are raised for thin value as part of a linear range.' },
      { q: 'An opponent folds 80% to 3-bets. Should your 3-bet range get more linear or more polarized?', a: 'More polarized, with extra bluffs. Folds are frequent, so hands that cannot call profitably earn more as 3-bets.' },
    ],
  },
  'blind-defense': {
    takeaways: [
      'Price to call = call ÷ (pot after you call); a 2.5bb open asks the big blind for about 27%.',
      'Out of position you realize less than your raw equity, especially with offsuit, unconnected hands.',
      'Defend wider against late-position opens and small sizes; tighter against early opens and big sizes.',
      'Include 3-bets so openers cannot steal for free.',
    ],
    problems: [
      { q: 'The button opens to 2.2bb. What equity does the big blind need to call, before thinking about position?', a: 'Call 1.2bb into a final pot of 2.2 + 2.2 + 0.5 = 4.9bb: 1.2 ÷ 4.9 ≈ 24.5%.' },
      { q: 'Which is the better defend against a button open: Q3o or 64s? Why?', a: '64s. Their raw equity is similar, but 64s makes straights and flushes and flops more draws, so it realizes more of its equity out of position.' },
    ],
  },
  'isolation-limped': {
    takeaways: [
      'Limpers usually lack their strongest hands; weak players limp wide.',
      'Iso-raise to about your open + 1bb per limper, more against players who call a lot.',
      'Isolate with hands that play well heads-up, ideally in position.',
      'Respect limp-raises from tight players.',
    ],
    problems: [
      { q: 'Two players limp; your normal open is 2.5bb. What iso size would you start from?', a: 'About 2.5 + 1 + 1 = 4.5bb, or larger (5–6bb) if the limpers call raises too often.' },
      { q: 'Behind a passive limper with passive blinds, would you over-limp 55 or K9o, and why?', a: '55. Small pairs like cheap multiway pots where they can flop a set. K9o plays poorly multiway and is better as an iso-raise or a fold.' },
    ],
  },
  squeezes: {
    takeaways: [
      'A squeeze is a 3-bet after an open and a call; the caller’s range is often capped.',
      'Size up: roughly a normal 3-bet plus one open-size per caller.',
      'Both players must fold for a squeeze bluff to win immediately.',
      'Think about squeezes before flat-calling with weak hands.',
    ],
    problems: [
      { q: 'The cutoff opens to 2.5bb and the button calls. You squeeze from the big blind to 13bb. How much do you risk and what do you win if both fold?', a: 'You risk 12bb more (you already had 1bb in). The pot you win is 2.5 + 2.5 + 0.5 + 1 = 6.5bb. Break-even: 12 ÷ (12 + 6.5) ≈ 65% of the time both must fold.' },
      { q: 'If the opener folds 65% and the caller folds 80% independently, how often do both fold?', a: '0.65 × 0.8 = 52%.' },
    ],
  },
  'stack-depth-preflop': {
    takeaways: [
      'Deeper stacks favor hands that make the nuts: pairs, suited connectors, suited aces.',
      'Deeper stacks punish hands that make second-best one-pair hands.',
      'Short stacks favor high cards and blockers, with raise-shove and push/fold strategies.',
      'Set-mining needs the stack you can win to be roughly 10–20 times the call.',
    ],
    problems: [
      { q: 'You face a 3bb open with 33 and 30bb effective. Is set-mining attractive?', a: 'Not very. You can win at most about 27bb more when you hit, roughly 9× the call. With realistic payoffs that is short of the 10–20× guideline. Folding or 3-bet-shoving can be better, depending on the opener.' },
      { q: 'Why does KQo lose value as stacks get deeper?', a: 'It mostly makes one pair. Deep-stacked, big pots tend to be won by two pair or better, so KQo more often loses a large pot when it hits top pair against a stronger hand.' },
    ],
  },
  'rake-effects': {
    takeaways: [
      'Rake is a percentage of the pot up to a cap; it hurts small and medium pots most.',
      'Marginal calls suffer most because they see many raked flops with thin edges.',
      'Under “no flop, no drop”, pots won preflop pay no rake.',
      'In high-rake games, tighten calls and prefer raise-or-fold.',
    ],
    problems: [
      { q: 'A 10bb pot is raked 5% with a 3bb cap. How much rake is taken? What about a 100bb pot?', a: '10bb: 0.5bb. 100bb: 5bb would be 5%, but the cap limits it to 3bb.' },
      { q: 'Which is affected more by rake: a big-blind call against a button open, or a 3-bet that often wins preflop?', a: 'The big-blind call. It always sees a raked flop, while the 3-bet often wins the pot before the flop, which pays no rake in no-flop-no-drop games.' },
    ],
  },
  playability: {
    takeaways: [
      'Dominated hands lose big pots when both players pair the shared card.',
      'Suited hands gain a few percent of equity but much more playability.',
      'Connected hands make straights and more draws; gaps reduce this.',
      'Playability matters more deep-stacked and less when all-in preflop.',
    ],
    problems: [
      { q: 'You hold AJ and the opponent holds AK. The flop is A♣ 7♦ 3♠. How many outs do you have to win?', a: 'Three jacks (to make aces up with a better second pair). A board pair or runner-runner chops can also happen, but mostly you need one of 3 cards — about 13% by the river.' },
      { q: 'Why is A5s often a better 3-bet bluff than A9o?', a: 'A5s blocks the same aces, but it also makes nut flushes and wheel straights when called. A9o is dominated more often and rarely makes strong hands.' },
    ],
  },
};
