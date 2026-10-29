import { describe, it, expect } from 'vitest';
import { parseCards, createRng, deckWithout } from '../src/engine/cards';
import {
  newHand,
  applyAction,
  legalActions,
  validateAction,
  potSize,
  totalChips,
  TableConfig,
  HandState,
  potFractionTo,
  computePots,
  PlayerAction,
} from '../src/engine/rules';

const cash6: TableConfig = { format: 'cash', numPlayers: 6, sb: 50, bb: 100, ante: 0, anteType: 'none' };
const hu: TableConfig = { format: 'cash', numPlayers: 2, sb: 50, bb: 100, ante: 0, anteType: 'none' };

function hand(config: TableConfig, stacks: number[], holes: string[], board?: string) {
  const h = holes.map((x) => (x ? parseCards(x) : []));
  const known = h.flat();
  const b = board ? parseCards(board) : [];
  const deck = [...b, ...deckWithout([...known, ...b])];
  return newHand({ config, stacks, heroIndex: 0, holes: h, deckOrder: deck });
}

const act = (s: HandState, ...as: PlayerAction[]) => as.reduce((st, a) => applyAction(st, a), s);

describe('blinds and order', () => {
  it('6-max: UTG acts first preflop, SB first postflop', () => {
    const s = hand(cash6, Array(6).fill(10000), ['AsKs', 'QdQc', '2c3c', '4d5d', '6h7h', '8s9s']);
    expect(potSize(s)).toBe(150);
    expect(s.toAct).toBe(0);
    const s2 = act(s, { type: 'raise', to: 250 }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'call' });
    expect(s2.street).toBe('flop');
    expect(s2.toAct).toBe(5); // BB first postflop (SB folded)
    expect(s2.board.length).toBe(3);
  });
  it('heads-up: button posts SB and acts first preflop, last postflop', () => {
    const s = hand(hu, [10000, 10000], ['AsKs', 'QdQc']);
    expect(s.players[0].streetCommitted).toBe(50);
    expect(s.players[1].streetCommitted).toBe(100);
    expect(s.toAct).toBe(0);
    const s2 = act(s, { type: 'call' });
    expect(s2.toAct).toBe(1); // BB option
    const la = legalActions(s2)!;
    expect(la.canCheck).toBe(true);
    expect(la.canRaise).toBe(true);
    const s3 = act(s2, { type: 'check' });
    expect(s3.street).toBe('flop');
    expect(s3.toAct).toBe(1); // BB acts first postflop heads-up
  });
  it('big blind gets the option after limps', () => {
    const s = hand(cash6, Array(6).fill(10000), ['', '', '', '', '', '']);
    const s2 = act(s, { type: 'call' }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'call' });
    expect(s2.toAct).toBe(5);
    const la = legalActions(s2)!;
    expect(la.canCheck).toBe(true);
    expect(la.canRaise).toBe(true);
    expect(la.minTo).toBe(200);
  });
  it('antes: each player and big-blind ante', () => {
    const t: TableConfig = { format: 'tournament', numPlayers: 6, sb: 50, bb: 100, ante: 12, anteType: 'each' };
    const s = hand(t, Array(6).fill(5000), ['', '', '', '', '', '']);
    expect(potSize(s)).toBe(150 + 72);
    expect(s.currentBet).toBe(100);
    const t2: TableConfig = { ...t, anteType: 'bb', ante: 100 };
    const s2 = hand(t2, Array(6).fill(5000), ['', '', '', '', '', '']);
    expect(potSize(s2)).toBe(250);
    expect(s2.players[5].stack).toBe(4800);
    expect(s2.currentBet).toBe(100); // the ante does not count toward the BB's bet
  });
});

