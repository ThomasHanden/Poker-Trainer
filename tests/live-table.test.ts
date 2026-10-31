import { describe, it, expect } from 'vitest';
import { LiveTable, TURN_MS, NEXT_HAND_MS, RECONNECT_MS, MAX_SEATS, LOW_STAKES, HIGH_STAKES, isPublicTable, tableLabel, stakesFor, buyInFor, checkBuyIn, fmtChips, cleanName, type Cashout } from '../src/multiplayer/table';
import { DAILY, refresh, withdraw, deposit, nextRefill, playerId } from '../src/multiplayer/bank';
import { totalChips } from '../src/engine/rules';

/** a full 0.5/1 buy-in: 100 big blinds */
const START_STACK = buyInFor(LOW_STAKES).max;

function setup(names: string[], autoDeal = false) {
  let now = 1_000_000;
  const clock = {
    advance(ms: number) {
      now += ms;
    },
  };
  const t = new LiveTable({ autoDeal, clock: () => now });
  for (const n of names) {
    t.setOnline(n, true);
    expect(t.sit(n, n, START_STACK)).toBeNull();
  }
  return { t, clock };
}

const toAct = (t: LiveTable) => t.order[t.hand!.toAct];
const callOrCheck = (t: LiveTable) => {
  const h = t.hand!;
  return t.act(toAct(t), { type: h.players[h.toAct].streetCommitted < h.currentBet ? 'call' : 'check' });
};
const playOut = (t: LiveTable) => {
  while (t.inHand()) expect(callOrCheck(t)).toBeNull();
};
/** Advance to the next deadline and run it, the way the server's timer does. */
const runTimer = (t: LiveTable, clock: { advance(ms: number): void }) => {
  const at = t.nextDeadline();
  expect(at).not.toBeNull();
  clock.advance(at! - t.viewFor('x').now);
  t.tick();
};
const ids = (t: LiveTable) => t.seats.map((s) => s.id);

describe('live table: dealing and privacy', () => {
  it('needs two players to deal', () => {
    const { t } = setup(['ann']);
    expect(t.handle('ann', { type: 'start' })).toMatch(/two players/);
    expect(t.hand).toBeNull();
  });

  it('only shows each player their own cards and never the deck', () => {
    const { t } = setup(['ann', 'bob', 'cat']);
    expect(t.start()).toBeNull();
    for (const id of ['ann', 'bob', 'cat']) {
      const v = t.viewFor(id);
      expect(v.hand!.deck).toEqual([]);
      const mine = v.hand!.players.filter((p) => p.hole.length === 2);
      expect(mine).toHaveLength(1);
      expect(mine[0].isHero).toBe(true);
      expect(v.me).toBe(t.order.indexOf(id));
    }
    const watcher = t.viewFor('someone-else');
    expect(watcher.me).toBe(-1);
    expect(watcher.hand!.players.every((p) => p.hole.length === 0)).toBe(true);
  });

  it('rejects out-of-turn and malformed actions', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    const waiting = t.order.find((id) => id !== toAct(t))!;
    expect(t.handle(waiting, { type: 'action', action: { type: 'call' } })).toMatch(/not your turn/);
    expect(t.handle(toAct(t), { type: 'action', action: { type: 'steal' } })).toBe('Bad action');
    expect(t.handle(toAct(t), { type: 'action', action: { type: 'raise', to: 2.5 } })).toBe('Bad action');
    expect(t.handle(toAct(t), { type: 'action', action: { type: 'raise', to: 99999 } })).toMatch(/more than your stack/);
  });

  it('pays out, keeps chips, moves the button and deals again', () => {
    const { t, clock } = setup(['ann', 'bob', 'cat']);
    t.start();
    const firstButton = t.order[t.hand!.buttonIndex];
    playOut(t);
    expect(t.seats.reduce((a, s) => a + s.stack, 0)).toBe(3 * START_STACK);
    expect(t.viewFor('ann').hand!.players.filter((p) => p.hole.length === 2).length).toBe(3); // showdown reveals
    expect(t.nextHandAt).not.toBeNull();
    clock.advance(NEXT_HAND_MS);
    expect(t.tick()).toBe(true);
    expect(t.handNo).toBe(2);
    expect(t.order[t.hand!.buttonIndex]).not.toBe(firstButton);
    expect(totalChips(t.hand!)).toBe(3 * START_STACK);
  });

  it('seats at most the table size and cleans up names', () => {
    const { t } = setup(Array.from({ length: MAX_SEATS }, (_, i) => `p${i}`));
    expect(t.sit('late', 'x', START_STACK)).toMatch(/full/);
    t.sit('p0', cleanName('   a   very long name indeed  '));
    expect(t.seats[0].name).toBe('a very long');
    expect(t.seats[0].stack).toBe(START_STACK); // renaming does not buy in again
    expect(cleanName(42)).toBe('Player');
    expect(t.sit('new', 'x')).toMatch(/full|chips/);
  });
});

