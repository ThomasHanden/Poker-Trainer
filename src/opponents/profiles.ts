// Opponent tendency profiles. These parameterise one shared policy (policy.ts).
// They are simplified behavioural models for training, not population statistics.

export type ProfileId = 'unknown' | 'tag' | 'nit' | 'station' | 'lag' | 'overfolder';

export interface OpponentProfile {
  id: ProfileId;
  name: string;
  short: string;
  description: string;
  /** preflop looseness: >0 widens ranges, <0 tightens (fraction of base range size) */
  looseness: number;
  /** scales preflop raise frequencies and postflop bet/raise frequencies */
  aggression: number;
  /** postflop calling threshold shift (negative = calls more) */
  callShift: number;
  /** postflop value-bet threshold shift (positive = needs stronger hands to bet) */
  valueShift: number;
  /** probability of betting air on the river / as a bluff when checked to */
  bluff: number;
  /** continuation-bet frequency with non-value hands as the preflop aggressor (flop) */
  cbet: number;
  /** probability of slow-playing (checking/calling) very strong hands */
  slowplay: number;
  /** probability of choosing a large (>= 75% pot) size when betting */
  bigSizing: number;
  /** how this profile changes the "right" play against it (shown in reviews) */
  exploitNotes: string[];
}

export const PROFILES: Record<ProfileId, OpponentProfile> = {
  unknown: {
    id: 'unknown',
    name: 'Unknown / baseline',
    short: 'Unknown',
    description:
      'No reads. Modelled as a reasonably competent player who plays near the baseline charts, bets strong hands and draws, bluffs at a moderate rate, and defends roughly in line with pot odds.',
    looseness: 0,
    aggression: 0.5,
    callShift: 0,
    valueShift: 0,
    bluff: 0.14,
    cbet: 0.55,
    slowplay: 0.12,
    bigSizing: 0.4,
    exploitNotes: ['Without reads, prefer strategies that are hard to exploit: balanced sizings, pot-odds based defence, and value-heavy big bets.'],
  },
  tag: {
    id: 'tag',
    name: 'Tight-aggressive regular',
    short: 'TAG',
    description: 'Plays a solid, slightly tight range and bets and raises with strong hands and good draws. Bluffs at a reasonable frequency.',
    looseness: -0.1,
    aggression: 0.65,
    callShift: 0.02,
    valueShift: -0.01,
    bluff: 0.16,
    cbet: 0.6,
    slowplay: 0.1,
    bigSizing: 0.45,
    exploitNotes: ['Respect their raises more than an unknown player’s; their value ranges are strong.', 'Their folds to big bets are fairly frequent on scary runouts, so well-chosen bluffs can work.'],
  },
  nit: {
    id: 'nit',
    name: 'Tight-passive (nit)',
    short: 'Nit',
    description: 'Plays few hands, rarely bluffs, and folds medium-strength hands to aggression. When a nit bets or raises big, it is usually strong.',
    looseness: -0.4,
    aggression: 0.25,
    callShift: 0.08,
    valueShift: 0.04,
    bluff: 0.03,
    cbet: 0.4,
    slowplay: 0.2,
    bigSizing: 0.3,
    exploitNotes: ['Bluff more often: they fold too much.', 'Fold more bluff-catchers when they bet big: they under-bluff.', 'Value bet thinner only when they have shown they will call.'],
  },
  station: {
    id: 'station',
    name: 'Calling station (loose-passive)',
    short: 'Station',
    description: 'Plays many hands, calls far too often with weak pairs and draws, and rarely raises or bluffs.',
    looseness: 0.6,
    aggression: 0.2,
    callShift: -0.13,
    valueShift: 0.03,
    bluff: 0.04,
    cbet: 0.35,
    slowplay: 0.3,
    bigSizing: 0.2,
    exploitNotes: ['Value bet thinner and bigger: weaker hands call.', 'Bluff much less: fold equity is low.', 'When a station finally raises, it is usually a very strong hand.'],
  },
  lag: {
    id: 'lag',
    name: 'Loose-aggressive (LAG / maniac-leaning)',
    short: 'LAG',
    description: 'Plays many hands aggressively, bluffs often and uses large sizings. Their bets are less likely to mean strength.',
    looseness: 0.35,
    aggression: 0.9,
    callShift: -0.04,
    valueShift: -0.03,
    bluff: 0.35,
    cbet: 0.8,
    slowplay: 0.05,
    bigSizing: 0.65,
    exploitNotes: ['Bluff-catch more often with medium-strength hands.', 'Let them bluff: checking strong hands to induce can gain value.', 'Avoid thin bluffs into a player who raises often.'],
  },
  overfolder: {
    id: 'overfolder',
    name: 'Over-folder (weak-tight)',
    short: 'Overfolder',
    description: 'Calls preflop reasonably but gives up too easily postflop, folding too many hands to continuation bets and barrels.',
    looseness: 0,
    aggression: 0.35,
    callShift: 0.12,
    valueShift: 0.02,
    bluff: 0.06,
    cbet: 0.45,
    slowplay: 0.1,
    bigSizing: 0.3,
    exploitNotes: ['Bet more often with your weak hands and bluffs: they fold too much.', 'Thin value bets get fewer calls; size down for value.'],
  },
};

export const PROFILE_LIST: OpponentProfile[] = Object.values(PROFILES);
