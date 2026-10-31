import { describe, it, expect } from 'vitest';
import { LiveTable, BOT_SEATS, MAX_SEATS, NEXT_HAND_MS, RECONNECT_MS, RESERVE_MS, TURN_MS, LOW_STAKES, buyInFor, type Cashout } from '../src/multiplayer/table';
import { BOT_BUY_IN_BB, BOT_THINK_MS, isBotId, practicePolicy, type BotPolicy } from '../src/multiplayer/bots';
import { createRng } from '../src/engine/cards';
import { legalActions, totalChips, validateAction, type HandState } from '../src/engine/rules';

const START_STACK = buyInFor(LOW_STAKES).max;
const BOT_STACK = BOT_BUY_IN_BB * LOW_STAKES.bb;

function botTable(opts: { botSeats?: number; botPolicy?: BotPolicy; seed?: string } = {}) {
  let now = 1_000_000;
  const rng = createRng(opts.seed ?? 'bots');
  const t = new LiveTable({ botSeats: opts.botSeats ?? BOT_SEATS, botPolicy: opts.botPolicy, clock: () => now, random: rng.next });
  const cashouts: Cashout[] = [];
  const advance = (ms: number) => (now += ms);
  return {
    t,
    advance,
    now: () => now,
    cashouts,
    drain: () => cashouts.push(...t.takeCashouts()),
    /** jump to the next deadline and run it, the way the server's timer does */
    runTimer() {
      const at = t.nextDeadline();
      expect(at).not.toBeNull();
      now = Math.max(now, at!);
      return t.tick();
    },
  };
}

const sitDown = (t: LiveTable, id: string, seat?: number, buyIn = START_STACK) => {
  t.setOnline(id, true);
  return t.sit(id, id, buyIn, seat);
};
const bots = (t: LiveTable) => t.seats.filter((s) => s.bot);
const people = (t: LiveTable) => t.seats.filter((s) => !s.bot);
const toActId = (t: LiveTable) => t.order[t.hand!.toAct];
const personToAct = (t: LiveTable) => t.inHand() && !isBotId(toActId(t));
/** a person to act checks or calls */
const passive = (t: LiveTable) => {
  const h = t.hand!;
  return t.act(toActId(t), { type: h.players[h.toAct].streetCommitted < h.currentBet ? 'call' : 'check' });
};

/** Play the hand out: bots on their timer, people checking or calling. */
function playHand(x: ReturnType<typeof botTable>) {
  for (let k = 0; k < 300 && x.t.inHand(); k++) {
    if (personToAct(x.t)) expect(passive(x.t)).toBeNull();
    else x.runTimer();
  }
  expect(x.t.inHand()).toBe(false);
}

