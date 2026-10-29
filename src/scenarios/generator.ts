// Scenario generation: template -> script -> concrete, legal, reproducible hand.

import { Card, Rng, childRng, createRng, deckWithout, hashString } from '../engine/cards';
import {
  HandState,
  newHand,
  applyAction,
  legalActions,
  potFractionTo,
  POSITIONS,
  PlayerAction,
  Street,
} from '../engine/rules';
import { boardTexture } from '../engine/board';
import { expandRange, classOf, WeightedCombo, Range } from '../ranges/hands';
import { inferRange, sampleCombo, allCombos } from '../opponents/inference';
import { sizePreflopRaise, policyBetSizes, policyRaiseSize } from '../opponents/policy';
import { PROFILES, ProfileId, PROFILE_LIST } from '../opponents/profiles';
import {
  BuildContext,
  Difficulty,
  PracticeSettings,
  Scenario,
  ScenarioScript,
  ScenarioTemplate,
  ScriptAction,
  SizeSpec,
  STACK_BANDS,
} from './types';
import { TEMPLATES } from './templates';

export const AMBIGUITY: Record<Difficulty, number> = { beginner: 0.1, intermediate: 0.35, advanced: 0.6, expert: 0.8 };

export class ScenarioError extends Error {}

function resolveSize(s: HandState, actor: number, act: ScriptAction): PlayerAction {
  const la = legalActions(s);
  if (!la) throw new ScenarioError('No action pending in script');
  if (act.act === 'fold' || act.act === 'check' || act.act === 'call') return { type: act.act };
  if (act.act === 'allin') return { type: 'allin' };
  const size: SizeSpec = act.size ?? { kind: 'policy' };
  let to: number;
  switch (size.kind) {
    case 'allin':
      to = la.maxTo;
      break;
    case 'bb':
      to = Math.round(size.to * s.config.bb);
      break;
    case 'pot':
      to = potFractionTo(s, size.fraction);
      break;
    case 'policy':
    case 'policy-large':
      if (s.street === 'preflop') to = sizePreflopRaise(s, actor);
      else if (act.act === 'bet') to = size.kind === 'policy' ? policyBetSizes(s).small : policyBetSizes(s).large;
      else to = policyRaiseSize(s, size.kind === 'policy-large', size.kind === 'policy-large');
      break;
  }
  to = Math.max(la.minTo, Math.min(la.maxTo, to));
  return { type: act.act, to };
}

const posIndex = (n: number, pos: string) => {
  const i = POSITIONS[n].indexOf(pos);
  if (i < 0) throw new ScenarioError(`Position ${pos} not at a ${n}-handed table`);
  return i;
};

/** Apply a street's scripted actions. Preflop: players not mentioned before the next scripted actor fold. */
function runActions(s: HandState, actions: ScriptAction[], street: Street, hero: number): HandState {
  const n = s.players.length;
  for (const a of actions) {
    const target = posIndex(n, a.pos);
    let guard = 0;
    while (s.toAct !== target) {
      if (s.complete) throw new ScenarioError('Hand ended during script');
      if (street !== 'preflop' || s.toAct === hero) throw new ScenarioError(`Script expected ${a.pos} to act on ${street}, but ${s.players[s.toAct]?.position} is to act`);
      s = applyAction(s, { type: 'fold' }, true);
      if (guard++ > 12) throw new ScenarioError('Script loop');
    }
    s = applyAction(s, resolveSize(s, target, a), true);
    if (s.street !== street && a !== actions[actions.length - 1]) throw new ScenarioError(`Street advanced early in ${street} script`);
  }
  return s;
}

function dealConstrained(rng: Rng, dead: Set<Card>, count: number, cond?: (c: Card[], prior: Card[]) => boolean, prior: Card[] = []): Card[] | null {
  const deck = deckWithout(dead);
  for (let t = 0; t < 400; t++) {
    const picked: Card[] = [];
    const d = deck.slice();
    for (let k = 0; k < count; k++) {
      const j = k + rng.int(d.length - k);
      [d[k], d[j]] = [d[j], d[k]];
      picked.push(d[k]);
    }
    if (!cond || cond(picked, prior)) return picked;
  }
  return null;
}

export interface MaterializeResult {
  scenario?: Scenario;
  error?: string;
}