describe('legal actions and minimum raises', () => {
  it('min open raise is 2bb; min re-raise uses last raise size', () => {
    const s = hand(cash6, Array(6).fill(10000), ['', '', '', '', '', '']);
    expect(legalActions(s)!.minTo).toBe(200);
    const s2 = act(s, { type: 'raise', to: 300 }); // raise by 200
    const la = legalActions(s2)!;
    expect(la.minTo).toBe(500); // 300 + 200
    expect(validateAction(s2, { type: 'raise', to: 499 })).toMatch(/minimum/);
    expect(validateAction(s2, { type: 'raise', to: 500 })).toBeNull();
  });
  it('cannot check facing a bet, cannot fold when check is free, cannot bet when a bet exists', () => {
    const s = hand(hu, [10000, 10000], ['', '']);
    expect(validateAction(s, { type: 'check' })).not.toBeNull();
    const s2 = act(s, { type: 'call' }, { type: 'check' });
    expect(validateAction(s2, { type: 'fold' })).not.toBeNull();
    expect(validateAction(s2, { type: 'raise', to: 200 })).not.toBeNull();
    const s3 = act(s2, { type: 'bet', to: 100 });
    expect(validateAction(s3, { type: 'bet', to: 300 })).not.toBeNull();
  });
  it('postflop min bet is one big blind; bets cannot exceed the stack', () => {
    const s = act(hand(hu, [10000, 10000], ['', '']), { type: 'call' }, { type: 'check' });
    const la = legalActions(s)!;
    expect(la.minTo).toBe(100);
    expect(la.maxTo).toBe(9900);
    expect(validateAction(s, { type: 'bet', to: 99 })).not.toBeNull();
    expect(validateAction(s, { type: 'bet', to: 9901 })).not.toBeNull();
    expect(validateAction(s, { type: 'bet', to: 9900 })).toBeNull();
  });
  it('non-integer amounts are rejected', () => {
    const s = act(hand(hu, [10000, 10000], ['', '']), { type: 'call' }, { type: 'check' });
    expect(validateAction(s, { type: 'bet', to: 150.5 })).not.toBeNull();
  });
  it('a player who cannot make a full raise may still go all-in (short)', () => {
    const s = hand(hu, [10000, 450], ['', '']);
    const s2 = act(s, { type: 'raise', to: 300 });
    const la = legalActions(s2)!;
    expect(la.canRaise).toBe(true);
    expect(la.shortAllInOnly).toBe(true);
    expect(la.minTo).toBe(450);
    expect(la.maxTo).toBe(450);
  });
  it('short all-in does not reopen raising for a player who already acted', () => {
    // 3-handed: BTN raises to 300, SB calls, BB (short) shoves 400 total (raise by 100 < 200)
    const t: TableConfig = { ...cash6, numPlayers: 3 };
    const s = hand(t, [10000, 10000, 400], ['', '', '']);
    const s2 = act(s, { type: 'raise', to: 300 }, { type: 'call' }, { type: 'allin' });
    expect(s2.players[2].allIn).toBe(true);
    expect(s2.currentBet).toBe(400);
    // BTN acted already and the all-in was not a full raise: only call or fold
    expect(s2.toAct).toBe(0);
    const la = legalActions(s2)!;
    expect(la.canCall).toBe(true);
    expect(la.canRaise).toBe(false);
  });
  it('a full all-in raise does reopen action', () => {
    const t: TableConfig = { ...cash6, numPlayers: 3 };
    const s = hand(t, [10000, 10000, 600], ['', '', '']);
    const s2 = act(s, { type: 'raise', to: 300 }, { type: 'call' }, { type: 'allin' }); // raise by 300 >= 200
    expect(legalActions(s2)!.canRaise).toBe(true);
  });
  it('cumulative short all-ins that total a full raise reopen action (TDA 47)', () => {
    // 4-handed: CO bets... use preflop: CO raises to 300 (raise by 200). BTN short all-in 400 (+100),
    // SB short all-in 500 (+100). Cumulative 500 - 300 = 200 = full raise -> CO may re-raise.
    const t: TableConfig = { ...cash6, numPlayers: 4 };
    const s = hand(t, [10000, 400, 500, 10000], ['', '', '', '']);
    const s2 = act(s, { type: 'raise', to: 300 }, { type: 'allin' }, { type: 'allin' }, { type: 'call' });
    expect(s2.toAct).toBe(0);
    const la = legalActions(s2)!;
    expect(la.canRaise).toBe(true);
    expect(la.minTo).toBe(700); // min increment stays the last full raise (200)
    // one short all-in alone would not reopen
    const s3 = act(hand(t, [10000, 400, 10000, 10000], ['', '', '', '']), { type: 'raise', to: 300 }, { type: 'allin' }, { type: 'fold' }, { type: 'call' });
    expect(s3.toAct).toBe(0);
    expect(legalActions(s3)!.canRaise).toBe(false);
  });
  it('a player who has not yet acted may raise after a short all-in', () => {
    const t: TableConfig = { ...cash6, numPlayers: 3 };
    // BTN shoves short for 150? Use: BTN raise to 300; SB short all-in 400 total; BB has not acted
    const s = hand(t, [10000, 400, 10000], ['', '', '']);
    const s2 = act(s, { type: 'raise', to: 300 }, { type: 'allin' });
    expect(s2.toAct).toBe(2);
    const la = legalActions(s2)!;
    expect(la.canRaise).toBe(true);
    expect(la.minTo).toBe(600); // currentBet 400 + last full raise 200
  });
  it('cannot raise when every opponent is all-in', () => {
    const s = hand(hu, [10000, 2000], ['', '']);
    const s2 = act(s, { type: 'raise', to: 300 }, { type: 'allin' });
    const la = legalActions(s2)!;
    expect(la.canCall).toBe(true);
    expect(la.canRaise).toBe(false);
  });
  it('calling for less than the full amount puts the caller all-in', () => {
    const s = hand(hu, [10000, 1000], ['AsAd', 'KsKd'], '2c7d9hJcQd');
    const s2 = act(s, { type: 'raise', to: 3000 });
    const la = legalActions(s2)!;
    expect(la.toCall).toBe(900);
    const s3 = act(s2, { type: 'call' });
    expect(s3.complete).toBe(true);
    expect(s3.result!.reason).toBe('showdown');
  });
});