describe('bots: filling a public table', () => {
  it('an empty table has no bots and nothing scheduled', () => {
    const { t } = botTable();
    expect(t.seats).toEqual([]);
    expect(t.nextDeadline()).toBeNull();
    expect(t.summary()).toEqual({ players: 0, bots: 0, maxSeats: MAX_SEATS, playing: false });
  });

  it('one person sits down: bots fill up to BOT_SEATS, each with its own style, and a hand deals', () => {
    const x = botTable();
    expect(sitDown(x.t, 'ann', 0)).toBeNull();
    expect(people(x.t)).toHaveLength(1);
    expect(bots(x.t)).toHaveLength(BOT_SEATS - 1);
    expect(new Set(bots(x.t).map((b) => b.bot)).size).toBe(BOT_SEATS - 1);
    expect(bots(x.t).every((b) => b.stack === BOT_STACK)).toBe(true);
    // bots spread round the table rather than bunching next to you
    expect(bots(x.t).map((b) => b.seat)).not.toContain(1);
    // people are never counted as bots or the other way round
    expect(x.t.summary()).toMatchObject({ players: 1, bots: BOT_SEATS - 1 });
    const v = x.t.viewFor('ann');
    expect(v.seats.filter((s) => s.bot)).toHaveLength(BOT_SEATS - 1);
    expect(v.seats.find((s) => s.id === 'ann')!.bot).toBeNull();
    expect(v.botSeats).toBe(BOT_SEATS);
    // the first hand deals without waiting for anyone else
    expect(x.t.nextHandAt).toBe(x.now() + NEXT_HAND_MS);
    x.runTimer();
    expect(x.t.inHand()).toBe(true);
    expect(x.t.hand!.players).toHaveLength(BOT_SEATS);
    playHand(x);
    expect(x.t.handNo).toBe(1);
  });

  it('private tables (no botSeats) never get bots', () => {
    const t = new LiveTable();
    t.setOnline('ann', true);
    t.sit('ann', 'Ann', START_STACK, 0);
    expect(t.seats).toHaveLength(1);
    expect(t.nextHandAt).toBeNull();
  });

  it('bots think for a bounded, human-looking time', () => {
    const x = botTable();
    sitDown(x.t, 'ann', 0);
    for (let hand = 0; hand < 5; hand++) {
      x.runTimer(); // deal
      for (let k = 0; k < 300 && x.t.inHand(); k++) {
        if (personToAct(x.t)) {
          expect(x.t.botAt).toBeNull();
          expect(passive(x.t)).toBeNull();
          continue;
        }
        const wait = x.t.botAt! - x.now();
        expect(wait).toBeGreaterThanOrEqual(BOT_THINK_MS.min);
        expect(wait).toBeLessThanOrEqual(BOT_THINK_MS.max + BOT_THINK_MS.afterDeal);
        expect(x.t.botAt!).toBeLessThan(x.t.turnEndsAt!); // they move well before their turn would time out
        x.runTimer();
      }
      if (people(x.t).length === 0) break;
    }
  });
});

describe('bots: people come first', () => {
  it('a second person takes an open seat mid-hand; a bot finishes its hand, then stands up', () => {
    const x = botTable();
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    expect(x.t.inHand()).toBe(true);
    const before = x.t.hand!.players.map((p) => ({ ...p, hole: [...p.hole] }));
    const open = Array.from({ length: MAX_SEATS }, (_, n) => n).find((n) => !x.t.seats.some((s) => s.seat === n))!;
    expect(sitDown(x.t, 'bob', open)).toBeNull();
    // nobody's cards or stack change mid-hand; one bot is marked to stand up afterwards
    expect(x.t.hand!.players.map((p) => p.hole)).toEqual(before.map((p) => p.hole));
    expect(bots(x.t).filter((b) => b.leaving)).toHaveLength(1);
    expect(x.t.viewFor('bob').seats.find((s) => s.leaving)!.bot).not.toBeNull();
    const leaver = bots(x.t).find((b) => b.leaving)!.id;
    playHand(x);
    expect(x.t.seats.map((s) => s.id)).not.toContain(leaver);
    expect(x.t.seats).toHaveLength(BOT_SEATS);
    expect(people(x.t).map((s) => s.id).sort()).toEqual(['ann', 'bob']);
    x.runTimer(); // next deal includes bob
    expect(x.t.order).toContain('bob');
    expect(x.t.order).not.toContain(leaver);
  });

  it('between hands the swap is immediate', () => {
    const x = botTable();
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    playHand(x);
    const open = Array.from({ length: MAX_SEATS }, (_, n) => n).find((n) => !x.t.seats.some((s) => s.seat === n))!;
    sitDown(x.t, 'bob', open);
    expect(x.t.seats).toHaveLength(BOT_SEATS);
    expect(bots(x.t)).toHaveLength(BOT_SEATS - 2);
  });

  it('people can take every seat: bots give way until none are left, then the table is full', () => {
    const x = botTable({ botSeats: MAX_SEATS });
    sitDown(x.t, 'p0', 0);
    expect(bots(x.t)).toHaveLength(MAX_SEATS - 1);
    // between hands each bot's seat changes hands at once
    for (let n = 1; n < MAX_SEATS; n++) expect(sitDown(x.t, `p${n}`, bots(x.t)[0].seat)).toBeNull();
    expect(bots(x.t)).toHaveLength(0);
    expect(people(x.t)).toHaveLength(MAX_SEATS);
    expect(sitDown(x.t, 'late', 0)).toBe('The table is full');
    expect(x.t.summary()).toMatchObject({ players: MAX_SEATS, bots: 0 });
  });
});