describe('live table: timeouts', () => {
  it('folds for a player who runs out of time facing a bet', () => {
    const { t, clock } = setup(['ann', 'bob']);
    t.start();
    const slow = toAct(t);
    clock.advance(TURN_MS - 1);
    expect(t.tick()).toBe(false);
    clock.advance(1);
    expect(t.tick()).toBe(true);
    // heads-up preflop the button faces the big blind, so a timeout folds
    expect(t.hand!.complete).toBe(true);
    expect(t.hand!.players[t.order.indexOf(slow)].folded).toBe(true);
  });

  it('stands up a player after two timeouts in a row, but not if they act in between', () => {
    const { t, clock } = setup(['ann', 'bob', 'cat']);
    const slow = 'bob';
    const untilSlow = () => {
      while (t.inHand() && toAct(t) !== slow) expect(callOrCheck(t)).toBeNull();
    };
    t.start();
    untilSlow();
    runTimer(t, clock); // timeout 1
    playOut(t);
    runTimer(t, clock); // next deal
    untilSlow();
    const h = t.hand!;
    const type = h.players[h.toAct].streetCommitted < h.currentBet ? 'call' : 'check';
    expect(t.handle(slow, { type: 'action', action: { type } })).toBeNull(); // acting resets the count
    playOut(t);
    runTimer(t, clock);
    untilSlow();
    runTimer(t, clock); // timeout 1 again
    playOut(t);
    expect(ids(t)).toContain(slow);
    runTimer(t, clock);
    untilSlow();
    runTimer(t, clock); // timeout 2 in a row
    expect(t.viewFor('ann').seats.find((s) => s.id === slow)!.leaving).toBe(true);
    playOut(t);
    expect(ids(t)).not.toContain(slow);
  });
});

describe('live table: leaving (heads-up)', () => {
  it('Leave between hands frees the seat and stops the dealing', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    playOut(t);
    expect(t.nextHandAt).not.toBeNull();
    t.handle('bob', { type: 'leave' });
    expect(ids(t)).toEqual(['ann']);
    expect(t.nextHandAt).toBeNull();
    expect(t.nextDeadline()).toBeNull();
  });

  it('Leave on your turn acts at once and you stand up when the hand ends', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    const leaver = toAct(t); // button, facing the big blind
    t.handle(leaver, { type: 'leave' });
    expect(t.hand!.complete).toBe(true); // folded straight away
    expect(ids(t)).toEqual([t.order.find((id) => id !== leaver)]);
    expect(t.nextHandAt).toBeNull();
  });

  it('Leave while it is the other player\'s turn ends the hand at once', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    const stayer = toAct(t);
    const leaver = t.order.find((id) => id !== stayer)!;
    t.handle(leaver, { type: 'leave' });
    expect(t.hand!.complete).toBe(true);
    expect(t.hand!.players[t.order.indexOf(leaver)].folded).toBe(true);
    expect(t.hand!.result!.reason).toBe('fold');
    expect(ids(t)).toEqual([stayer]);
    expect(t.nextHandAt).toBeNull();
    expect(t.nextDeadline()).toBeNull();
    expect(t.seats[0].stack).toBe(START_STACK + 2); // won the big blind
  });

  it('Leave when checking is free still folds (no playing the hand out against an empty seat)', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    expect(callOrCheck(t)).toBeNull(); // button limps
    expect(callOrCheck(t)).toBeNull(); // big blind checks: flop
    expect(t.hand!.street).toBe('flop');
    const leaver = toAct(t);
    t.handle(leaver, { type: 'leave' });
    expect(t.hand!.complete).toBe(true);
    expect(t.hand!.players[t.order.indexOf(leaver)].folded).toBe(true);
  });

  it('closing the tab mid-hand: the hand finishes and the seat is cleared, so the table is not stuck', () => {
    const { t, clock } = setup(['ann', 'bob']);
    t.start();
    t.setOnline('bob', false);
    for (let k = 0; k < 20 && t.inHand(); k++) {
      if (toAct(t) === 'bob') runTimer(t, clock);
      else expect(callOrCheck(t)).toBeNull();
    }
    expect(t.hand!.complete).toBe(true);
    expect(t.nextHandAt).toBeNull(); // nobody to play against
    runTimer(t, clock); // the held seat expires
    expect(ids(t)).toEqual(['ann']);
    expect(t.nextDeadline()).toBeNull();
  });

  it('a quick reload keeps the seat and the game goes on', () => {
    const { t, clock } = setup(['ann', 'bob']);
    t.start();
    playOut(t);
    t.setOnline('bob', false);
    expect(t.nextHandAt).toBeNull();
    clock.advance(1000);
    t.setOnline('bob', true);
    expect(t.nextHandAt).not.toBeNull();
    runTimer(t, clock);
    expect(t.hand!.players).toHaveLength(2);
    expect(t.handNo).toBe(2);
  });

  it('a dropped player still has their seat if they come back within the grace period', () => {
    const { t, clock } = setup(['ann', 'bob']);
    t.setOnline('bob', false);
    clock.advance(RECONNECT_MS - 1);
    expect(t.tick()).toBe(false);
    t.setOnline('bob', true);
    clock.advance(RECONNECT_MS);
    t.tick();
    expect(ids(t)).toEqual(['ann', 'bob']);
  });
});