export function materialize(template: ScenarioTemplate, script: ScenarioScript, seed: number, settings: PracticeSettings, difficulty: Difficulty): Scenario {
  const rng = childRng(seed, 'cards');
  const n = script.config.numPlayers;
  const hero = posIndex(n, script.heroPos);
  const bb = script.config.bb;
  const stacks = script.stacksBB.map((x) => Math.round(x * bb));
  if (stacks.length !== n) throw new ScenarioError('stack count mismatch');

  // 1. board + hero hand (retry boards until a qualifying hero hand exists)
  let board: Card[] = [];
  let heroCombo: WeightedCombo | null = null;
  const streets: ('flop' | 'turn' | 'river')[] = [];
  if (script.flop) streets.push('flop');
  if (script.turn) streets.push('turn');
  if (script.river) streets.push('river');
  for (let attempt = 0; attempt < 60 && !heroCombo; attempt++) {
    board = [];
    let ok = true;
    for (const st of streets) {
      const spec = script[st]!;
      const cards = dealConstrained(rng, new Set(board), st === 'flop' ? 3 : 1, spec.cards, board);
      if (!cards) {
        ok = false;
        break;
      }
      board.push(...cards);
    }
    if (!ok) continue;
    const prior: Range | undefined = script.hero.range;
    const pool = prior ? expandRange(prior, board) : allCombos(board);
    const qualifying = pool
      .filter((c) => !script.hero.filter || script.hero.filter(c.cards, board))
      .map((c) => ({ ...c, weight: c.weight * (script.hero.weight ? script.hero.weight(c.cards, board) : 1) }))
      .filter((c) => c.weight > 0);
    heroCombo = sampleCombo(qualifying, rng.next, new Set());
  }
  if (!heroCombo) throw new ScenarioError('No hero hand satisfies the template constraints');
  const heroHole = [heroCombo.cards[0], heroCombo.cards[1]];

  // 2. public history with unknown opponent cards
  const fillerDeck = rng.shuffle(deckWithout([...heroHole, ...board]));
  const holes0: Card[][] = Array.from({ length: n }, (_, i) => (i === hero ? heroHole : []));
  const base0 = newHand({ config: script.config, stacks, heroIndex: hero, holes: holes0, deckOrder: [...board, ...fillerDeck] });
  let s = runActions(base0, script.preflop, 'preflop', hero);
  for (const st of streets) {
    if (s.street !== st) {
      throw new ScenarioError(`Expected street ${st}, at ${s.street}`);
    }
    s = runActions(s, script[st]!.actions, st, hero);
  }
  // fold remaining players before hero preflop if script stopped early
  let guard = 0;
  while (!s.complete && s.toAct !== hero && s.street === 'preflop' && guard++ < 12) s = applyAction(s, { type: 'fold' }, true);
  if (s.complete || s.toAct !== hero) throw new ScenarioError('Script did not end with the hero to act');

  // 3. opponent profiles and hidden holdings
  const trueProfiles: Record<number, ProfileId> = {};
  const shownProfiles: Record<number, ProfileId> = {};
  const hidden = difficulty === 'expert' && settings.opponent === 'random';
  for (let i = 0; i < n; i++) {
    if (i === hero) continue;
    const pid = script.profiles[s.players[i].position] ?? 'unknown';
    trueProfiles[i] = pid;
    shownProfiles[i] = hidden ? 'unknown' : pid;
  }
  const live = s.players.filter((p) => !p.folded && p.index !== hero).map((p) => p.index);
  // any player who must still act preflop needs cards too (all non-folded players)
  const dead = [...heroHole, ...board];
  const posteriors = live.map((v) => inferRange(base0, s.history, v, PROFILES[trueProfiles[v]], dead));
  for (const [k, post] of posteriors.entries()) {
    if (post.length === 0) throw new ScenarioError(`Scripted actions impossible for ${s.players[live[k]].position} under the policy`);
  }
  let villainHoles: Card[][] | null = null;
  for (let t = 0; t < 200 && !villainHoles; t++) {
    const used = new Set(dead);
    const picked: Card[][] = [];
    let ok = true;
    for (const post of posteriors) {
      const c = sampleCombo(post, rng.next, used);
      if (!c) {
        ok = false;
        break;
      }
      used.add(c.cards[0]);
      used.add(c.cards[1]);
      picked.push([c.cards[0], c.cards[1]]);
    }
    if (ok) villainHoles = picked;
  }
  if (!villainHoles) throw new ScenarioError('Could not deal consistent opponent hands');

  // 4. final state with all cards; future board cards are shuffled from the remaining deck
  const holes: Card[][] = Array.from({ length: n }, (_, i) => (i === hero ? heroHole : []));
  live.forEach((v, k) => (holes[v] = villainHoles![k]));
  // folded players get no cards (their cards are unknown and irrelevant)
  const rest = rng.shuffle(deckWithout([...holes.flat(), ...board]));
  const base = newHand({ config: script.config, stacks, heroIndex: hero, holes, deckOrder: [...board, ...rest] });
  let final = base;
  for (let i = base.history.length; i < s.history.length; i++) {
    const r = s.history[i];
    const a: PlayerAction = r.type === 'bet' || r.type === 'raise' ? { type: r.type, to: r.to } : { type: r.type as 'fold' | 'check' | 'call' };
    final = applyAction(final, a, true);
  }
  if (final.toAct !== hero) throw new ScenarioError('Replay mismatch');

  const tex = board.length >= 3 ? boardTexture(board.slice(0, 3)).category : 'pre';
  const effBB = Math.round(Math.min(...[hero, ...live].map((i) => script.stacksBB[i])));
  const fingerprint = [template.id, classOf(heroHole[0], heroHole[1]), script.heroPos, live.map((v) => s.players[v].position).join('+'), tex, effBB].join('|');
  return {
    id: `${template.id}@${template.version}#${seed}`,
    templateId: template.id,
    templateVersion: template.version,
    seed,
    settings,
    difficulty,
    createdAt: Date.now(),
    state: final,
    base,
    heroIndex: hero,
    trueProfiles,
    shownProfiles,
    params: script.params ?? {},
    assumptions: [...template.evaluation.assumptions, ...(script.assumptions ?? [])],
    icm: script.icm,
    fingerprint,
    title: template.title,
    setupText: template.setupText,
  };
}

