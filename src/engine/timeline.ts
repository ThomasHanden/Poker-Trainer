// Rebuilds the table state after every action of a finished (or in-progress) hand, so the hand can be
// replayed visually. The board is drawn from the front of the deck with no burns, so the original deck
// order is the dealt board followed by the remaining deck.

import { ActionRecord, HandState, PlayerAction, applyAction, newHand } from './rules';

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

/** Returns null if the hand cannot be reconstructed exactly (it then falls back to the text history). */
export function buildTimeline(final: HandState): TimelineStep[] | null {
  try {
    const start = newHand({
      config: final.config,
      stacks: final.players.map((p) => p.startStack),
      heroIndex: Math.max(0, final.players.findIndex((p) => p.isHero)),
      holes: final.players.map((p) => p.hole),
      deckOrder: [...final.board, ...final.deck],
      names: final.players.map((p) => p.name),
    });
    const steps: TimelineStep[] = [];
    let s = start;
    let posts = 0;
    while (posts < final.history.length && final.history[posts].type.startsWith('post')) posts++;
    steps.push({ state: s, historyIndex: posts - 1 });
    for (let i = posts; i < final.history.length; i++) {
      const r = final.history[i];
      s = applyAction(s, toAction(r), !!r.scripted);
      steps.push({ state: s, record: r, historyIndex: i });
    }
    const same = s.players.every((p, i) => p.stack === final.players[i].stack) && s.board.length === final.board.length && s.complete === final.complete;
    return same ? steps : null;
  } catch {
    return null;
  }
}
