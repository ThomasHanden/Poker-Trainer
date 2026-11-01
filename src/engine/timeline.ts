// Rebuilds the table state after every action of a finished (or in-progress) hand, so the hand can be
// replayed visually. The board is drawn from the front of the deck with no burns, so the original deck
// order is the dealt board followed by the remaining deck.

import { ActionRecord, HandState, PlayerAction, applyAction, newHand, runOut } from './rules';
import type { Card } from './cards';

export interface TimelineStep {
  /** state after this step's action (step 0: after the blinds and antes) */
  state: HandState;
  /** the action shown in this step; undefined for the opening step */
  record?: ActionRecord;
  /** index into state.history of the record */
  historyIndex: number;
}

function toAction(r: ActionRecord): PlayerAction {
  switch (r.type) {
    case 'bet':
    case 'raise':
      return { type: r.type, to: r.to };
    case 'call':
      return { type: 'call' };
    case 'check':
      return { type: 'check' };
    default:
      return { type: 'fold' };
  }
}

/**
 * The deck in the order the hand dealt it. Double board deals flop 1, flop 2, turn 1, turn 2,
 * river 1, river 2; run twice deals the first run, then the second run's own cards.
 */
function dealtOrder(final: HandState): Card[] {
  const b1 = final.board;
  const b2 = final.board2 ?? [];
  if (final.doubleBoard) {
    const out: Card[] = [];
    for (const [from, to] of [[0, 3], [3, 4], [4, 5]]) out.push(...b1.slice(from, to), ...b2.slice(from, to));
    return [...out, ...final.deck];
  }
  if (final.runs === 2) {
    let shared = 0;
    while (shared < b1.length && b1[shared] === b2[shared]) shared++;
    return [...b1, ...b2.slice(shared), ...final.deck];
  }
  return [...b1, ...final.deck];
}

/** Returns null if the hand cannot be reconstructed exactly (it then falls back to the text history). */
export function buildTimeline(final: HandState): TimelineStep[] | null {
  try {
    const start = newHand({
      config: final.config,
      stacks: final.players.map((p) => p.startStack),
      heroIndex: Math.max(0, final.players.findIndex((p) => p.isHero)),
      holes: final.players.map((p) => p.hole),
      deckOrder: dealtOrder(final),
      names: final.players.map((p) => p.name),
      bomb: final.bomb,
      straddle: !!final.straddle,
      doubleBoard: final.doubleBoard,
      holdRunout: final.holdRunout,
    });
    const steps: TimelineStep[] = [];
    let s = start;
    let posts = 0;
    while (posts < final.history.length && final.history[posts].type.startsWith('post')) posts++;
    steps.push({ state: s, historyIndex: posts - 1 });
    for (let i = posts; i < final.history.length; i++) {
      const r = final.history[i];
      s = applyAction(s, toAction(r), !!r.scripted);
      if (s.runoutPending && final.complete) s = runOut(s, final.runs ?? 1);
      steps.push({ state: s, record: r, historyIndex: i });
    }
    const same = s.players.every((p, i) => p.stack === final.players[i].stack) && s.board.length === final.board.length && s.complete === final.complete;
    return same ? steps : null;
  } catch {
    return null;
  }
}