// ---------------- Template selection ----------------

export interface SupportCheck {
  templates: ScenarioTemplate[];
  reasons: string[];
}

function stackMatches(t: ScenarioTemplate, band: PracticeSettings['stack']) {
  if (band === 'any') return true;
  const b = STACK_BANDS[band];
  return t.stackBB.some((x) => x >= b.min && x <= b.max);
}

export function matchingTemplates(settings: PracticeSettings, templates: ScenarioTemplate[] = TEMPLATES): SupportCheck {
  const reasons: string[] = [];
  const checks: [string, (t: ScenarioTemplate) => boolean][] = [
    ['difficulty', (t) => t.difficulties.includes(settings.difficulty)],
    ['format', (t) => settings.format === 'any' || t.formats.includes(settings.format)],
    ['table size', (t) => settings.tableSize === 'any' || t.tableSizes.includes(settings.tableSize)],
    ['stack depth', (t) => stackMatches(t, settings.stack)],
    ['position', (t) => settings.heroPosition === 'any' || t.heroPositions.includes(settings.heroPosition)],
    [
      'street',
      (t) =>
        settings.street === 'full' ? t.id === 'full-hand' : settings.street === 'any' || t.street === settings.street,
    ],
    ['players', (t) => settings.players === 'any' || (settings.players === 'multiway') === t.multiway],
    ['pot type', (t) => settings.potType === 'any' || t.potType === settings.potType],
    ['concepts', (t) => settings.concepts.length === 0 || settings.concepts.some((c) => t.concepts.includes(c))],
  ];
  let pool = templates;
  for (const [name, f] of checks) {
    const next = pool.filter(f);
    if (next.length === 0 && pool.length > 0) reasons.push(`No supported scenario matches your ${name} setting together with the earlier filters.`);
    pool = next;
  }
  return { templates: pool, reasons };
}

export interface GenerateOptions {
  seed?: number;
  templateId?: string;
  recentFingerprints?: string[];
  recentTemplates?: string[];
}

export interface GenerateResult {
  scenario?: Scenario;
  error?: string;
  suggestions?: string[];
}

