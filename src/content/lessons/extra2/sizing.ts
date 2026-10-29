import type { LessonDrills } from '../types';

export const SIZING_D: Record<string, LessonDrills> = {
  'what-a-bet-does': {
    takeaways: [
      'A bet splits the opponent’s range into hands that continue and hands that fold.',
      'Choose the size that keeps the hands you want calling and folds the hands you want folding.',
      'Bluff break-even = bet ÷ (pot + bet).',
      'Smaller bets give draws a better price; bigger bets charge them more.',
    ],
    problems: [
      { q: 'A half-pot bluff: how often must it work?', a: '0.5 ÷ 1.5 ≈ 33%.' },
      { q: 'You hold top set on a dry river and the opponent has many weak pairs. Which size usually earns more: ⅓ pot or 1.5× pot?', a: 'Usually ⅓ pot against weak pairs: many of them call a small bet and fold to a huge one. If the opponent is a station who calls anything, the bigger size earns more.' },
    ],
  },
  'small-vs-large': {
    takeaways: [
      'Small bets: cheap, called wide, good when your whole range is ahead.',
      'Large bets: pressure medium hands, charge draws, good with a nut advantage.',
      'Use the same size for value and bluffs in the same spot.',
      'The board and ranges choose the size; your exact hand rarely should.',
    ],
    problems: [
      { q: 'Which spot suits a small c-bet: button vs big blind on A♠ 7♦ 2♣, or on T♥ 9♥ 8♣?', a: 'A♠ 7♦ 2♣. The button has a big range advantage and the big blind has many weak hands with few draws. The T-9-8 board is wet and closer, so bets there are larger and less frequent.' },
      { q: 'Why is betting big with value and small with bluffs a leak?', a: 'Opponents who notice will call your small bets and fold to your big ones, so your bluffs fail and your value bets get paid less.' },
    ],
  },
  'geometric-sizing': {
    takeaways: [
      'Geometric sizing bets the same pot fraction each street so the stack goes in by the river.',
      'f = ((2 × SPR + 1)^(1/streets) − 1) ÷ 2.',
      'A bet of f and a call grow the pot by (1 + 2f).',
      'Use it as a reference for strong hands and polarized ranges.',
    ],
    problems: [
      { q: 'Flop SPR 13, three streets left. What is the geometric fraction?', a: '2 × 13 + 1 = 27; the cube root of 27 is 3; (3 − 1) ÷ 2 = 1. A pot-size bet on each street gets the stacks in.' },
      { q: 'River: pot 30bb, 45bb left. What fraction of the pot is a shove?', a: '45 ÷ 30 = 1.5× pot. With one street left, the geometric size is simply the shove.' },
    ],
  },
  'overbets-underbets': {
    takeaways: [
      'Overbets work when you have a nut advantage against a capped range.',
      'Underbets work when your range is far ahead and the opponent has many weak hands.',
      'Overbet bluffs should block the opponent’s best calls.',
      'A 2× pot bluff needs 67% folds; a ¼ pot bluff needs 20%.',
    ],
    problems: [
      { q: 'A 2× pot bluff: how often must it work?', a: '2 ÷ (1 + 2) ≈ 67%.' },
      { q: 'The opponent called the flop and turn on a dry board without raising. Why is an overbet with a set attractive?', a: 'Their range is capped: they would often have raised sets and two pair earlier. Their best hands are one pair, which you can pressure with a large bet while they rarely hold anything that beats you.' },
    ],
  },
  'polarized-merged': {
    takeaways: [
      'Polarized range (strong + bluffs) pairs with large bets.',
      'Merged range (wide band of value) pairs with smaller bets.',
      'Medium hands check when your betting range is polarized.',
      'Against a big bet after a passive line, treat medium hands as bluff-catchers.',
    ],
    problems: [
      { q: 'You will bet pot on the river. Should second pair be in your betting range?', a: 'Usually not. A pot-size bet is called mostly by better hands and folds worse ones. Second pair goes in your checking range; bet strong hands and bluffs instead.' },
      { q: 'The opponent bets 25% pot on the river. Is their range more likely polarized or merged?', a: 'Merged. Small bets usually come from many medium-strength hands and some strong ones, not mainly from nuts and air.' },
    ],
  },
  'sizing-continuing-range': {
    takeaways: [
      'Bigger bets leave a stronger continuing range.',
      'Your value hands must beat the range that continues at your size.',
      'Players who call regardless of size: bet bigger for value.',
      'Players who fold regardless of size: bluff smaller.',
    ],
    problems: [
      { q: 'The opponent continues with 70% of their range against ⅓ pot and 45% against pot. Which size gets more folds per chip risked?', a: '⅓ pot gets 30% folds risking 0.33 pot, while pot gets 55% folds risking 1 pot. Break-even folds are 25% and 50%, so both are slightly profitable as pure bluffs; the small bet risks much less for a similar edge.' },
      { q: 'Your hand beats the hands that call a ⅓-pot bet but not those that call a pot bet. Which size is a value bet?', a: 'The ⅓-pot bet. At pot size, only better hands continue.' },
    ],
  },
  'sizing-stack-board': {
    takeaways: [
      'Low SPR: smaller bets are enough to get all-in.',
      'High SPR: plan larger bets across several streets with strong hands.',
      'Wet boards favor larger bets; dry boards smaller ones.',
      'On the river, size only for who calls and who folds.',
    ],
    problems: [
      { q: '3-bet pot, flop pot 22bb, stacks 89bb. Why can a 7bb c-bet still build toward all-in?', a: 'The SPR is about 4. A 7bb bet and call make the pot 36bb with 82bb left (SPR about 2.3), and a turn bet and river shove can then get the rest in.' },
      { q: 'On which flop would you use a bigger c-bet with an overpair: Q♣ 7♦ 2♠ or 9♥ 8♥ 7♣?', a: '9♥ 8♥ 7♣. Many draws need charging and your overpair is vulnerable. On Q-7-2 rainbow there is little to protect against.' },
    ],
  },
  'exploitative-sizing': {
    takeaways: [
      'Against stations: bigger value bets, fewer bluffs.',
      'Against nits: smaller bluffs, smaller value bets.',
      'Watch for opponents whose size reveals their hand.',
      'Keep your own sizes consistent across value and bluffs.',
    ],
    problems: [
      { q: 'A player bets ⅓ pot with draws and pot with made hands. How do you exploit it?', a: 'Raise their small bets more often (they are weak or drawing) and fold more to their big bets with bluff-catchers.' },
      { q: 'A nit folds 80% to any river bet. What size should your bluffs be?', a: 'Small. A ¼-pot bluff needs only 20% folds; since they fold 80% to any size, risking less earns the same folds for fewer chips.' },
    ],
  },
};
