// References that informed the lessons, presets and evaluation rules.
// All explanations in this app are original. Books are cited for the concepts they are widely
// known for; their full text was not reproduced or consulted verbatim while writing.
// Web references were checked during development (see docs/SOURCES.md for notes).

export interface Source {
  id: string;
  title: string;
  author?: string;
  year?: string;
  url?: string;
  kind: 'book' | 'rules' | 'paper' | 'web' | 'computed';
  usedFor: string;
}

export const SOURCES: Record<string, Source> = {
  sklansky: { id: 'sklansky', title: 'The Theory of Poker', author: 'David Sklansky', year: '1987', kind: 'book', usedFor: 'Fundamental theorem of poker, semi-bluffing, deception and pot-odds reasoning.' },
  ftop: { id: 'ftop', title: 'Fundamental theorem of poker (encyclopedia article)', url: 'https://en.wikipedia.org/wiki/Fundamental_theorem_of_poker', kind: 'web', usedFor: 'Statement of the fundamental theorem and its limitations.' },
  mop: { id: 'mop', title: 'The Mathematics of Poker', author: 'Bill Chen & Jerrod Ankenman', year: '2006', kind: 'book', usedFor: 'Indifference and bluffing frequencies in simplified river games, EV framing, risk of ruin concepts.' },
  janda: { id: 'janda', title: 'Applications of No-Limit Hold’em', author: 'Matthew Janda', year: '2013', kind: 'book', usedFor: 'Range construction, balance, polarised vs merged betting and checking ranges.' },
  harrington: { id: 'harrington', title: 'Harrington on Hold’em (Vols. 1–3)', author: 'Dan Harrington & Bill Robertie', year: '2004–2006', kind: 'book', usedFor: 'Tournament stack-to-blinds pressure (M ratio) and short-stack play.' },
  malmuth: { id: 'malmuth', title: 'Gambling Theory and Other Topics', author: 'Mason Malmuth', year: '1987', kind: 'book', usedFor: 'Origin of ICM for poker; bankroll and variance discussions.' },
  harville: { id: 'harville', title: 'Assigning probabilities to the outcomes of multi-entry competitions', author: 'David A. Harville', year: '1973', kind: 'paper', usedFor: 'The finishing-order model underlying ICM.' },
  icmwiki: { id: 'icmwiki', title: 'Independent Chip Model (encyclopedia article)', url: 'https://en.wikipedia.org/wiki/Independent_Chip_Model', kind: 'web', usedFor: 'Model definition and stated limitations (ignores skill; poor for unlikely events).' },
  icmgambler: { id: 'icmgambler', title: 'Gambler’s Ruin and the ICM', url: 'https://arxiv.org/pdf/2011.07610', kind: 'paper', usedFor: 'Conditional finishing probabilities x_i/(1−x_k); relation to gambler’s ruin.' },
  tda: { id: 'tda', title: 'Poker TDA Rules (Rule 47: re-opening the bet; minimum raises)', url: 'https://www.pokertda.com', kind: 'rules', usedFor: 'Short all-ins and cumulative short all-ins re-opening action; minimum raise after re-opening.' },
  tdaforum: { id: 'tdaforum', title: 'Poker TDA forum: multiple short all-ins', url: 'https://www.pokertda.com/forum/index.php?msg=12778', kind: 'web', usedFor: 'Discussion of edge cases (non-authoritative).' },
  handrank: { id: 'handrank', title: 'List of poker hands (encyclopedia article)', url: 'https://en.wikipedia.org/wiki/List_of_poker_hands', kind: 'web', usedFor: 'Hand ranking order and 7-card category frequencies used in tests.' },
  mdfweb: { id: 'mdfweb', title: 'Minimum defense frequency explanations (several training-site glossaries)', url: 'https://www.pokerskill.com/poker-glossary/minimum-defense-frequency/', kind: 'web', usedFor: 'Formula pot/(pot+bet) and the caveats that it is a benchmark vs balanced opponents.' },
  nash: { id: 'nash', title: 'Non-cooperative games', author: 'John Nash', year: '1951', kind: 'paper', usedFor: 'Equilibrium concept used for the push/fold computation.' },
  computed: { id: 'computed', title: 'Computed in this app', kind: 'computed', usedFor: 'Preflop equity table (Monte Carlo), push/fold equilibrium (fictitious play), exact river equities, ICM values. See scripts/ and src/ranges/pushfold.ts.' },
};
