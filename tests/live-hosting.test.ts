// Live tables, the PokerNow-style extras: a host for private tables (settings, pause, letting
// people in, taking them off), the session ledger, showing cards, rabbit hunting, the time bank,
// the 7-2 bounty and bomb pots.
import { describe, it, expect } from 'vitest';
import {
  LiveTable,
  LOW_STAKES,
  NEXT_HAND_MS,
  TIME_BANK_MAX,
  TIME_BANK_PER_HAND,
  TIME_BANK_START,
  buyInFor,
  cleanSettings,
  isSevenDeuce,
  type TableSettings,
} from '../src/multiplayer/table';
import { makeCard } from '../src/engine/cards';
import { newHand, totalChips } from '../src/engine/rules';

const STACK = buyInFor(LOW_STAKES).max;

function setup(names: string[], settings: Partial<TableSettings> = {}, host = true) {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => (now += ms) };
  const t = new LiveTable({ clock: () => now, hostable: true });
  for (const n of names) t.setOnline(n, true);
  if (host) expect(t.handle(names[0], { type: 'host', settings })).toBeNull();
  for (const n of names) expect(t.sit(n, n, STACK)).toBeNull();
  return { t, clock, now: () => now };
}
const toAct = (t: LiveTable) => t.order[t.hand!.toAct];
/** Everyone folds (or checks, when it is free) until the hand is over. */
const foldToEnd = (t: LiveTable) => {
  while (t.inHand()) if (t.act(toAct(t), { type: 'fold' }) !== null) expect(t.act(toAct(t), { type: 'check' })).toBeNull();
};

describe('hosting a private table', () => {
  it('the first to set it up becomes host; only the host changes it; public tables have none', () => {
    const { t } = setup(['ann', 'bob'], { turnSecs: 45, bounty72: 2, approval: true });
    expect(t.viewFor('bob').host).toBe('ann');
    expect(t.settings).toMatchObject({ turnSecs: 45, bounty72: 2, approval: true });
    expect(t.handle('bob', { type: 'host', settings: { turnSecs: 15 } })).toBe('Only the host can change the table');
    expect(t.handle('ann', { type: 'host', settings: { turnSecs: 15 } })).toBeNull();
    expect(t.settings.turnSecs).toBe(15);
    expect(new LiveTable().handle('ann', { type: 'host', settings: {} })).toBe('Public tables have no host');
  });

  it('keeps settings to the menus', () => {
    expect(cleanSettings({ turnSecs: 9999, bounty72: 7, bombBB: -1, approval: 'yes', rabbitHunt: false })).toEqual({
      turnSecs: 30,
      approval: false,
      rabbitHunt: false,
      bounty72: 0,
      bombEvery: 0,
      bombBB: 2,
    });
  });

  it('pausing stops the next deal; only the host can pause', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    foldToEnd(t);
    expect(t.nextHandAt).not.toBeNull();
    expect(t.handle('bob', { type: 'pause', paused: true })).toBe('Only the host can pause the game');
    expect(t.handle('ann', { type: 'pause', paused: true })).toBeNull();
    expect(t.nextHandAt).toBeNull();
    expect(t.start()).toBe('The host has paused the game');
    t.handle('ann', { type: 'pause', paused: false });
    expect(t.nextHandAt).not.toBeNull();
  });

  it('a paused game starts again if the host goes', () => {
    const { t } = setup(['ann', 'bob']);
    t.handle('ann', { type: 'pause', paused: true });
    t.setOnline('ann', false);
    expect(t.paused).toBe(false);
  });

  it('with approval on, newcomers ask; the host says yes or no; once let in, never again', () => {
    const { t } = setup(['ann'], { approval: true });
    t.setOnline('cat', true);
    expect(t.needsApproval('cat')).toBe(true);
    expect(t.requestSeat('cat', 'Cat', 3, STACK)).toBeNull();
    expect(t.viewFor('ann').requests).toEqual([expect.objectContaining({ id: 'cat', name: 'Cat', seat: 3, buyIn: STACK })]);
    expect(t.viewFor('bob').requests).toEqual([]);
    expect(t.answerRequest('bob', 'cat', true)).toEqual({ error: 'Only the host can let players in' });
    expect(t.answerRequest('ann', 'cat', true)).toMatchObject({ id: 'cat', seat: 3 });
    expect(t.needsApproval('cat')).toBe(false);
    // a no just clears the request
    t.setOnline('dan', true);
    t.requestSeat('dan', 'Dan', 4, STACK);
    expect(t.answerRequest('ann', 'dan', false)).toBeNull();
    expect(t.viewFor('ann').requests).toEqual([]);
    // the host never needs asking, and nobody does when the host is away
    expect(t.needsApproval('ann')).toBe(false);
    t.setOnline('ann', false);
    expect(t.needsApproval('eve')).toBe(false);
  });

  it('the host can take a player off the table; they cannot sit again', () => {
    const { t } = setup(['ann', 'bob', 'cat']);
    expect(t.handle('bob', { type: 'remove', target: 'cat' })).toBe('Only the host can remove players');
    expect(t.handle('ann', { type: 'remove', target: 'ann' })).toBe('Pick someone else');
    expect(t.handle('ann', { type: 'remove', target: 'cat' })).toBeNull();
    expect(t.isSeated('cat')).toBe(false);
    expect(t.takeCashouts()).toEqual([{ id: 'cat', amount: STACK }]);
    expect(t.sit('cat', 'cat', STACK)).toBe('The host has taken you off this table.');
  });
});