export function pickProfileFactory(settings: PracticeSettings, rng: Rng, difficulty: Difficulty) {
  return (fallback: ProfileId = 'unknown'): ProfileId => {
    if (settings.opponent !== 'random') return settings.opponent;
    if (difficulty === 'beginner') return rng.next() < 0.75 ? fallback : rng.pick(['station', 'nit'] as ProfileId[]);
    if (difficulty === 'intermediate') return rng.next() < 0.5 ? fallback : rng.pick(PROFILE_LIST.map((p) => p.id));
    return rng.pick(PROFILE_LIST.map((p) => p.id));
  };
}

export function generateScenario(settings: PracticeSettings, opts: GenerateOptions = {}): GenerateResult {
  const baseSeed = opts.seed ?? (hashString(`${Date.now()}:${Math.random()}`) >>> 0);
  let pool: ScenarioTemplate[];
  if (opts.templateId) {
    const t = TEMPLATES.find((x) => x.id === opts.templateId);
    if (!t) return { error: `Unknown scenario template "${opts.templateId}".` };
    pool = [t];
  } else {
    const m = matchingTemplates(settings);
    if (m.templates.length === 0) {
      return {
        error: 'That combination of settings is not supported yet, so no scenario was generated (rather than producing a misleading one).',
        suggestions: m.reasons,
      };
    }
    pool = m.templates;
  }
  const recentT = new Set((opts.recentTemplates ?? []).slice(-Math.min(6, Math.max(0, pool.length - 1))));
  const recentF = new Set(opts.recentFingerprints ?? []);
  let lastErr = '';
  for (let attempt = 0; attempt < 30; attempt++) {
    const seed = attempt === 0 ? baseSeed : hashString(`${baseSeed}:${attempt}`);
    const rng = createRng(seed);
    const fresh = pool.filter((t) => !recentT.has(t.id));
    const t = opts.templateId ? pool[0] : rng.pick(fresh.length ? fresh : pool);
    const ctx: BuildContext = {
      rng: childRng(seed, 'build'),
      difficulty: settings.difficulty,
      settings,
      ambiguity: AMBIGUITY[settings.difficulty],
      pickProfile: pickProfileFactory(settings, childRng(seed, 'profile'), settings.difficulty),
    };
    try {
      if (t.custom) {
        const sc = t.custom(settings, seed);
        if (!sc) {
          lastErr = 'The hand ended before your turn.';
          continue;
        }
        if (recentF.has(sc.fingerprint) && attempt < 25 && !opts.seed) continue;
        return { scenario: sc };
      }
      const script = t.build(ctx);
      if (!script) {
        lastErr = `Template ${t.id} could not satisfy the settings.`;
        continue;
      }
      const sc = materialize(t, script, seed, settings, settings.difficulty);
      if (recentF.has(sc.fingerprint) && attempt < 25 && !opts.seed) continue;
      return { scenario: sc };
    } catch (e) {
      lastErr = (e as Error).message;
      if (opts.seed !== undefined && opts.templateId) {
        // deterministic replay requested: do not silently change the seed
        return { error: `Could not rebuild this scenario: ${lastErr}` };
      }
    }
  }
  return { error: `Could not generate a valid scenario (${lastErr}). Try different settings.` };
}

/** Rebuild a scenario exactly from its id and settings. */
export function rebuildScenario(id: string, settings: PracticeSettings): GenerateResult {
  const m = /^(.+)@(\d+)#(\d+)$/.exec(id);
  if (!m) return { error: 'Malformed scenario id' };
  const [, templateId, version, seedStr] = m;
  const t = TEMPLATES.find((x) => x.id === templateId);
  if (!t) return { error: 'Unknown template' };
  const seed = Number(seedStr);
  if (t.custom) {
    const sc = t.custom(settings, seed);
    return sc ? { scenario: sc } : { error: 'Could not rebuild this hand' };
  }
  const ctx: BuildContext = {
    rng: childRng(seed, 'build'),
    difficulty: settings.difficulty,
    settings,
    ambiguity: AMBIGUITY[settings.difficulty],
    pickProfile: pickProfileFactory(settings, childRng(seed, 'profile'), settings.difficulty),
  };
  const script = t.build(ctx);
  if (!script) return { error: 'Template could not be rebuilt with these settings' };
  const sc = materialize(t, script, seed, settings, settings.difficulty);
  if (String(t.version) !== version) {
    return { scenario: sc, error: `Note: this scenario was created with template version ${version}; it has been rebuilt with version ${t.version}, so details may differ.` };
  }
  return { scenario: sc };
}
