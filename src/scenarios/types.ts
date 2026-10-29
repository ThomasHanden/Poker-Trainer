import type { Card } from '../engine/cards';
import type { Format, HandState, Street, TableConfig, LegalActions } from '../engine/rules';
import type { Range, WeightedCombo, HandClass } from '../ranges/hands';
import type { ProfileId } from '../opponents/profiles';
import type { ConceptId } from '../content/concepts';
import type { Texture, MadeHandInfo, DrawInfo } from '../engine/board';
import type { EquityResult } from '../engine/equity';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];
export type PotType = 'limped' | 'srp' | '3bp' | '4bp';
export type StackBand = 'short' | 'medium' | 'standard' | 'deep';
export const STACK_BANDS: Record<StackBand, { label: string; min: number; max: number }> = {
  short: { label: 'Short (≤ 25bb)', min: 0, max: 25 },
  medium: { label: 'Medium (26–60bb)', min: 26, max: 60 },
  standard: { label: 'Standard (~100bb)', min: 61, max: 120 },
  deep: { label: 'Deep (150bb+)', min: 121, max: 1000 },
};

export interface PracticeSettings {
  difficulty: Difficulty;
  format: 'any' | Format;
  tableSize: 'any' | 2 | 6 | 9;
  stack: 'any' | StackBand;
  heroPosition: 'any' | string;
  street: 'any' | Street | 'full';
  players: 'any' | 'headsup' | 'multiway';
  potType: 'any' | PotType;
  opponent: 'random' | ProfileId;
  concepts: ConceptId[];
  mode: 'guided' | 'assessment';
  assists: { hints: boolean; potOdds: boolean; equity: boolean; immediateFeedback: boolean };
}

export const DEFAULT_SETTINGS: PracticeSettings = {
  difficulty: 'beginner',
  format: 'any',
  tableSize: 'any',
  stack: 'any',
  heroPosition: 'any',
  street: 'any',
  players: 'any',
  potType: 'any',
  opponent: 'random',
  concepts: [],
  mode: 'assessment',
  assists: { hints: true, potOdds: true, equity: false, immediateFeedback: false },
};

/** How a scripted action's size is specified. */
export type SizeSpec =
  | { kind: 'policy' } // preflop: the policy's standard raise size; postflop bets: policy small size
  | { kind: 'policy-large' }
  | { kind: 'pot'; fraction: number } // fraction of pot (bet) or pot-relative raise
  | { kind: 'bb'; to: number } // raise/bet to this many big blinds
  | { kind: 'allin' };

export interface ScriptAction {
  pos: string;
  act: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
  size?: SizeSpec;
}

export interface StreetScript {
  /** constraint on the cards dealt for this street (given previous board) */
  cards?: (newCards: Card[], prior: Card[]) => boolean;
  actions: ScriptAction[];
}

export interface HeroSpec {
  /** prior range for the hero's holding (e.g. an opening range); defaults to all hands */
  range?: Range;
  /** hand must satisfy this given the board known at the key decision */
  filter?: (hole: Card[], board: Card[]) => boolean;
  /** optional weighting of qualifying hands (e.g. prefer borderline hands at higher difficulty) */
  weight?: (hole: Card[], board: Card[]) => number;
  /** board constraint that depends on the hero hand is not supported: keep constraints on cards() */
}

export interface ScenarioScript {
  config: TableConfig;
  stacksBB: number[]; // per seat in players[] order
  heroPos: string;
  profiles: Record<string, ProfileId>; // by position for opponents that can enter the pot
  preflop: ScriptAction[];
  flop?: StreetScript;
  turn?: StreetScript;
  river?: StreetScript;
  hero: HeroSpec;
  /** free-form parameters that the explanation/guidance can use */
  params?: Record<string, unknown>;
  /** extra assumptions specific to this instance */
  assumptions?: string[];
  /** optional tournament context for ICM-based templates */
  icm?: { payouts: number[]; stacksBB: number[]; playersLeft: number; description: string };
}