describe('bots: taking a bot’s seat', () => {
  /** all six seats used: ann and five bots, a hand under way */
  function fullTable() {
    const x = botTable({ botSeats: MAX_SEATS });
    sitDown(x.t, 'ann', 0);
    expect(x.t.seats).toHaveLength(MAX_SEATS);
    x.runTimer();
    expect(x.t.inHand()).toBe(true);
    return x;
  }

  it('waits for the hand to end; the bot plays its own cards out and never hands them over', () => {
    const x = fullTable();
    const bot = bots(x.t).find((b) => x.t.order.includes(b.id))!;
    const k = x.t.order.indexOf(bot.id);
    const botCards = [...x.t.hand!.players[k].hole];
    expect(sitDown(x.t, 'bob', bot.seat)).toBeNull();
    // still the bot's seat, cards and stack; bob is only waiting
    expect(x.t.seats.find((s) => s.seat === bot.seat)!.id).toBe(bot.id);
    expect(x.t.hand!.players[k].hole).toEqual(botCards);
    expect(x.t.isSeated('bob')).toBe(false);
    const bobView = x.t.viewFor('bob');
    expect(bobView.waiting).toEqual({ seat: bot.seat, buyIn: START_STACK });
    expect(bobView.me).toBe(-1);
    expect(bobView.hand!.players.every((p) => p.hole.length === 0)).toBe(true);
    expect(bobView.seats.find((s) => s.seat === bot.seat)!.reserved).toBe(true);
    // the buy-in is held by the table while bob waits
    expect(x.t.heldChips()).toContainEqual({ id: 'bob', amount: START_STACK });
    playHand(x);
    // between hands bob has the seat, with exactly his own buy-in
    const mine = x.t.seats.find((s) => s.seat === bot.seat)!;
    expect(mine).toMatchObject({ id: 'bob', stack: START_STACK });
    expect(mine.bot).toBeUndefined();
    expect(x.t.viewFor('bob').waiting).toBeNull();
    expect(x.t.seats).toHaveLength(MAX_SEATS);
    // the bot's chips went nowhere near the bank
    x.drain();
    expect(x.cashouts.filter((c) => isBotId(c.id))).toEqual([]);
    // the next hand deals bob in, with the button still moving round the seats in order
    const lastButtonSeat = x.t.viewFor('ann').handSeats[x.t.hand!.buttonIndex];
    x.runTimer();
    expect(x.t.order).toContain('bob');
    const nextButtonSeat = x.t.viewFor('ann').handSeats[x.t.hand!.buttonIndex];
    expect(nextButtonSeat).toBe((lastButtonSeat + 1) % MAX_SEATS);
    expect(x.t.hand!.players[x.t.order.indexOf('bob')].startStack).toBe(START_STACK);
  });

  it('two people asking for the same bot seat: the first gets it, the second is told why', () => {
    const x = fullTable();
    const seat = bots(x.t)[0].seat;
    expect(sitDown(x.t, 'bob', seat)).toBeNull();
    expect(sitDown(x.t, 'cat', seat)).toMatch(/already waiting/);
    expect(x.t.reservationOf('cat')).toBeNull();
    // cat can wait for a different bot instead
    expect(sitDown(x.t, 'cat', bots(x.t).find((b) => !b.reservedBy)!.seat)).toBeNull();
    // and nobody can hold two places or buy in twice
    expect(sitDown(x.t, 'bob', bots(x.t).find((b) => !b.reservedBy)!.seat)).toMatch(/already waiting/);
    expect(sitDown(x.t, 'ann', bots(x.t).find((b) => !b.reservedBy)!.seat)).toMatch(/already sitting/);
    playHand(x);
    expect(people(x.t).map((s) => s.id).sort()).toEqual(['ann', 'bob', 'cat']);
  });

  it('cancelling (or leaving) gives the buy-in back and the bot keeps its seat', () => {
    const x = fullTable();
    const bot = bots(x.t)[0];
    sitDown(x.t, 'bob', bot.seat);
    expect(x.t.handle('bob', { type: 'cancel' })).toBeNull();
    x.drain();
    expect(x.cashouts).toEqual([{ id: 'bob', amount: START_STACK }]);
    expect(x.t.reservationOf('bob')).toBeNull();
    sitDown(x.t, 'cat', bot.seat);
    x.t.handle('cat', { type: 'leave' });
    x.drain();
    expect(x.cashouts).toContainEqual({ id: 'cat', amount: START_STACK });
    playHand(x);
    expect(x.t.seats.find((s) => s.seat === bot.seat)!.id).toBe(bot.id);
    expect(x.t.heldChips().map((c) => c.id)).toEqual(['ann']);
  });

  it('a person who drops while waiting keeps their place through a reload, but not for good', () => {
    const x = fullTable();
    const [b1, b2] = bots(x.t);
    sitDown(x.t, 'bob', b1.seat);
    x.t.setOnline('bob', false);
    x.advance(RECONNECT_MS - 1);
    x.t.setOnline('bob', true); // reloaded in time
    sitDown(x.t, 'cat', b2.seat);
    x.t.setOnline('cat', false);
    expect(x.t.nextDeadline()).toBeLessThanOrEqual(x.now() + RECONNECT_MS);
    // cat's wait lapses on the timer even though the hand is still going on
    while (x.t.reservationOf('cat') && x.t.inHand()) {
      if (personToAct(x.t)) {
        x.advance(Math.max(0, x.now() + RECONNECT_MS - x.now()));
        x.t.tick();
      } else x.runTimer();
    }
    if (x.t.reservationOf('cat')) {
      x.advance(RECONNECT_MS);
      x.t.tick();
    }
    expect(x.t.reservationOf('cat')).toBeNull();
    x.drain();
    expect(x.cashouts).toContainEqual({ id: 'cat', amount: START_STACK });
    if (x.t.inHand()) playHand(x);
    expect(x.t.isSeated('bob')).toBe(true);
    expect(x.t.isSeated('cat')).toBe(false);
  });

  it('a wait that runs past RESERVE_MS lapses and the buy-in goes back', () => {
    const x = fullTable();
    sitDown(x.t, 'bob', bots(x.t)[0].seat);
    // a hand that never ends: ann never acts, but the timer keeps nudging her turn along, so jump instead
    x.advance(RESERVE_MS);
    x.t.tick();
    expect(x.t.reservationOf('bob')).toBeNull();
    x.drain();
    expect(x.cashouts).toContainEqual({ id: 'bob', amount: START_STACK });
  });
});

