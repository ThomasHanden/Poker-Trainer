// Hand play controller: hero decisions are recorded; opponents act via the policy using a seeded
// RNG derived from the scenario seed and the history length (deterministic replays).

import { childRng } from '../engine/cards';
import { HandState, PlayerAction, applyAction, validateAction, legalActions } from '../engine/rules';
import { policyDistribution, publicView, sampleAction } from '../opponents/policy';
import { PROFILES } from '../opponents/profiles';
import { Scenario } from './types';
import { DecisionRecord, Assistance } from '../evaluation/evaluate';

export interface PlaySession {
  scenario: Scenario;
  state: HandState;
  decisions: DecisionRecord[];
  startedAt: number;
}

export function startSession(sc: Scenario): PlaySession {
  const s: PlaySession = { scenario: sc, state: sc.state, decisions: [], startedAt: Date.now() };
  return advanceOpponents(s);
}

/** Let opponents act until the hero must act or the hand is over. */
export function advanceOpponents(sess: PlaySession): PlaySession {
  let st = sess.state;
  let guard = 0;
  while (!st.complete && st.toAct !== sess.scenario.heroIndex && guard++ < 60) {
    const actor = st.toAct;
    const profile = PROFILES[sess.scenario.trueProfiles[actor] ?? 'unknown'];
    const opts = policyDistribution(publicView(st, actor), profile);
    const u = childRng(sess.scenario.seed, `opp:${st.history.length}`).next();
    st = applyAction(st, sampleAction(opts, u).action);
  }
  return { ...sess, state: st };
}

export function heroAct(sess: PlaySession, action: PlayerAction, assisted: Assistance, elapsedMs = 0): PlaySession {
  const st = sess.state;
  if (st.toAct !== sess.scenario.heroIndex) throw new Error('It is not your turn');
  const err = validateAction(st, action);
  if (err) throw new Error(err);
  const la = legalActions(st)!;
  // resolve all-in to a concrete action for the record
  let resolved: PlayerAction = action;
  if (action.type === 'allin') resolved = la.canBet ? { type: 'bet', to: la.maxTo } : la.canRaise ? { type: 'raise', to: la.maxTo } : la.canCall ? { type: 'call' } : { type: 'check' };
  const rec: DecisionRecord = {
    index: st.history.length,
    street: st.street,
    state: st,
    action: resolved,
    isKey: sess.decisions.length === 0,
    assisted,
    elapsedMs,
  };
  const next = applyAction(st, resolved);
  return advanceOpponents({ ...sess, state: next, decisions: [...sess.decisions, rec] });
}

/** Replay a recorded list of hero actions on a scenario (used for persistence restore and tests). */
export function replay(sc: Scenario, actions: PlayerAction[]): PlaySession {
  let s = startSession(sc);
  for (const a of actions) {
    if (s.state.complete) break;
    s = heroAct(s, a, { hint: false, potOdds: false, equity: false, feedback: false });
  }
  return s;
}
