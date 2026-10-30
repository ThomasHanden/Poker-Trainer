// Worked examples for the equity calculator. Each lesson's claims are checked in tests/ranges-tab.test.ts.

export const EQUITY_EXAMPLES: { label: string; hero: string; board: string; range: string; lesson: string }[] = [
  { label: 'AKs vs QQ', hero: 'Ah Kh', board: '', range: 'QQ', lesson: 'The classic “coin flip”: a pair is a small favorite over two overcards.' },
  { label: 'AK vs AQ', hero: 'As Kd', board: '', range: 'AQo', lesson: 'Domination: sharing an ace with a better kicker leaves the weaker hand about 3 outs to beat you.' },
  { label: 'JTs vs AA', hero: 'Jc Tc', board: '', range: 'AA', lesson: 'Even a strong suited connector is a big underdog to aces — but far from dead.' },
  { label: 'Flush draw on the flop', hero: 'Ah 5h', board: 'Kh 9h 2c', range: 'KQ,KJ,KT,K9,99', lesson: 'Nut flush draw plus an ace overcard: up to 12 outs (9 hearts, 3 aces) with two cards to come, and the rule of 4 says 12 × 4 = 48%. The real figure is lower: an ace does nothing against two pair (K9) or a set (99), and those hands can still make a full house when a heart pairs the board.' },
  { label: 'Top pair vs a c-bet range', hero: 'Kd Qc', board: 'Ks 7d 2c', range: '22+,A2s+,K9s+,QTs+,JTs,ATo+,KJo+', lesson: 'Strong one-pair hands are well ahead of a wide range, but not of a tight one.' },
  { label: 'Overpair vs a turn raise', hero: 'Qs Qd', board: 'Jh Th 4c 2s', range: 'JJ,TT,44,JTs,KhQh,AhKh,9h8h', lesson: 'Against a narrow, strong range (sets, two pair and strong draws) even an overpair can be in bad shape.' },
];
