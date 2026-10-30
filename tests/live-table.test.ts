import { describe, it, expect } from 'vitest';
import { LiveTable, START_STACK, TURN_MS, NEXT_HAND_MS, RECONNECT_MS, MAX_SEATS, isPublicTable, tableLabel } from '../src/multiplayer/table';
import { totalChips } from '../src/engine/rules';

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
    expect(t.handle(n, { type: 'sit', name: n })).toBeNull();
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
    expect(t.handle('late', { type: 'sit', name: 'x' })).toMatch(/full/);
    t.handle('p0', { type: 'sit', name: '   a   very long name indeed  ' });
    expect(t.seats[0].name).toBe('a very long');
    t.handle('p1', { type: 'sit', name: 42 });
    expect(t.seats[1].name).toBe('Player');
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
    t.handle('bob', { type: 'sit', name: 'Bob' });
    expect(t.nextHandAt).not.toBeNull();
    runTimer(t, clock);
    expect(t.inHand()).toBe(true);
    expect(t.summary()).toEqual({ players: 2, maxSeats: MAX_SEATS, playing: true });
  });

  it('private tables wait for someone to press Deal', () => {
    const { t } = setup(['ann', 'bob']);
    expect(t.nextHandAt).toBeNull();
    expect(t.viewFor('ann').autoDeal).toBe(false);
  });

  it('are named for the lobby', () => {
    expect(isPublicTable('public-2')).toBe(true);
    expect(isPublicTable('k7m2qp')).toBe(false);
    expect(tableLabel('public-2')).toBe('Public table 2');
    expect(tableLabel('k7m2qp')).toBe('Table k7m2qp');
  });
});