export interface TemplateMeta {
  id: string;
  version: number;
  title: string;
  summary: string;
  objectives: string[];
  street: Street; // street of the key decision
  category: string;
  concepts: ConceptId[];
  lessons: string[];
  formats: Format[];
  tableSizes: number[];
  heroPositions: string[];
  stackBB: number[]; // supported effective stacks in bb
  potType: PotType;
  multiway: boolean;
  facing: 'unopened' | 'bet' | 'raise' | 'checked-to' | 'first-to-act' | 'open' | '3bet' | '4bet' | 'shove' | 'limp';
  difficulties: Difficulty[];
  evaluation: {
    method: 'chart' | 'computed-equilibrium' | 'exact-math' | 'icm' | 'heuristic+model';
    assumptions: string[];
  };
  /** short framing shown before the hand (no answer spoilers) */
  setupText: string;
  /** a hint shown only in guided mode on request */
  hint: string;
}

export interface BuildContext {
  rng: import('../engine/cards').Rng;
  difficulty: Difficulty;
  settings: PracticeSettings;
  /** 0..1: how often to pick borderline (ambiguous) hands */
  ambiguity: number;
  pickProfile: (fallback?: ProfileId) => ProfileId;
}

/** Everything the evaluation needs about one hero decision. */
export interface DecisionContext {
  templateId: string;
  isKey: boolean;
  /** state right after blinds (for re-running inference, e.g. blocker analysis) */
  base: HandState;
  state: HandState; // hero to act (contains hero cards; opponents' cards stripped)
  hero: number;
  hole: Card[];
  heroClass: HandClass;
  board: Card[];
  street: Street;
  la: LegalActions;
  pot: number;
  toCall: number;
  bb: number;
  requiredEquity: number;
  spr: number;
  effectiveBB: number;
  inPosition: boolean;
  facing: 'none' | 'bet' | 'raise' | 'allin';
  texture?: Texture;
  made?: MadeHandInfo;
  draws?: DrawInfo;
  percentile?: number;
  villains: { index: number; position: string; profile: ProfileId; combos: WeightedCombo[]; rangePct: number }[];
  equity?: EquityResult & { source: string };
  params: Record<string, unknown>;
  icm?: ScenarioScript['icm'];
  format: Format;
}

export type ActionKey = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface Guidance {
  /** per action: rating under the template's strategic model */
  ratings: Partial<Record<ActionKey, 'preferred' | 'acceptable' | 'mixed' | 'discouraged' | 'mistake'>>;
  /** acceptable sizing band for bets/raises as a fraction of pot (for raises: pot-relative raise) */
  sizing?: { preferred: [number, number]; acceptable: [number, number]; note: string; unit?: 'pot' | 'bb-to' | 'x-raise' };
  reasons: string[]; // mechanism-level explanations
  plausibleRanges?: string;
  alternatives?: string; // which alternatives were reasonable
  tendencyNotes?: string[]; // how opponent tendencies change the recommendation
  mixed?: boolean; // the spot is a genuine mix for this hand
  confidence: 'high' | 'medium' | 'low';
  source: 'chart' | 'computed-equilibrium' | 'exact-math' | 'icm' | 'heuristic';
  math?: { label: string; value: string; kind: 'exact' | 'simulation' | 'table' | 'model' }[];
}

export interface ScenarioTemplate extends TemplateMeta {
  build(ctx: BuildContext): ScenarioScript | null;
  guide(ctx: DecisionContext): Guidance;
  /** builds the whole scenario itself instead of a script (e.g. full hands from the deal) */
  custom?: (settings: PracticeSettings, seed: number) => Scenario | null;
  /** grade every decision, including the first, with the generic guidance */
  genericGuide?: boolean;
}

export interface Scenario {
  id: string; // templateId@version#seed
  templateId: string;
  templateVersion: number;
  seed: number;
  settings: PracticeSettings;
  difficulty: Difficulty;
  createdAt: number;
  /** state at the first hero decision (full information, used by the engine only) */
  state: HandState;
  /** state right after blinds (for replays/inference) */
  base: HandState;
  heroIndex: number;
  trueProfiles: Record<number, ProfileId>;
  shownProfiles: Record<number, ProfileId>;
  params: Record<string, unknown>;
  assumptions: string[];
  icm?: ScenarioScript['icm'];
  fingerprint: string;
  title: string;
  setupText: string;
}
