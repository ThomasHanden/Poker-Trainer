// A complete hand from the deal: every seat gets real cards, opponents in front of the hero act with
// their profile's policy, and the hero then plays every street until a fold or showdown. Every hero
// decision is graded with the generic guidance (charts preflop, pot odds / equity / model EV after).

import { Card, childRng, createRng, deckWithout } from '../../engine/cards';
import { HandState, POSITIONS, applyAction, newHand } from '../../engine/rules';
import { policyDistribution, publicView, sampleAction } from '../../opponents/policy';
import { PROFILES, ProfileId } from '../../opponents/profiles';
import { classOf } from '../../ranges/hands';
import { preflopRanking } from '../../ranges/preflopEquity';
import { Difficulty, PracticeSettings, STACK_BANDS, Scenario, ScenarioTemplate } from '../types';
import { cashConfig } from './helpers';

const VERSION = 1;

function pickProfile(settings: PracticeSettings, difficulty: Difficulty, u: () => number): ProfileId {
  if (settings.opponent !== 'random') return settings.opponent;
  const all: ProfileId[] = ['unknown', 'tag', 'nit', 'station', 'lag', 'overfolder'];
  const p = difficulty === 'beginner' ? 0.7 : difficulty === 'intermediate' ? 0.45 : 0;
  return u() < p ? 'unknown' : all[Math.floor(u() * all.length)];
}

/** Deal and run the hand up to the hero's first decision; null if the hand ends before the hero acts. */
export function buildFullHand(settings: PracticeSettings, seed: number): Scenario | null {
  const rng = createRng(seed);
  const sizes = settings.tableSize === 'any' ? [6, 6, 9, 2] : [settings.tableSize];
  const n = rng.pick(sizes);
  const positions = POSITIONS[n];
  const hero = settings.heroPosition !== 'any' ? positions.indexOf(settings.heroPosition) : Math.floor(rng.next() * n);
  if (hero < 0) return null;
  let stackBB = 100;
  if (settings.stack !== 'any') {
    const b = STACK_BANDS[settings.stack];
    if (stackBB < b.min || stackBB > b.max) stackBB = Math.round((b.min + Math.min(b.max, 250)) / 2);
  }
  const config = cashConfig(n);
  const stacks = Array(n).fill(stackBB * config.bb);

  // deal: the hero usually gets a hand worth playing (otherwise most full hands end with a preflop fold)
  const playable = new Set(preflopRanking().slice(0, 70));
  let deck = rng.shuffle(deckWithout([]));
  for (let t = 0; t < 60; t++) {
    const h = classOf(deck[0], deck[1]);
    if (playable.has(h) || rng.next() < 0.12) break;
    deck = rng.shuffle(deck);
  }
  const holes: Card[][] = Array.from({ length: n }, () => []);
  holes[hero] = [deck[0], deck[1]];
  let k = 2;
  for (let i = 0; i < n; i++) if (i !== hero) holes[i] = [deck[k++], deck[k++]];
  const rest = deck.slice(k);
  const base = newHand({ config, stacks, heroIndex: hero, holes, deckOrder: rest });

  const difficulty = settings.difficulty;
  const pu = childRng(seed, 'profile');
  const trueProfiles: Record<number, ProfileId> = {};
  const shownProfiles: Record<number, ProfileId> = {};
  const hidden = difficulty === 'expert' && settings.opponent === 'random';
  for (let i = 0; i < n; i++) {
    if (i === hero) continue;
    trueProfiles[i] = pickProfile(settings, difficulty, () => pu.next());
    shownProfiles[i] = hidden ? 'unknown' : trueProfiles[i];
  }

  // opponents in front of the hero act exactly as play.ts would (same random stream)
  let st: HandState = base;
  let guard = 0;
  while (!st.complete && st.toAct !== hero && guard++ < 40) {
    const actor = st.toAct;
    const opts = policyDistribution(publicView(st, actor), PROFILES[trueProfiles[actor]]);
    const u = childRng(seed, `opp:${st.history.length}`).next();
    st = applyAction(st, sampleAction(opts, u).action);
  }
  if (st.complete || st.toAct !== hero) return null;

  const before = st.history.filter((h) => !h.type.startsWith('post') && h.player !== hero);
  const raisers = before.filter((h) => h.type === 'raise' || h.type === 'bet').length;
  const callers = before.filter((h) => h.type === 'call').length;
  const facing = raisers === 0 ? (callers ? `${callers} limper${callers > 1 ? 's' : ''}` : before.length ? 'folded to you' : 'first to act') : raisers === 1 ? 'facing a raise' : 'facing a re-raise';
  const pos = positions[hero];
  return {
    id: `full-hand@${VERSION}#${seed}`,
    templateId: 'full-hand',
    templateVersion: VERSION,
    seed,
    settings,
    difficulty,
    createdAt: Date.now(),
    state: st,
    base,
    heroIndex: hero,
    trueProfiles,
    shownProfiles,
    params: {},
    assumptions: [
      `${n === 2 ? 'Heads-up' : `${n}-handed`} cash game, ${stackBB}bb stacks, no antes.`,
      'Every player has real cards; opponents act with their profile’s strategy at every decision.',
      'Each of your decisions is graded on its own, using what you could see at that moment.',
      'You are dealt a playable hand most of the time so the hand usually reaches the flop.',
    ],
    fingerprint: ['full-hand', classOf(holes[hero][0], holes[hero][1]), pos, n, facing].join('|'),
    title: `Full hand · ${pos}`,
    setupText: `${n === 2 ? 'Heads-up' : `${n}-handed`}, ${stackBB}bb deep. You are in the ${pos} (${facing}). Play the hand from start to finish — preflop, flop, turn, river and showdown.`,
  };
}

export const FULL_HAND: ScenarioTemplate = {
  id: 'full-hand',
  version: VERSION,
  title: 'Full hand (deal to showdown)',
  summary: 'A complete hand from the deal: play preflop, flop, turn and river against opponents who act on every street.',
  objectives: ['Put the street-by-street ideas together in one hand.', 'Plan ahead: how your preflop choice shapes the flop, turn and river.'],
  street: 'preflop',
  category: 'Full hand',
  concepts: ['position', 'preflop-open', 'pot-odds'],
  lessons: ['position', 'starting-hands-position', 'cbetting', 'turn-river-planning', 'bluff-catching'],
  formats: ['cash'],
  tableSizes: [2, 6, 9],
  heroPositions: ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  stackBB: [100],
  potType: 'srp',
  multiway: false,
  facing: 'first-to-act',
  difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
  evaluation: {
    method: 'heuristic+model',
    assumptions: ['Preflop decisions use the baseline charts; later decisions use pot odds, equity against the modeled ranges and simulated EV.'],
  },
  setupText: 'Play a complete hand from the deal.',
  hint: 'Think about your position and who has already entered the pot before deciding to play.',
  genericGuide: true,
  custom: buildFullHand,
  build: () => null,
  guide: () => {
    throw new Error('Full hands use the generic guidance');
  },
};