describe('pot sizing helper', () => {
  it('bet fraction of pot', () => {
    const s = act(hand(hu, [10000, 10000], ['', '']), { type: 'call' }, { type: 'check' }); // pot 200
    expect(potFractionTo(s, 0.5)).toBe(100);
    expect(potFractionTo(s, 1)).toBe(200);
    expect(potFractionTo(s, 1.5)).toBe(300);
  });
  it('pot-sized raise facing a bet: call then raise by the pot', () => {
    const s = act(hand(hu, [10000, 10000], ['', '']), { type: 'call' }, { type: 'check' }, { type: 'bet', to: 100 });
    // pot 300 (200 + 100 bet), to call 100 -> pot after call 400 -> raise to 100 + 400 = 500
    expect(potFractionTo(s, 1)).toBe(500);
  });
});

describe('showdown, side pots, splits, chip conservation', () => {
  it('split pot when both players play the board', () => {
    const s = hand(hu, [10000, 10000], ['2c3d', '2d3c'], 'AsKsQsJsTs');
    const end = act(s, { type: 'call' }, { type: 'check' }, { type: 'check' }, { type: 'check' }, { type: 'check' }, { type: 'check' }, { type: 'check' }, { type: 'check' });
    expect(end.complete).toBe(true);
    expect(end.result!.pots[0].winners.sort()).toEqual([0, 1]);
    expect(end.players[0].stack).toBe(10000);
    expect(end.players[1].stack).toBe(10000);
  });
  it('odd chip goes to the first seat left of the button', () => {
    // 3 players, pot of 301 split between two: construct with antes
    const t: TableConfig = { format: 'tournament', numPlayers: 3, sb: 50, bb: 100, ante: 1, anteType: 'each' };
    const s = hand(t, [1000, 1000, 1000], ['2c3d', '2d3c', '4h5h'], 'AsKsQsJsTs');
    // everyone checks/calls down: BTN calls, SB calls, BB checks
    let st = act(s, { type: 'call' }, { type: 'call' }, { type: 'check' });
    while (!st.complete) st = applyAction(st, { type: 'check' });
    // all three play the board royal flush -> 303 split three ways = 101 each
    expect(st.result!.pots[0].amount).toBe(303);
    expect(totalChips(st)).toBe(3000);
  });
  it('odd chip with two winners', () => {
    const t: TableConfig = { format: 'tournament', numPlayers: 3, sb: 50, bb: 100, ante: 1, anteType: 'each' };
    // BTN folds; SB and BB split 2 antes(3) + 200 = 203; first left of button = SB gets odd chip
    const s = hand(t, [1000, 1000, 1000], ['7c8d', '2d3c', '2h3s'], 'AsKsQsJsTs');
    let st = act(s, { type: 'fold' }, { type: 'call' }, { type: 'check' });
    while (!st.complete) st = applyAction(st, { type: 'check' });
    const pot = st.result!.pots[0];
    expect(pot.amount).toBe(203);
    expect(pot.shares[1]).toBe(102);
    expect(pot.shares[2]).toBe(101);
    expect(totalChips(st)).toBe(3000);
  });
  it('side pots: short stack wins main pot, bigger stack wins side pot', () => {
    const t: TableConfig = { ...cash6, numPlayers: 3 };
    // BTN AA (10000), SB KK (10000), BB 72o short 1000 with best hand via board 7 7 2
    const s = hand(t, [10000, 10000, 1000], ['AsAd', 'KsKd', '7c2d'], '7h7d2s9cJh');
    let st = act(s, { type: 'raise', to: 1000 }, { type: 'raise', to: 3000 }, { type: 'call' }, { type: 'call' });
    expect(st.street).toBe('flop');
    st = act(st, { type: 'bet', to: 2000 }, { type: 'call' });
    while (!st.complete) st = applyAction(st, { type: 'check' });
    const pots = computePots(st);
    expect(pots.length).toBe(2);
    expect(pots[0].amount).toBe(3000);
    expect(st.result!.pots[0].winners).toEqual([2]); // full house 7s full
    expect(st.result!.pots[1].winners).toEqual([0]); // AA beats KK for side pot
    expect(st.players[2].stack).toBe(3000);
    expect(st.players[0].stack).toBe(10000 - 5000 + 8000);
    expect(totalChips(st)).toBe(21000);
  });
  it('uncalled excess of an all-in is returned via the side-pot structure', () => {
    const s = hand(hu, [10000, 2000], ['AsAd', 'KsKd'], '2c7d9hJcQd');
    const st = act(s, { type: 'allin' }, { type: 'call' });
    expect(st.complete).toBe(true);
    // BB calls 2000 total; BTN's 8000 excess is a pot only BTN is eligible for
    expect(st.players[0].stack).toBe(12000);
    expect(st.players[1].stack).toBe(0);
    expect(totalChips(st)).toBe(12000);
  });
  it('hand ends immediately when everyone folds', () => {
    const s = hand(cash6, Array(6).fill(10000), ['', '', '', '', '', '']);
    const st = act(s, { type: 'raise', to: 250 }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' });
    expect(st.complete).toBe(true);
    expect(st.result!.reason).toBe('fold');
    expect(st.players[0].stack).toBe(10150);
    expect(st.board.length).toBe(0);
  });
  it('runs out the board when all players are all-in', () => {
    const s = hand(hu, [5000, 5000], ['AsAd', 'KsKd'], '2c7d9hJcQd');
    const st = act(s, { type: 'allin' }, { type: 'call' });
    expect(st.board.length).toBe(5);
    expect(st.result!.reason).toBe('showdown');
  });
  it('chip conservation over thousands of random legal hands', () => {
    const rng = createRng(2024);
    for (let trial = 0; trial < 1500; trial++) {
      const n = rng.pick([2, 3, 6, 9]);
      const cfg: TableConfig = { format: 'cash', numPlayers: n, sb: 50, bb: 100, ante: rng.int(2) ? 10 : 0, anteType: 'each' };
      const deck = rng.shuffle(Array.from({ length: 52 }, (_, i) => i));
      const holes = Array.from({ length: n }, (_, i) => [deck[2 * i], deck[2 * i + 1]]);
      const stacks = Array.from({ length: n }, () => 200 + rng.int(20000));
      let s = newHand({ config: cfg, stacks, heroIndex: 0, holes, deckOrder: deck.slice(2 * n) });
      const total = totalChips(s);
      let guard = 0;
      while (!s.complete && guard++ < 200) {
        const la = legalActions(s)!;
        const opts: PlayerAction[] = [];
        if (la.canFold) opts.push({ type: 'fold' });
        if (la.canCheck) opts.push({ type: 'check' });
        if (la.canCall) opts.push({ type: 'call' }, { type: 'call' });
        if (la.canBet) opts.push({ type: 'bet', to: la.minTo + rng.int(la.maxTo - la.minTo + 1) });
        if (la.canRaise) opts.push({ type: 'raise', to: la.minTo + rng.int(la.maxTo - la.minTo + 1) });
        opts.push({ type: 'allin' });
        s = applyAction(s, rng.pick(opts));
        expect(totalChips(s)).toBe(total);
      }
      expect(s.complete).toBe(true);
      const final = s.players.reduce((a, p) => a + p.stack, 0);
      expect(final).toBe(total);
      // cards unique across board and holes
      const all = [...s.board, ...s.players.flatMap((p) => p.hole)];
      expect(new Set(all).size).toBe(all.length);
    }
  });
});