describe('live table: three players', () => {
  it('a player who leaves out of turn is folded and the other two play on', () => {
    const { t } = setup(['ann', 'bob', 'cat']);
    t.start();
    const actor = toAct(t);
    const leaver = t.order.find((id) => id !== actor)!;
    t.handle(leaver, { type: 'leave' });
    expect(ids(t)).not.toContain(leaver);
    expect(t.inHand()).toBe(true);
    expect(toAct(t)).toBe(actor);
    playOut(t);
    expect(t.hand!.players[t.order.indexOf(leaver)].folded).toBe(true);
    expect(t.nextHandAt).not.toBeNull();
  });

  it('an all-in player who leaves keeps their hand to showdown', () => {
    const { t } = setup(['ann', 'bob', 'cat']);
    t.start();
    const shover = toAct(t);
    expect(t.act(shover, { type: 'allin' })).toBeNull();
    t.handle(shover, { type: 'leave' });
    expect(t.hand!.players[t.order.indexOf(shover)].folded).toBe(false);
    expect(t.viewFor('x').seats.find((s) => s.id === shover)!.leaving).toBe(true);
    playOut(t);
    expect(t.hand!.result!.showdownPlayers).toContain(t.order.indexOf(shover));
    expect(ids(t)).not.toContain(shover);
  });

  it('a folded player who leaves is removed at once and the others play on', () => {
    const { t } = setup(['ann', 'bob', 'cat']);
    t.start();
    const first = toAct(t);
    expect(t.act(first, { type: 'fold' })).toBeNull();
    t.handle(first, { type: 'leave' });
    expect(ids(t)).not.toContain(first);
    playOut(t);
    expect(t.seats.reduce((a, s) => a + s.stack, 0)).toBe(2 * START_STACK); // the leaver took their chips with them
    expect(t.nextHandAt).not.toBeNull();
  });
});

describe('public tables', () => {
  it('deal on their own once two players sit down', () => {
    const { t, clock } = setup(['ann'], true);
    expect(t.nextHandAt).toBeNull();
    t.setOnline('bob', true);
    t.sit('bob', 'Bob', START_STACK);
    expect(t.nextHandAt).not.toBeNull();
    runTimer(t, clock);
    expect(t.inHand()).toBe(true);
    expect(t.summary()).toEqual({ players: 2, maxSeats: MAX_SEATS, playing: true });
  });

  it('can be set to wait for someone to press Deal instead', () => {
    const { t } = setup(['ann', 'bob']);
    expect(t.nextHandAt).toBeNull();
    expect(t.viewFor('ann').autoDeal).toBe(false);
  });

  it('are named for the lobby, half at 0.5/1 and half at 1/2', () => {
    expect(isPublicTable('public-2')).toBe(true);
    expect(isPublicTable('k7m2qp')).toBe(false);
    expect(tableLabel('public-2')).toBe('0.5/1 NLH #2');
    expect(tableLabel('public-3')).toBe('1/2 NLH #3');
    expect(tableLabel('k7m2qp')).toBe('0.5/1 NLH · k7m2qp');
    expect(tableLabel('hi-k7m2qp')).toBe('1/2 NLH · k7m2qp');
    expect(stakesFor('public-1')).toBe(LOW_STAKES);
    expect(stakesFor('public-4')).toBe(HIGH_STAKES);
  });
});