describe('the session ledger', () => {
  it('shows what each person brought, took back and has now', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    // the first to act folds: they lose their blind
    const loser = toAct(t);
    foldToEnd(t);
    t.leave(loser);
    t.sit(loser, loser, STACK); // buys in again
    const lines = Object.fromEntries(t.viewFor('ann').ledger.map((l) => [l.id, l]));
    const winner = loser === 'ann' ? 'bob' : 'ann';
    expect(lines[loser]).toMatchObject({ buyIn: 2 * STACK, cashOut: lines[loser].cashOut, stack: STACK });
    expect(lines[loser].net).toBeLessThan(0);
    expect(lines[winner].net).toBe(-lines[loser].net);
    expect(lines[loser].net + lines[winner].net).toBe(0);
  });
});

describe('after a hand', () => {
  it('players can show their cards, even after folding; others see them', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    const folder = toAct(t);
    expect(t.handle(folder, { type: 'show' })).toBe('You can show your cards once the hand is over');
    foldToEnd(t);
    const other = folder === 'ann' ? 'bob' : 'ann';
    const k = t.order.indexOf(folder);
    expect(t.viewFor(other).hand!.players[k].hole).toEqual([]);
    expect(t.handle(folder, { type: 'show' })).toBeNull();
    expect(t.viewFor(other).hand!.players[k].hole).toHaveLength(2);
  });

  it('rabbit hunting shows the board cards that would have come, if the table allows it', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    const deck = t.hand!.deck.slice(0, 5);
    foldToEnd(t);
    expect(t.handle('ann', { type: 'rabbit' })).toBeNull();
    expect(t.viewFor('bob').rabbit).toEqual(deck);
    const off = setup(['ann', 'bob'], { rabbitHunt: false }).t;
    off.start();
    foldToEnd(off);
    expect(off.handle('ann', { type: 'rabbit' })).toBe('Rabbit hunting is off at this table');
    // a new hand clears it
    t.handle('ann', { type: 'start' });
    expect(t.viewFor('ann').rabbit).toEqual([]);
  });
});

describe('the time bank', () => {
  it('a player out of time draws on their time bank before being folded, and keeps what they do not use', () => {
    const { t, clock } = setup(['ann', 'bob'], { turnSecs: 20 });
    t.start();
    const slow = toAct(t);
    clock.advance(20_000);
    expect(t.tick()).toBe(true);
    expect(t.inHand()).toBe(true);
    expect(t.viewFor(slow)).toMatchObject({ timeBankOn: true, turnMs: TIME_BANK_START });
    clock.advance(10_000);
    expect(t.act(slow, { type: 'fold' })).toBeNull();
    const seat = t.seats.find((s) => s.id === slow)!;
    // 30s, 10s used, then 5s more for the hand dealt
    expect(seat.timeBank).toBe(TIME_BANK_START - 10_000 + TIME_BANK_PER_HAND);
    expect(t.viewFor(slow).seats.find((s) => s.id === slow)!.timeBank).toBe((TIME_BANK_START - 10_000 + TIME_BANK_PER_HAND) / 1000);
  });

  it('once the time bank runs out the turn is over, and it builds up again with each hand, up to a limit', () => {
    const { t, clock } = setup(['ann', 'bob']);
    t.start();
    const slow = toAct(t);
    clock.advance(30_000);
    t.tick();
    clock.advance(TIME_BANK_START);
    t.tick();
    expect(t.hand!.complete).toBe(true);
    expect(t.seats.find((s) => s.id === slow)!.timeBank).toBe(TIME_BANK_PER_HAND);
    const other = t.seats.find((s) => s.id !== slow)!;
    for (let k = 0; k < 20; k++) {
      clock.advance(NEXT_HAND_MS);
      t.tick();
      foldToEnd(t);
    }
    expect(other.timeBank).toBe(TIME_BANK_MAX);
  });
});

