// Concept taxonomy shared by scenarios, lessons, evaluation and progress tracking.

export type ConceptId =
  | 'position'
  | 'preflop-open'
  | 'facing-open'
  | 'three-bet'
  | 'four-bet'
  | 'blind-defense'
  | 'blind-vs-blind'
  | 'squeeze'
  | 'isolation'
  | 'domination'
  | 'stack-depth'
  | 'short-stack'
  | 'push-fold'
  | 'icm'
  | 'board-texture'
  | 'range-advantage'
  | 'cbet'
  | 'checking-range'
  | 'value-bet'
  | 'thin-value'
  | 'semi-bluff'
  | 'bluff'
  | 'blockers'
  | 'bluff-catch'
  | 'pot-odds'
  | 'implied-odds'
  | 'facing-raise'
  | 'check-raise'
  | 'barreling'
  | 'probe'
  | 'delayed-cbet'
  | 'overbet'
  | 'bet-sizing'
  | 'multiway'
  | 'spr'
  | 'mdf'
  | 'equity-realization'
  | 'exploit';

export const CONCEPTS: Record<ConceptId, { name: string; lesson: string }> = {
  position: { name: 'Position', lesson: 'position' },
  'preflop-open': { name: 'Opening ranges', lesson: 'opening-ranges' },
  'facing-open': { name: 'Facing an open', lesson: 'calling-vs-raising' },
  'three-bet': { name: '3-betting', lesson: 'three-four-betting' },
  'four-bet': { name: '4-betting', lesson: 'three-four-betting' },
  'blind-defense': { name: 'Blind defense', lesson: 'blind-defense' },
  'blind-vs-blind': { name: 'Blind vs blind', lesson: 'blind-defense' },
  squeeze: { name: 'Squeezing', lesson: 'squeezes' },
  isolation: { name: 'Isolation raises', lesson: 'isolation-limped' },
  domination: { name: 'Domination & playability', lesson: 'playability' },
  'stack-depth': { name: 'Stack depth', lesson: 'stack-depth-preflop' },
  'short-stack': { name: 'Short-stack play', lesson: 'short-stack' },
  'push-fold': { name: 'Push/fold', lesson: 'push-fold' },
  icm: { name: 'ICM & payouts', lesson: 'icm' },
  'board-texture': { name: 'Board texture', lesson: 'board-texture' },
  'range-advantage': { name: 'Range & nut advantage', lesson: 'range-advantage' },
  cbet: { name: 'Continuation betting', lesson: 'cbetting' },
  'checking-range': { name: 'Checking strong hands', lesson: 'cbetting' },
  'value-bet': { name: 'Value betting', lesson: 'value-bluff-semibluff' },
  'thin-value': { name: 'Thin value', lesson: 'thin-value' },
  'semi-bluff': { name: 'Semi-bluffing', lesson: 'value-bluff-semibluff' },
  bluff: { name: 'Bluffing', lesson: 'value-bluff-semibluff' },
  blockers: { name: 'Blockers', lesson: 'blockers' },
  'bluff-catch': { name: 'Bluff catching', lesson: 'bluff-catching' },
  'pot-odds': { name: 'Pot odds', lesson: 'pot-odds' },
  'implied-odds': { name: 'Implied odds', lesson: 'implied-odds' },
  'facing-raise': { name: 'Facing raises', lesson: 'check-raising' },
  'check-raise': { name: 'Check-raising', lesson: 'check-raising' },
  barreling: { name: 'Turn barreling', lesson: 'turn-river-planning' },
  probe: { name: 'Probe & donk bets', lesson: 'probe-donk' },
  'delayed-cbet': { name: 'Delayed c-bets', lesson: 'delayed-cbet' },
  overbet: { name: 'Overbets', lesson: 'overbets-underbets' },
  'bet-sizing': { name: 'Bet sizing', lesson: 'what-a-bet-does' },
  multiway: { name: 'Multiway pots', lesson: 'multiway' },
  spr: { name: 'Stack-to-pot ratio', lesson: 'position-spr' },
  mdf: { name: 'Minimum defense frequency', lesson: 'mdf' },
  'equity-realization': { name: 'Equity realization', lesson: 'equity-denial-realization' },
  exploit: { name: 'Exploiting tendencies', lesson: 'exploitative-adjustments' },
};

export const CONCEPT_IDS = Object.keys(CONCEPTS) as ConceptId[];