describe('chips and buy-ins', () => {
  it('shows amounts as chips, half-chips included', () => {
    expect(fmtChips(1)).toBe('0.5');
    expect(fmtChips(2)).toBe('1');
    expect(fmtChips(2500)).toBe('1,250');
    expect(buyInFor(LOW_STAKES)).toEqual({ min: 60, max: 300 }); // 30 to 150 chips
    expect(buyInFor(HIGH_STAKES)).toEqual({ min: 120, max: 600 }); // 60 to 300 chips
  });

  it('only accepts a buy-in of whole chips inside the table range', () => {
    expect(checkBuyIn(LOW_STAKES, 60)).toBe(60);
    expect(checkBuyIn(LOW_STAKES, 150)).toBe(150);
    expect(checkBuyIn(LOW_STAKES, 300)).toBe(300);
    expect(checkBuyIn(LOW_STAKES, 58)).toBeNull(); // below the minimum
    expect(checkBuyIn(LOW_STAKES, 302)).toBeNull(); // above the maximum
    expect(checkBuyIn(LOW_STAKES, 151)).toBeNull(); // half a chip
    expect(checkBuyIn(LOW_STAKES, 100.5)).toBeNull();
    expect(checkBuyIn(LOW_STAKES, '200')).toBeNull();
    expect(checkBuyIn(HIGH_STAKES, 120)).toBe(120);
    expect(checkBuyIn(HIGH_STAKES, 100)).toBeNull();
  });

  it('a 1/2 table posts 1 and 2 chip blinds', () => {
    const t = new LiveTable({ stakes: HIGH_STAKES });
    t.sit('ann', 'Ann', 400);
    t.sit('bob', 'Bob', 400);
    t.setOnline('ann', true);
    t.setOnline('bob', true);
    t.start();
    expect(t.hand!.config.sb).toBe(2);
    expect(t.hand!.config.bb).toBe(4);
  });

  it('every chip that leaves the table is paid out, and none are made up', () => {
    const { t, clock } = setup(['ann', 'bob', 'cat']);
    const paid: Cashout[] = [];
    const drain = () => paid.push(...t.takeCashouts());
    for (let hand = 0; hand < 3; hand++) {
      t.start();
      // someone shoves, everyone calls: stacks move around
      expect(t.act(toAct(t), { type: 'allin' })).toBeNull();
      playOut(t);
      drain();
      clock.advance(NEXT_HAND_MS);
      if (t.seats.length < 2) break;
    }
    for (const s of [...t.seats]) t.leave(s.id);
    drain();
    expect(t.seats).toHaveLength(0);
    expect(paid.reduce((a, c) => a + c.amount, 0)).toBe(3 * START_STACK);
  });

  it('a player who loses their stack is stood up instead of getting a free one', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    const shover = toAct(t);
    expect(t.act(shover, { type: 'allin' })).toBeNull();
    expect(callOrCheck(t)).toBeNull();
    expect(t.hand!.complete).toBe(true);
    const loser = t.hand!.players.find((p) => p.stack === 0);
    if (!loser) return; // a split pot: nobody busted this time
    expect(ids(t)).not.toContain(t.order[loser.index]);
    expect(t.takeCashouts().filter((c) => c.id === t.order[loser.index])).toEqual([]); // nothing to pay out
  });

  it('a folded player who leaves mid-hand takes only what is left in front of them', () => {
    const { t } = setup(['ann', 'bob', 'cat']);
    t.start();
    const sb = t.order[t.hand!.players.length - 2]; // small blind has 0.5 in the pot
    while (toAct(t) !== sb) expect(callOrCheck(t)).toBeNull();
    expect(t.act(sb, { type: 'fold' })).toBeNull();
    t.leave(sb);
    expect(t.takeCashouts()).toEqual([{ id: sb, amount: START_STACK - LOW_STAKES.sb }]);
  });
});