describe('7-2 bounty', () => {
  const SEVEN_DEUCE = [makeCard(5, 0), makeCard(0, 1)];
  it('knows 7-2 when it sees it', () => {
    expect(isSevenDeuce(SEVEN_DEUCE)).toBe(true);
    expect(isSevenDeuce([makeCard(0, 2), makeCard(5, 3)])).toBe(true);
    expect(isSevenDeuce([makeCard(5, 0), makeCard(1, 1)])).toBe(false);
  });

  it('winning with 7-2 and showing it collects the bounty from everyone else dealt in', () => {
    const { t } = setup(['ann', 'bob', 'cat'], { bounty72: 2 });
    t.start();
    const h = t.hand!;
    // the big blind wins when everyone folds to it: give it 7-2
    const bbIdx = h.players.length - 1;
    h.players[bbIdx].hole = SEVEN_DEUCE;
    foldToEnd(t);
    const winner = t.order[bbIdx];
    const before = t.seats.map((s) => s.stack).reduce((a, b) => a + b);
    const winnerBefore = t.seats.find((s) => s.id === winner)!.stack;
    // not shown yet: no bounty
    expect(t.viewFor('ann').bounty).toBeNull();
    expect(t.handle(winner, { type: 'show' })).toBeNull();
    expect(t.viewFor('ann').bounty).toEqual({ player: bbIdx, total: 2 * 2 * LOW_STAKES.bb });
    expect(t.seats.find((s) => s.id === winner)!.stack).toBe(winnerBefore + 4 * LOW_STAKES.bb);
    // chips only moved between players, and showing again pays nothing more
    expect(t.seats.map((s) => s.stack).reduce((a, b) => a + b)).toBe(before);
    t.handle(winner, { type: 'show' });
    expect(t.seats.find((s) => s.id === winner)!.stack).toBe(winnerBefore + 4 * LOW_STAKES.bb);
  });

  it('is off unless the host turns it on', () => {
    const { t } = setup(['ann', 'bob']);
    t.start();
    t.hand!.players[1].hole = SEVEN_DEUCE;
    foldToEnd(t);
    t.handle(t.order[1], { type: 'show' });
    expect(t.viewFor('ann').bounty).toBeNull();
  });
});

describe('bomb pots', () => {
  it('everyone puts in the same amount, there are no blinds, and play starts on the flop', () => {
    const h = newHand({ config: { format: 'cash', numPlayers: 3, sb: 1, bb: 2, ante: 0, anteType: 'none' }, stacks: [200, 200, 200], heroIndex: 0, holes: [], bomb: 4 });
    expect(h.street).toBe('flop');
    expect(h.board).toHaveLength(3);
    expect(h.bomb).toBe(4);
    expect(h.players.map((p) => p.stack)).toEqual([196, 196, 196]);
    expect(h.currentBet).toBe(0);
    // first to act is the first seat left of the button
    expect(h.toAct).toBe((h.buttonIndex + 1) % 3);
    expect(totalChips(h)).toBe(600);
  });

  it('the host can call one for the next hand, or have one every so many hands', () => {
    const { t, clock } = setup(['ann', 'bob', 'cat'], { bombBB: 3 });
    expect(t.handle('bob', { type: 'bomb', on: true })).toBe('Only the host can call a bomb pot');
    t.handle('ann', { type: 'bomb', on: true });
    t.start();
    expect(t.hand!.bomb).toBe(3 * LOW_STAKES.bb);
    expect(t.hand!.street).toBe('flop');
    expect(t.bombNext).toBe(false);
    foldToEnd(t);
    clock.advance(NEXT_HAND_MS);
    t.tick();
    expect(t.hand!.bomb).toBeUndefined();
    const every = setup(['ann', 'bob'], { bombEvery: 5 });
    const bombs: boolean[] = [];
    for (let k = 0; k < 10; k++) {
      every.t.start();
      bombs.push(!!every.t.hand!.bomb);
      foldToEnd(every.t);
    }
    expect(bombs.map((b, k) => (b ? k + 1 : 0)).filter(Boolean)).toEqual([5, 10]);
  });
});
