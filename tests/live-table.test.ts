import { describe, it, expect } from 'vitest';
import { LiveTable, START_STACK, TURN_MS, AWAY_TURN_MS, NEXT_HAND_MS, MAX_SEATS } from '../src/multiplayer/table';
import { totalChips } from '../src/engine/rules';

function setup(names: string[]) {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => (now += ms) };
  const t = new LiveTable(() => now);
  for (const n of names) {
    t.setOnline(n, true);
    expect(t.handle(n, { type: 'sit', name: n })).toBeNull();
  }
  return { t, clock };
}

const toAct = (t: LiveTable) => t.order[t.hand!.toAct];

describe('live table', () => {
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
    while (t.inHand()) t.act(toAct(t), { type: t.hand!.players[t.hand!.toAct].streetCommitted < t.hand!.currentBet ? 'call' : 'check' });
    expect(t.hand!.complete).toBe(true);
    expect(t.seats.reduce((a, s) => a + s.stack, 0)).toBe(3 * START_STACK);
    expect(t.viewFor('ann').hand!.players.filter((p) => p.hole.length === 2).length).toBe(3); // showdown reveals
    expect(t.nextDeadline()).not.toBeNull();
    clock.advance(NEXT_HAND_MS);
    expect(t.tick()).toBe(true);
    expect(t.handNo).toBe(2);
    expect(t.order[t.hand!.buttonIndex]).not.toBe(firstButton);
    expect(totalChips(t.hand!)).toBe(3 * START_STACK);
  });

  it('checks or folds for a player who runs out of time', () => {
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

  it('gives a disconnected player a short clock and clears their seat before the next deal', () => {
    const { t, clock } = setup(['ann', 'bob', 'cat']);
    t.start();
    const gone = toAct(t);
    t.setOnline(gone, false);
    expect(t.turnEndsAt).toBe(t.viewFor('ann').now + AWAY_TURN_MS);
    clock.advance(AWAY_TURN_MS);
    t.tick();
    expect(t.hand!.players[t.order.indexOf(gone)].folded).toBe(true);
    while (t.inHand()) t.act(toAct(t), { type: t.hand!.players[t.hand!.toAct].streetCommitted < t.hand!.currentBet ? 'call' : 'check' });
    clock.advance(NEXT_HAND_MS);
    t.tick();
    expect(t.seats.map((s) => s.id)).not.toContain(gone);
    expect(t.hand!.players).toHaveLength(2);
  });

  it('keeps the seat of a player who reloads between hands', () => {
    const { t } = setup(['ann', 'bob']);
    t.setOnline('bob', false);
    t.setOnline('bob', true);
    expect(t.start()).toBeNull();
    expect(t.hand!.players).toHaveLength(2);
  });

  it('seats at most the table size and cleans up names', () => {
    const { t } = setup(Array.from({ length: MAX_SEATS }, (_, i) => `p${i}`));
    t.setOnline('late', true);
    expect(t.handle('late', { type: 'sit', name: 'x' })).toMatch(/full/);
    t.handle('p0', { type: 'sit', name: '   a   very long name indeed  ' });
    expect(t.seats[0].name).toBe('a very long');
    t.handle('p1', { type: 'sit', name: 42 });
    expect(t.seats[1].name).toBe('Player');
  });
});