describe('bots: leaving and idle tables', () => {
  it('when the last person leaves mid-hand the bots finish quickly, stand up, and the table goes quiet', () => {
    const x = botTable();
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    x.t.handle('ann', { type: 'leave' });
    for (let k = 0; k < 300 && x.t.inHand(); k++) {
      expect(x.t.botAt).toBe(x.now()); // no waiting with nobody there
      x.runTimer();
    }
    expect(x.t.inHand()).toBe(false);
    expect(x.t.seats).toEqual([]);
    expect(x.t.nextDeadline()).toBeNull();
    x.drain();
    expect(x.cashouts.every((c) => !isBotId(c.id))).toBe(true);
  });

  it('bots never deal a hand among themselves while the only person is away', () => {
    const x = botTable();
    sitDown(x.t, 'ann', 0);
    x.t.setOnline('ann', false);
    expect(x.t.nextHandAt).toBeNull();
    expect(x.t.handle('bot-1', { type: 'start' })).toBe('Sit down first'); // bots have no say, and nor do watchers
    expect(x.t.handle('watcher', { type: 'start' })).toBe('Sit down first');
    // the held seat runs out and the bots go with it
    x.runTimer();
    expect(x.t.hand).toBeNull();
    expect(x.t.seats).toEqual([]);
    expect(x.t.nextDeadline()).toBeNull();
  });

  it('a quick reload between hands keeps the game going', () => {
    const x = botTable();
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    playHand(x);
    x.t.setOnline('ann', false);
    expect(x.t.nextHandAt).toBeNull();
    x.advance(1000);
    x.t.setOnline('ann', true);
    expect(x.t.nextHandAt).not.toBeNull();
    x.runTimer();
    expect(x.t.inHand()).toBe(true);
  });

  it('a person who stops acting is stood up after two missed turns, and the bots go too', () => {
    const x = botTable();
    sitDown(x.t, 'ann', 0);
    for (let k = 0; k < 2000 && x.t.seats.length; k++) x.runTimer();
    expect(x.t.seats).toEqual([]);
    expect(x.t.nextDeadline()).toBeNull();
  });

  it('a busted bot is replaced by a fresh one between hands', () => {
    // bots that always shove: someone busts quickly
    const shove: BotPolicy = () => ({ type: 'allin' });
    const x = botTable({ botPolicy: shove, seed: 'bust' });
    sitDown(x.t, 'ann', 0);
    const seen = new Set(bots(x.t).map((b) => b.id));
    for (let hand = 0; hand < 30; hand++) {
      x.runTimer();
      for (let k = 0; k < 300 && x.t.inHand(); k++) {
        if (personToAct(x.t)) expect(x.t.act('ann', { type: 'fold' })).toBeNull();
        else x.runTimer();
      }
      expect(x.t.seats).toHaveLength(BOT_SEATS);
      expect(bots(x.t).every((b) => b.stack > 0)).toBe(true);
      bots(x.t).forEach((b) => seen.add(b.id));
    }
    expect(seen.size).toBeGreaterThan(BOT_SEATS - 1);
  });
});

