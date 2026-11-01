// Reviewing live hands with the trainer (src/review/liveReview.ts). Hands are played at a real
// LiveTable and seen through one player's view, exactly as the browser saves them.
import { describe, it, expect } from 'vitest';
import { LiveTable, buyInFor, LOW_STAKES, type TableSettings } from '../src/multiplayer/table';
import { potSize, type PlayerAction } from '../src/engine/rules';
import { assessAction, rebuildDecisions, reviewHand, type ReviewableHand, type LiveReview } from '../src/review/liveReview';

const STACK = buyInFor(LOW_STAKES).max;

/** Seat the players, deal a hand, and play each turn with `play` (by player id and street). */
function playHand(names: string[], play: (id: string, street: string, t: LiveTable) => PlayerAction, opts: { stacks?: number[]; settings?: Partial<TableSettings>; viewer?: string } = {}): ReviewableHand {
  const t = new LiveTable({ hostable: true });
  names.forEach((n, i) => {
    t.setOnline(n, true);
    t.sit(n, n, opts.stacks?.[i] ?? STACK);
  });
  if (opts.settings) t.handle(names[0], { type: 'host', settings: opts.settings });
  t.start();
  for (let k = 0; k < 60 && t.inHand(); k++) {
    const h = t.hand!;
    if (h.runoutPending) {
      for (const n of names) t.handle(n, { type: 'runout', twice: true });
      continue;
    }
    const id = t.order[h.toAct];
    const err = t.act(id, play(id, h.street, t));
    if (err) t.act(id, { type: 'check' }) && t.act(id, { type: 'fold' });
  }
  const viewer = opts.viewer ?? names[0];
  const v = t.viewFor(viewer);
  return { id: `test:${v.handNo}:${Math.random()}`, room: 'abc123', handNo: v.handNo, at: 0, me: v.me, hand: v.hand! };
}
const callDown = (): PlayerAction => ({ type: 'call' });
const checkOrCall = (_id: string, _s: string, t: LiveTable): PlayerAction => {
  const h = t.hand!;
  return h.players[h.toAct].streetCommitted < h.currentBet ? { type: 'call' } : { type: 'check' };
};

describe('rebuilding decisions from a live hand', () => {
  it('finds each of your decisions with the table as it was: board so far, no opponents’ cards, no deck', () => {
    // ann bets every street she can; the others call
    const lh = playHand(['ann', 'bob', 'cat'], (id, street, t) => {
      const h = t.hand!;
      const p = h.players[h.toAct];
      if (id === 'ann' && street !== 'preflop' && h.currentBet === 0) return { type: 'bet', to: 4 };
      return p.streetCommitted < h.currentBet ? { type: 'call' } : { type: 'check' };
    });
    const rb = rebuildDecisions(lh);
    expect(rb.verified).toBe(true);
    expect(rb.decisions.length).toBeGreaterThanOrEqual(4);
    const boardAt = { preflop: 0, flop: 3, turn: 4, river: 5 };
    for (const d of rb.decisions) {
      expect(d.view.board).toHaveLength(boardAt[d.street]);
      expect(d.view.board).toEqual(lh.hand.board.slice(0, boardAt[d.street]));
      expect(d.view.deck).toEqual([]);
      // others' cards stay hidden, even though they were shown at the showdown later
      d.view.players.forEach((p, i) => expect(p.hole).toHaveLength(i === lh.me ? 2 : 0));
      // the pot and price match the engine's own record of the moment
      expect(d.facts.pot).toBe(d.record.potBefore);
      expect(d.facts.toCall).toBe(d.record.toCallBefore);
      expect(potSize(d.view)).toBe(d.facts.pot);
      expect(d.view.toAct).toBe(lh.me);
    }
    // the showdown did reveal the others' cards in the record itself
    expect(lh.hand.players.filter((p) => p.hole.length === 2).length).toBe(3);
  });

  it('a hand you folded preflop has one decision', () => {
    const lh = playHand(['ann', 'bob', 'cat'], (id) => (id === 'ann' ? { type: 'fold' } : { type: 'call' }), { viewer: 'ann' });
    const rb = rebuildDecisions(lh);
    expect(rb.verified).toBe(true);
    expect(rb.decisions.map((d) => [d.street, d.action.type])).toEqual([['preflop', 'fold']]);
  });

  it('a hand with no decision for you says so', () => {
    // three-handed, everyone folds to the big blind: the big blind never acts
    const t = new LiveTable();
    for (const n of ['ann', 'bob', 'cat']) {
      t.setOnline(n, true);
      t.sit(n, n, STACK);
    }
    t.start();
    while (t.inHand()) t.act(t.order[t.hand!.toAct], { type: 'fold' });
    const bb = t.order[2];
    const v = t.viewFor(bb);
    const rb = rebuildDecisions({ id: 'x', room: 'r', handNo: 1, at: 0, me: v.me, hand: v.hand! });
    expect(rb.verified).toBe(true);
    expect(rb.decisions).toEqual([]);
    expect(rb.problems[0]).toMatch(/no decision/);
  });

  it('all-ins with side pots, split pots and uncalled bets all replay to the recorded result', () => {
    for (let k = 0; k < 6; k++) {
      // three different stacks, everyone shoves or calls: a main pot and a side pot
      const lh = playHand(['ann', 'bob', 'cat'], (_id, _s, t) => (legalActions(t).canRaise ? { type: 'allin' } : callDown()), { stacks: [60, 120, 300] });
      const rb = rebuildDecisions(lh);
      expect(rb.verified).toBe(true);
      expect(lh.hand.result!.pots.filter((p) => p.eligible.length > 1).length).toBeGreaterThanOrEqual(1);
    }
    // a bet nobody calls comes back to the bettor
    const lh = playHand(['ann', 'bob'], (id, _s, t) => (id === t.order[t.hand!.toAct] && t.hand!.street === 'preflop' && t.hand!.history.length === 2 ? { type: 'raise', to: 10 } : { type: 'fold' }));
    expect(rebuildDecisions(lh).verified).toBe(true);
    expect(lh.hand.result!.pots.some((p) => p.eligible.length === 1)).toBe(true);
  });

  it('a run-it-twice hand replays too', () => {
    const lh = playHand(['ann', 'bob'], (_id, _s, t) => (legalActions(t).canRaise ? { type: 'allin' } : callDown()), { settings: { runItTwice: true } });
    expect(lh.hand.runs).toBe(2);
    expect(rebuildDecisions(lh).verified).toBe(true);
  });

  it('a record that does not add up is refused, not guessed at', () => {
    const lh = playHand(['ann', 'bob'], checkOrCall);
    const bad = structuredClone(lh);
    bad.hand.history = bad.hand.history.slice(0, -1); // an action missing
    const rb = rebuildDecisions(bad);
    expect(rb.verified).toBe(false);
    expect(rb.decisions).toEqual([]);
    expect(rb.problems[0]).toMatch(/do not replay/);
    const unfinished = structuredClone(lh);
    unfinished.hand.complete = false;
    expect(rebuildDecisions(unfinished).problems[0]).toMatch(/not finished/);
  });

  it('straddles, bomb pots and double boards can be replayed but are not assessed', () => {
    const lh = playHand(['ann', 'bob'], checkOrCall, { settings: { doubleBoard: 2 } });
    const rb = rebuildDecisions(lh);
    expect(rb.verified).toBe(true);
    expect(rb.unassessable).toMatch(/two boards/);
  });
});