describe('daily bank', () => {
  it('starts everyone with the daily amount and tops it up each day, keeping winnings', () => {
    const a = refresh(undefined, '2026-10-30');
    expect(a.balance).toBe(DAILY);
    expect(refresh({ balance: 50, day: '2026-10-30' }, '2026-10-30').balance).toBe(50); // same day: no top-up
    expect(refresh({ balance: 50, day: '2026-10-30' }, '2026-10-31').balance).toBe(DAILY);
    expect(refresh({ balance: DAILY * 3, day: '2026-10-30' }, '2026-10-31').balance).toBe(DAILY * 3);
  });

  it('buys in for up to the full amount, the rest of the balance down to the minimum, or not at all', () => {
    const acc = { balance: 300, day: 'd' };
    expect(withdraw(acc, 200, 40)).toEqual({ acc: { balance: 100, day: 'd' }, amount: 200 });
    expect(withdraw({ ...acc, balance: 120 }, 200, 40).amount).toBe(120);
    expect(withdraw({ ...acc, balance: 30 }, 200, 40)).toEqual({ acc: { ...acc, balance: 30 }, amount: 0 });
    expect(deposit(acc, 55).balance).toBe(355);
  });

  it('refills at the next UTC midnight', () => {
    expect(new Date(nextRefill(Date.UTC(2026, 9, 30, 15, 0))).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('identifies players by a hash of their secret key, not the key itself', async () => {
    const id = await playerId('a-secret-key-that-is-long-enough');
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(id).toBe(await playerId('a-secret-key-that-is-long-enough'));
    expect(id).not.toBe(await playerId('another-secret-key-long-enough'));
  });
});

describe('picking a seat', () => {
  const table = () => {
    let now = 1_000_000;
    const t = new LiveTable({ clock: () => now });
    return { t, advance: (ms: number) => (now += ms) };
  };

  it('a player sits in the seat they pick, and a taken seat is refused', () => {
    const { t } = table();
    expect(t.sit('ann', 'Ann', START_STACK, 4)).toBeNull();
    expect(t.viewFor('x').seats).toEqual([expect.objectContaining({ id: 'ann', seat: 4 })]);
    expect(t.sit('bob', 'Bob', START_STACK, 4)).toMatch(/took that seat/);
    expect(t.seatProblem(9)).toBe('Pick a seat');
    expect(t.seatProblem(2.5)).toBe('Pick a seat');
    expect(t.sit('bob', 'Bob', START_STACK, 1)).toBeNull();
    expect(t.seats.map((s) => s.seat)).toEqual([1, 4]); // kept in clockwise order
  });

  it('sitting alone waits; the first hand deals itself once a second player sits down', () => {
    const { t, advance } = table();
    t.sit('ann', 'Ann', START_STACK, 3);
    t.setOnline('ann', true);
    expect(t.nextHandAt).toBeNull();
    t.sit('bob', 'Bob', START_STACK, 0);
    t.setOnline('bob', true);
    expect(t.nextHandAt).not.toBeNull();
    advance(NEXT_HAND_MS);
    t.tick();
    expect(t.inHand()).toBe(true);
    const v = t.viewFor('ann');
    expect(v.handSeats.slice().sort()).toEqual([0, 3]);
    expect(v.handIds[v.me]).toBe('ann');
    expect(v.handSeats[v.me]).toBe(3);
  });

  it('the button moves clockwise round the occupied seats, skipping empty ones', () => {
    const { t, advance } = table();
    for (const [id, seat] of [['a', 0], ['b', 2], ['c', 5]] as const) {
      t.sit(id, id, START_STACK, seat);
      t.setOnline(id, true);
    }
    const buttons: number[] = [];
    for (let k = 0; k < 4; k++) {
      advance(NEXT_HAND_MS);
      t.tick();
      buttons.push(t.viewFor('a').handSeats[t.hand!.buttonIndex]);
      while (t.inHand()) t.act(t.order[t.hand!.toAct], { type: 'fold' });
    }
    expect(buttons).toEqual([0, 2, 5, 0]);
  });
});