describe('bots: game integrity', () => {
  it('a bot only ever sees its own cards and public information', () => {
    const views: { view: HandState; actor: number; realHoles: number[][]; realDeck: number }[] = [];
    let table: LiveTable;
    const spy: BotPolicy = (view, style, u) => {
      const h = table.hand!;
      views.push({ view: view.state, actor: view.actor, realHoles: h.players.map((p) => p.hole), realDeck: h.deck.length });
      // a bot that tries to tamper with what it was given changes nothing real
      view.state.players.forEach((p) => p.hole.splice(0));
      view.state.board.push(0);
      return practicePolicy({ ...view, state: { ...view.state, board: view.state.board.slice(0, -1), players: view.state.players } }, style, u);
    };
    const x = botTable({ botPolicy: (v, s, u) => spy(structuredClone(v), s, u) });
    table = x.t;
    sitDown(x.t, 'ann', 0);
    for (let hand = 0; hand < 10 && people(x.t).length; hand++) {
      x.runTimer();
      if (x.t.inHand()) playHand(x);
    }
    expect(views.length).toBeGreaterThan(10);
    for (const { view, actor, realHoles, realDeck } of views) {
      expect(realDeck).toBeGreaterThan(0);
      expect(view.deck).toEqual([]);
      expect(view.result).toBeUndefined();
      expect(view.toAct).toBe(actor);
      view.players.forEach((p, i) => {
        if (i !== actor) expect(p.hole).toEqual([]);
      });
      expect(realHoles[actor]).toHaveLength(2);
    }
  });

  it('the policy is handed a copy: changing it cannot change the real hand', () => {
    let table: LiveTable;
    let checked = false;
    const vandal: BotPolicy = (view) => {
      const before = JSON.stringify(table.hand);
      view.state.players.forEach((p) => {
        p.stack = 0;
        p.hole.splice(0);
      });
      view.state.board.push(1, 2, 3);
      view.state.history.splice(0);
      expect(JSON.stringify(table.hand)).toBe(before);
      checked = true;
      return { type: 'fold' };
    };
    const x = botTable({ botPolicy: vandal });
    table = x.t;
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    playHand(x);
    expect(checked).toBe(true);
  });

  it('bot moves go through the same rules as everyone’s; a move the rules refuse becomes check or fold', () => {
    const cheat: BotPolicy = () => ({ type: 'raise', to: 10 ** 9 });
    const x = botTable({ botPolicy: cheat });
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    const chips = totalChips(x.t.hand!);
    playHand(x);
    expect(x.t.hand!.history.filter((r) => r.type === 'raise' || r.type === 'bet')).toEqual([]);
    expect(totalChips(x.t.hand!)).toBe(chips);
  });

  it('many hands with the real policy: every bot move is legal and no chips are made or lost', () => {
    const x = botTable({ seed: 'long-run' });
    let checked = 0;
    const realAct = x.t.act.bind(x.t);
    x.t.act = (id, a) => {
      if (isBotId(id)) {
        expect(validateAction(x.t.hand!, a)).toBeNull();
        checked++;
      }
      return realAct(id, a);
    };
    sitDown(x.t, 'ann', 0);
    for (let hand = 0; hand < 40 && people(x.t).length; hand++) {
      x.runTimer();
      if (!x.t.inHand()) continue;
      const chips = totalChips(x.t.hand!);
      playHand(x);
      expect(totalChips(x.t.hand!)).toBe(chips);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('a bot move fires once: a repeat or late timer does nothing', () => {
    const x = botTable();
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    while (personToAct(x.t)) passive(x.t);
    const at = x.t.botAt!;
    x.advance(at - x.now());
    expect(x.t.tick()).toBe(true);
    const len = x.t.hand!.history.length;
    // the same deadline fires again (a duplicate timer): nothing happens
    expect(x.t.tick()).toBe(false);
    expect(x.t.hand!.history.length).toBe(len);
  });

  /** bots that only check or call, so a hand is sure to still be going */
  const calls: BotPolicy = (v) => (legalActions(v.state)!.canCheck ? { type: 'check' } : { type: 'call' });

  it('a bot’s scheduled move is rescheduled when the table changes under it', () => {
    const x = botTable({ botSeats: 3, botPolicy: calls });
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    while (personToAct(x.t)) expect(passive(x.t)).toBeNull();
    const actor = toActId(x.t);
    expect(x.t.botAt! - x.now()).toBeGreaterThanOrEqual(BOT_THINK_MS.min);
    // the person leaves: their hand is folded out of turn and the bots no longer wait for anyone
    x.t.handle('ann', { type: 'leave' });
    expect(x.t.inHand()).toBe(true);
    expect(toActId(x.t)).toBe(actor);
    expect(x.t.botAt).toBe(x.now());
  });

  it('a person’s turn still times out normally at a table with bots', () => {
    const x = botTable({ botPolicy: calls });
    sitDown(x.t, 'ann', 0);
    x.runTimer();
    while (!personToAct(x.t)) x.runTimer();
    expect(x.t.botAt).toBeNull();
    expect(x.t.nextDeadline()).toBe(x.t.turnEndsAt);
    expect(x.t.turnEndsAt! - x.now()).toBe(TURN_MS);
    const len = x.t.hand!.history.length;
    x.runTimer();
    expect(x.t.hand!.history.length).toBe(len + 1);
  });
});
