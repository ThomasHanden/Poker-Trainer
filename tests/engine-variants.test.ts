// Engine options for live tables: the straddle, double board and run it twice. Each is off unless a
// hand asks for it, so practice hands are unchanged.
import { describe, it, expect } from 'vitest';
import { applyAction, legalActions, newHand, runOut, totalChips, type HandState, type TableConfig } from '../src/engine/rules';
import { buildTimeline } from '../src/engine/timeline';
import { parseCard, type Card } from '../src/engine/cards';

const CFG = (n: number): TableConfig => ({ format: 'cash', numPlayers: n, sb: 1, bb: 2, ante: 0, anteType: 'none' });
const cards = (s: string): Card[] => s.trim().split(/\s+/).map(parseCard);

/** Everyone calls or checks until the hand is over. */
function callDown(h: HandState): HandState {
  while (!h.complete && h.toAct >= 0) {
    const la = legalActions(h)!;
    h = applyAction(h, { type: la.canCheck ? 'check' : 'call' });
  }
  return h;
}

describe('straddle', () => {
  it('under the gun puts in two big blinds, the next raise is to at least four, and the straddler acts last preflop', () => {
    const h = newHand({ config: CFG(4), stacks: [200, 200, 200, 200], heroIndex: 0, holes: [], straddle: true });
    expect(h.straddle).toBe(4);
    expect(h.history.map((r) => r.type)).toEqual(['post-sb', 'post-bb', 'post-straddle']);
    expect(h.currentBet).toBe(4);
    // first to act is the player after the straddler
    expect(h.toAct).toBe(1);
    expect(legalActions(h)).toMatchObject({ toCall: 4, minTo: 8 });
    // everyone calls round to the straddler, who still has the option
    let s = h;
    for (let k = 0; k < 3; k++) s = applyAction(s, { type: 'call' });
    expect(s.street).toBe('preflop');
    expect(s.toAct).toBe(0);
    expect(legalActions(s)).toMatchObject({ canCheck: true, canRaise: true });
    s = applyAction(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(totalChips(s)).toBe(800);
  });

  it('is skipped heads-up, and for a stack too short to post it', () => {
    expect(newHand({ config: CFG(2), stacks: [200, 200], heroIndex: 0, holes: [], straddle: true }).straddle).toBeUndefined();
    expect(newHand({ config: CFG(3), stacks: [4, 200, 200], heroIndex: 0, holes: [], straddle: true }).straddle).toBeUndefined();
  });

  it('replays exactly', () => {
    const h = callDown(newHand({ config: CFG(4), stacks: [200, 200, 200, 200], heroIndex: 0, holes: [cards('As Ah'), cards('Ks Kh'), cards('Qs Qh'), cards('Js Jh')], straddle: true }));
    expect(buildTimeline(h)).not.toBeNull();
  });
});

describe('double board', () => {
  it('deals two boards every street, and each board wins half of the pot', () => {
    // deck order: flop 1, flop 2, turn 1, turn 2, river 1, river 2
    const deck = cards('2c 7d 9h  As Ad 3c  8s  Ks  4d  5h');
    const h0 = newHand({
      config: CFG(2),
      stacks: [100, 100],
      heroIndex: 0,
      holes: [cards('Ah Kh'), cards('Qc Qd')],
      deckOrder: deck,
      doubleBoard: true,
    });
    const h = callDown(h0);
    expect(h.board).toEqual(cards('2c 7d 9h 8s 4d'));
    expect(h.board2).toEqual(cards('As Ad 3c Ks 5h'));
    // board 1: queens beat ace-king; board 2: aces full of kings for ace-king
    const r = h.result!;
    expect(r.pots.map((p) => [p.board, p.amount, p.winners])).toEqual([
      [0, 2, [1]],
      [1, 2, [0]],
    ]);
    expect(r.net).toEqual({ 0: 0, 1: 0 });
    expect(totalChips(h)).toBe(200);
    expect(buildTimeline(h)).not.toBeNull();
  });

  it('a hand won by a fold is not split', () => {
    const h = applyAction(newHand({ config: CFG(2), stacks: [100, 100], heroIndex: 0, holes: [], doubleBoard: true }), { type: 'fold' });
    expect(h.result!.pots).toHaveLength(1);
    expect(h.result!.pots[0].board).toBeUndefined();
  });
});

describe('run it twice', () => {
  const allIn = () => {
    // heads-up: the button shoves, the big blind calls
    const deck = cards('2c 7d 9h 8s 4d  As Ad Ks 5h 3c');
    let h = newHand({ config: CFG(2), stacks: [100, 100], heroIndex: 0, holes: [cards('Ah Kh'), cards('Qc Qd')], deckOrder: deck, holdRunout: true });
    h = applyAction(h, { type: 'allin' });
    h = applyAction(h, { type: 'call' });
    return h;
  };

  it('stops before running out the board, so the players can choose', () => {
    const h = allIn();
    expect(h.runoutPending).toBe(true);
    expect(h.complete).toBe(false);
    expect(h.board).toEqual([]);
    expect(legalActions(h)).toBeNull();
  });

  it('once: the board runs out as usual', () => {
    const h = runOut(allIn(), 1);
    expect(h.complete).toBe(true);
    expect(h.board2).toBeUndefined();
    expect(h.board).toEqual(cards('2c 7d 9h 8s 4d'));
    expect(h.result!.net[1]).toBe(100);
  });

  it('twice: a second run from the next cards, and each run wins half', () => {
    const h = runOut(allIn(), 2);
    expect(h.runs).toBe(2);
    expect(h.board).toEqual(cards('2c 7d 9h 8s 4d'));
    expect(h.board2).toEqual(cards('As Ad Ks 5h 3c'));
    expect(h.result!.pots.map((p) => [p.board, p.amount, p.winners])).toEqual([
      [0, 100, [1]],
      [1, 100, [0]],
    ]);
    expect(h.result!.net).toEqual({ 0: 0, 1: 0 });
    expect(totalChips(h)).toBe(200);
    expect(buildTimeline(h)).not.toBeNull();
  });

  it('cards already out are shared by both runs', () => {
    const deck = cards('2c 7d 9h  Kc 4d  As Ad');
    let h = newHand({ config: CFG(2), stacks: [100, 100], heroIndex: 0, holes: [cards('Ah Kh'), cards('Qc Qd')], deckOrder: deck, holdRunout: true });
    h = applyAction(h, { type: 'call' });
    h = applyAction(h, { type: 'check' });
    // on the flop: all-in and call
    h = applyAction(h, { type: 'allin' });
    h = applyAction(h, { type: 'call' });
    expect(h.runoutPending).toBe(true);
    h = runOut(h, 2);
    expect(h.board).toEqual(cards('2c 7d 9h Kc 4d'));
    expect(h.board2).toEqual(cards('2c 7d 9h As Ad'));
    expect(buildTimeline(h)).not.toBeNull();
  });

  it('an odd chip goes to the first run', () => {
    let h = newHand({ config: CFG(3), stacks: [101, 100, 100], heroIndex: 0, holes: [cards('Ah Kh'), cards('2c 3d'), cards('Qc Qd')], holdRunout: true });
    h = applyAction(h, { type: 'allin' });
    h = applyAction(h, { type: 'fold' });
    h = applyAction(h, { type: 'call' });
    h = runOut(h, 2);
    const contested = h.result!.pots.filter((p) => p.eligible.length > 1);
    expect(contested[0].amount - contested[1].amount).toBe(1);
    expect(totalChips(h)).toBe(301);
  });

  it('without holdRunout nothing changes: the board runs out at once', () => {
    let h = newHand({ config: CFG(2), stacks: [100, 100], heroIndex: 0, holes: [cards('Ah Kh'), cards('Qc Qd')] });
    h = applyAction(h, { type: 'allin' });
    h = applyAction(h, { type: 'call' });
    expect(h.complete).toBe(true);
    expect(h.board).toHaveLength(5);
  });
});
