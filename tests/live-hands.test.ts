// Your live hand history (src/ui/liveHands.ts): stats, sessions and the downloadable log, from
// hands played at a real LiveTable and seen through one player's view.
import { describe, it, expect } from 'vitest';
import { LiveTable, buyInFor, LOW_STAKES } from '../src/multiplayer/table';
import { handText, liveStats, sessions, type LiveHand } from '../src/ui/liveHands';

const STACK = buyInFor(LOW_STAKES).max;

/** Play one hand at a fresh table: the first to act raises, the rest fold. Returns it as 'ann' saw it. */
function playHand(at: number, room = 'abc123', raise = true): LiveHand {
  const t = new LiveTable({ clock: () => at });
  for (const n of ['ann', 'bob', 'cat']) {
    t.setOnline(n, true);
    t.sit(n, n, STACK);
  }
  t.start();
  const first = t.order[t.hand!.toAct];
  if (raise) t.act(first, { type: 'raise', to: 6 });
  else t.act(first, { type: 'fold' });
  while (t.inHand()) t.act(t.order[t.hand!.toAct], { type: 'fold' });
  const v = t.viewFor('ann');
  return { id: `${room}:${at}`, room, handNo: v.handNo, at, me: v.me, hand: v.hand! };
}

describe('live hand history', () => {
  it('works out VPIP, PFR, net and the biggest pot won from your hands', () => {
    const hands = [playHand(1000), playHand(2000, 'abc123', false), playHand(3000)];
    const s = liveStats(hands);
    expect(s.hands).toBe(3);
    const net = hands.reduce((a, h) => a + (h.hand.result!.net[h.me] ?? 0), 0);
    expect(s.net).toBe(net);
    // ann raised only when she was first to act
    const raised = hands.filter((h) => h.hand.history.some((r) => r.player === h.me && r.type === 'raise')).length;
    expect(s.pfr).toBeCloseTo(raised / 3);
    expect(s.vpip! >= s.pfr!).toBe(true);
  });

  it('groups hands into sessions by table and breaks', () => {
    const h = [playHand(0, 'abc123'), playHand(60_000, 'abc123'), playHand(5 * 3600_000, 'abc123'), playHand(70_000, 'xyz789')];
    const s = sessions(h);
    expect(s.map((x) => [x.room, x.hands.length])).toEqual([
      ['abc123', 1],
      ['xyz789', 1],
      ['abc123', 2],
    ]);
  });

  it('writes a readable log: seats, your cards only, actions by street and who won', () => {
    const lh = playHand(Date.UTC(2026, 10, 1, 12));
    const text = handText(lh);
    expect(text).toMatch(/^Felt School hand #1 · 0\.5\/1 NLH · abc123 · 2026-11-01 12:00:00 UTC/);
    expect(text).toContain('ann (you)');
    expect(text).toMatch(/posts the small blind 0\.5/);
    expect(text).toContain('*** Preflop ***');
    expect(text).toMatch(/wins /);
    // other players' cards were never shown, so they are not in the log
    const cardsShown = text.split('\n').filter((l) => l.startsWith('Seat ') && l.includes('['));
    expect(cardsShown).toHaveLength(1);
    expect(cardsShown[0]).toContain('(you)');
  });
});