function legalActions(t: LiveTable) {
  const h = t.hand!;
  const p = h.players[h.toAct];
  return { canRaise: p.stack + p.streetCommitted > h.currentBet && h.currentBet < p.stack + p.streetCommitted };
}

describe('assessing decisions', () => {
  it('assesses with the trainer, never by the result, and the same hand gives the same review', () => {
    const lh = playHand(['ann', 'bob', 'cat'], (id) => (id === 'ann' ? { type: 'fold' } : { type: 'call' }));
    const a = reviewHand(lh, 1) as LiveReview;
    const b = reviewHand(lh, 1) as LiveReview;
    expect(a).toEqual(b);
    expect(a.decisions).toHaveLength(1);
    const d = a.decisions[0];
    expect(d.evaluation).not.toBeNull();
    expect(d.evaluation!.actionKey).toBe('fold');
    expect(['strong', 'reasonable', 'improve', 'mistake', 'unassessed']).toContain(d.assessment);
    expect(a.summary.keyPoint.length).toBeGreaterThan(10);
    // nothing about who won the pot goes into the assessment
    expect(JSON.stringify(d.evaluation)).not.toMatch(/won the pot|you lost|you won/i);
  }, 30_000);

  it('Try again: another action at the same moment is assessed on its own, and the hand as played is unchanged', () => {
    const lh = playHand(['ann', 'bob', 'cat'], (id) => (id === 'ann' ? { type: 'fold' } : { type: 'call' }));
    const rb = rebuildDecisions(lh);
    const before = JSON.stringify(rb.decisions);
    const d = rb.decisions[0];
    const alt = assessAction(lh, d, { type: 'call' });
    expect(alt!.actionKey).toBe('call');
    expect(JSON.stringify(rb.decisions)).toBe(before);
    expect(rebuildDecisions(lh).decisions[0].action).toEqual({ type: 'fold' });
  }, 30_000);

  it('a hand the trainer cannot assess says why instead of grading it', () => {
    const lh = playHand(['ann', 'bob'], checkOrCall, { settings: { doubleBoard: 2 } });
    const r = reviewHand(lh) as LiveReview;
    expect(r.decisions.every((d) => d.assessment === 'unassessed' && d.evaluation === null && /two boards/.test(d.note!))).toBe(true);
    expect(r.summary.assessed).toBe(0);
  });

  it('an incomplete record gets no review at all', () => {
    const lh = playHand(['ann', 'bob'], checkOrCall);
    const bad = structuredClone(lh);
    bad.hand.result = undefined;
    expect(reviewHand(bad)).toMatchObject({ error: 'incomplete' });
  });
});
