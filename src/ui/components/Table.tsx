import { useEffect, useState } from 'react';
import { HandState, potSize, ActionRecord, effectiveStack } from '../../engine/rules';
import { PlayingCard, CardRow, DEAL_GAP, DEAL_ANIM } from './Card';
import { PROFILES, ProfileId } from '../../opponents/profiles';
import { Term } from './Term';
import { describeHolding } from '../../engine/board';

export const fmtBB = (chips: number, bb: number) => {
  const v = chips / bb;
  return `${Number.isInteger(v) ? v : v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, '')}bb`;
};

/** Short description of one action, e.g. "raises to 2.5bb" (or "raise to 2.5bb" for the hero). */
export function actionText(h: ActionRecord, bb: number, isHero = false): string {
  const t: Record<string, string> = {
    'post-sb': `posts small blind ${fmtBB(h.amount, bb)}`,
    'post-bb': `posts big blind ${fmtBB(h.amount, bb)}`,
    'post-ante': `posts ante ${fmtBB(h.amount, bb)}`,
    fold: 'folds',
    check: 'checks',
    call: `calls ${fmtBB(h.amount, bb)}`,
    bet: `bets ${fmtBB(h.to, bb)}`,
    raise: `raises to ${fmtBB(h.to, bb)}`,
  };
  let txt = t[h.type] ?? h.type;
  if (isHero) txt = txt.replace(/^(\w+?)s\b/, '$1');
  if (h.allIn) txt += ' (all-in)';
  return txt;
}

function lastStreetAction(s: HandState, player: number): ActionRecord | undefined {
  for (let i = s.history.length - 1; i >= 0; i--) {
    const h = s.history[i];
    if (h.street !== s.street) break;
    if (h.player === player && !h.type.startsWith('post')) return h;
  }
  return undefined;
}

/** Point on a stadium (pill) outline, by fraction of the perimeter, starting at the bottom center and going clockwise on screen. Returns percentages of the box. */
function stadiumPoint(t: number, w: number, h: number, scale = 1): { x: number; y: number } {
  const sw = w * scale;
  const sh = h * scale;
  const r = Math.min(sw, sh) / 2;
  const segs: { len: number; at: (u: number) => [number, number] }[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => ({ len: Math.hypot(x2 - x1, y2 - y1), at: (u: number) => [x1 + (x2 - x1) * u, y1 + (y2 - y1) * u] as [number, number] });
  const arc = (cx: number, cy: number, a1: number, a2: number) => ({ len: Math.abs(a2 - a1) * r, at: (u: number) => [cx + r * Math.cos(a1 + (a2 - a1) * u), cy + r * Math.sin(a1 + (a2 - a1) * u)] as [number, number] });
  segs.push(line(sw / 2, sh, r, sh));
  segs.push(arc(r, sh - r, Math.PI / 2, Math.PI));
  segs.push(line(0, sh - r, 0, r));
  segs.push(arc(r, r, Math.PI, 1.5 * Math.PI));
  segs.push(line(r, 0, sw - r, 0));
  segs.push(arc(sw - r, r, 1.5 * Math.PI, 2 * Math.PI));
  segs.push(line(sw, r, sw, sh - r));
  segs.push(arc(sw - r, sh - r, 0, Math.PI / 2));
  segs.push(line(sw - r, sh, sw / 2, sh));
  const total = segs.reduce((a, g) => a + g.len, 0);
  let d = (((t % 1) + 1) % 1) * total;
  for (const g of segs) {
    if (d <= g.len || g === segs[segs.length - 1]) {
      const [x, y] = g.at(g.len ? Math.min(1, d / g.len) : 0);
      return { x: ((x + (w - sw) / 2) / w) * 100, y: ((y + (h - sh) / 2) / h) * 100 };
    }
    d -= g.len;
  }
  return { x: 50, y: 100 };
}

/** Matches the CSS breakpoint that switches the table to a portrait layout. */
function useNarrow(): boolean {
  const q = '(max-width: 820px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Chips on a smaller copy of the table outline (evenly spaced like the seats), nudged off the board. */
function innerChip(p: { x: number; y: number }): { x: number; y: number } {
  // the pot label and board occupy roughly 32%–58% of the height in the middle
  if (p.y > 30 && p.y < 50) return { x: p.x, y: 29 };
  if (p.y >= 50 && p.y < 60) return { x: p.x, y: 60 };
  return p;
}

/** How long dealing the hole cards takes for a table of n players (ms). */
export const dealMs = (n: number) => Math.round(((2 * n - 1) * DEAL_GAP + DEAL_ANIM) * 1000);

// felt proportions (must match .felt aspect-ratio in styles.css)
const LANDSCAPE = { w: 2.1, h: 1 };
const PORTRAIT = { w: 1, h: 1.75 };


export function Table({
  state,
  hero,
  profiles,
  fourColor,
  revealAll = false,
  spotlight,
  showNames = false,
  handKey,
}: {
  state: HandState;
  hero: number;
  profiles: Record<number, ProfileId>;
  fourColor: boolean;
  revealAll?: boolean;
  /** replay: the seat that just acted, highlighted with a label of its action */
  spotlight?: { seat: number; label: string };
  /** live tables: show each player's name after their position */
  showNames?: boolean;
  /** changes with each new hand so the hole cards are dealt again; defaults to the hole cards themselves */
  handKey?: string | number;
}) {
  const n = state.players.length;
  const bb = state.config.bb;
  const showdown = state.complete && state.result?.reason === 'showdown' ? new Set(state.result.showdownPlayers) : new Set<number>();
  const totalPot = potSize(state);
  const streetBets = state.players.reduce((a, p) => a + p.streetCommitted, 0);
  const potBefore = state.complete ? totalPot : totalPot - streetBets;
  const deal = handKey ?? state.players.map((p) => p.hole.join('.')).join('|');
  // hole cards go out one at a time, starting left of the button, two rounds
  const dealDelay = (i: number, round: number) => `${(round * n + ((i - state.buttonIndex - 1 + n) % n)) * DEAL_GAP}s`;
  // seat geometry: hero at the bottom center, others evenly spaced clockwise along the rail
  const narrow = useNarrow();
  const box = narrow ? PORTRAIT : LANDSCAPE;
  const geo = (i: number) => {
    const t = ((i - hero + n) % n) / n;
    const raw = stadiumPoint(t, box.w, box.h, 1);
    // portrait: push the side seats out onto the rail so they clear the board
    const seat = narrow ? { x: 50 + (raw.x - 50) * 1.08, y: raw.y } : raw;
    // bets sit between the seat and the middle, clear of the board and of the hole cards
    const chip = narrow
      ? i === hero
        ? { x: 50, y: 73 } // above the hero's cards
        : raw.x < 12 || raw.x > 88
          ? innerChip({ x: raw.x < 50 ? 28 : 72, y: raw.y + (raw.y > 50 ? -7 : 7) }) // side seats: straight in from the plate
          : raw.y > 65
            ? (({ x, y }) => ({ x, y: Math.min(y, 75) }))(stadiumPoint(t, box.w, box.h, 0.7)) // bottom-curve seats: clear of the hero's chip and cards
            : innerChip(stadiumPoint(t, box.w, box.h, 0.56))
      : i === hero
        ? { x: 63, y: 84 } // beside the hero's (large) hole cards
        : { x: 50 + (seat.x - 50) * 0.5, y: 50 + (seat.y - 50) * 0.5 };
    return {
      seat: { left: `${seat.x}%`, top: `${seat.y}%` },
      chip: { left: `${chip.x}%`, top: `${chip.y}%` },
      low: seat.y > 60, // lower part of the table: cards sit above the plate
      outer: raw.x < 45 ? 'left' : 'right', // side of the plate facing the rail
    };
  };
  return (
    <div className="table-wrap" aria-label="Poker table">
      <div className={`felt ${n >= 8 ? 'crowded' : ''}`}>
        <div className="felt-line" aria-hidden="true" />
        <div className="table-center">
          <div className="pot-pill" aria-live="polite">
            <Term id="pot">Pot</Term> <strong data-testid="pot">{fmtBB(totalPot, bb)}</strong>
          </div>
          <div className="board" aria-label="Community cards">
            <CardRow cards={state.board} placeholders={5} size="md" fourColor={fourColor} deal />
          </div>
          <div className="pot-sub">
            {streetBets > 0 && potBefore > 0 && !state.complete ? `${fmtBB(potBefore, bb)} in the middle + ${fmtBB(streetBets, bb)} bet this street` : '\u00a0'}
            {state.config.anteType !== 'none' && state.config.ante > 0 && (
              <span className="blinds-line">
                Blinds {fmtBB(state.config.sb, bb)}/{fmtBB(state.config.bb, bb)} · <Term id="ante">{state.config.anteType === 'bb' ? 'BB ante' : 'ante'}</Term> {fmtBB(state.config.ante, bb)}
              </span>
            )}
          </div>
        </div>
        {state.players.map((p, i) => {
          const g = geo(i);
          const act = lastStreetAction(state, i);
          const isTurn = spotlight ? spotlight.seat === i : state.toAct === i && !state.complete;
          const show = p.isHero || showdown.has(i) || revealAll;
          const prof = profiles[i];
          const faceUp = p.hole.length === 2 && show;
          // dealt face up (yours) or face down, then flipped when shown at showdown
          const anim = faceUp && !p.isHero ? 'reveal' : 'deal';
          const cards = p.folded ? null : (
            <div key={`${deal}-${faceUp ? 'up' : 'down'}`} className={`seat-cards ${p.isHero ? 'big' : ''} ${faceUp ? '' : 'backs'} ${anim}`}>
              {[0, 1].map((r) => (
                <PlayingCard
                  key={r}
                  card={faceUp ? p.hole[r] : undefined}
                  size={p.isHero ? 'lg' : 'sm'}
                  fourColor={fourColor}
                  style={anim === 'deal' ? { animationDelay: dealDelay(i, r) } : undefined}
                />
              ))}
            </div>
          );
          return (
            <div key={i}>
              <div
                className={`seat ${p.folded ? 'folded' : ''} ${isTurn ? 'acting' : ''} ${p.isHero ? 'hero' : ''} ${g.low ? 'low' : 'high'}`}
                style={g.seat}
                aria-label={`${p.isHero ? 'You' : p.position}${p.folded ? ', folded' : ''}${p.allIn ? ', all-in' : ''}, stack ${fmtBB(p.stack, bb)}`}
              >
                {g.low && cards}
                <div className="plate">
                  {i === state.buttonIndex && (
                    <span className={`dealer-btn on-${g.outer}`} title="Dealer button" aria-label="Dealer button">
                      D
                    </span>
                  )}
                  <span className="plate-pos">
                    {p.position}
                    {p.isHero ? ' · You' : showNames ? <span className="plate-name"> · {p.name}</span> : prof && !p.folded ? <span className="plate-prof"> · {PROFILES[prof].short}</span> : null}
                  </span>
                  <span className="plate-stack">{p.allIn ? 'All-in' : fmtBB(p.stack, bb)}</span>
                </div>
                {!g.low && cards}
                <div className="seat-tags">
                  {spotlight ? (
                    spotlight.seat === i && <div className="seat-action spot">{spotlight.label}</div>
                  ) : (
                    act && !state.complete && act.type === 'check' && <div className="seat-action">Check</div>
                  )}
                  {showdown.has(i) && state.board.length === 5 && <div className="seat-showdown">{describeHolding(p.hole, state.board)}</div>}
                </div>
              </div>
              {p.streetCommitted > 0 && !state.complete && (
                <div className={`bet-chip ${act?.type === 'raise' || act?.type === 'bet' ? 'agg' : ''}`} style={g.chip} aria-label={`${p.isHero ? 'Your' : p.position} bet this street: ${fmtBB(p.streetCommitted, bb)}`}>
                  <span className="chip-dot" aria-hidden="true" />
                  {!narrow && act && (act.type === 'bet' || act.type === 'raise') ? (p.allIn ? 'All-in ' : act.type === 'raise' ? 'Raise to ' : 'Bet ') : ''}
                  {fmtBB(p.streetCommitted, bb)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The numbers a decision is made with: pot, amount to call, effective stack and current hand. */
export function DecisionFacts({ state, hero }: { state: HandState; hero: number }) {
  const bb = state.config.bb;
  const me = state.players[hero];
  const toCall = state.toAct === hero ? Math.max(0, Math.min(state.currentBet - me.streetCommitted, me.stack)) : 0;
  return (
    <div className="facts" aria-live="polite">
      <div className="fact">
        <span className="fact-l">
          <Term id="pot">Pot</Term>
        </span>
        <span className="fact-v">{fmtBB(potSize(state), bb)}</span>
      </div>
      <div className="fact">
        <span className="fact-l">
          <Term id="tocall">To call</Term>
        </span>
        <span className="fact-v" data-testid="to-call">
          {fmtBB(toCall, bb)}
        </span>
      </div>
      <div className="fact">
        <span className="fact-l">
          <Term id="effective">Effective stack</Term>
        </span>
        <span className="fact-v">{fmtBB(effectiveStack(state, hero), bb)}</span>
      </div>
      {me.hole.length === 2 && state.board.length >= 3 && (
        <div className="fact wide">
          <span className="fact-l">You have</span>
          <span className="fact-v">{describeHolding(me.hole, state.board)}</span>
        </div>
      )}
    </div>
  );
}

export function HistoryList({ state, hero, showNames = false }: { state: HandState; hero: number; showNames?: boolean }) {
  const bb = state.config.bb;
  const streets = ['preflop', 'flop', 'turn', 'river'] as const;
  const boardAt = { preflop: 0, flop: 3, turn: 4, river: 5 };
  return (
    <div className="history" aria-label="Action history">
      {streets.map((st) => {
        const acts = state.history.filter((h) => h.street === st);
        if (!acts.length) return null;
        return (
          <div key={st} className="history-street">
            <div className="history-head">
              {st[0].toUpperCase() + st.slice(1)}
              {st !== 'preflop' && <CardRow cards={state.board.slice(0, boardAt[st])} size="sm" />}
            </div>
            <ol>
              {acts.map((h, k) => {
                const who = h.player === hero ? 'You' : showNames ? `${state.players[h.player].name} (${state.players[h.player].position})` : state.players[h.player].position;
                let txt = '';
                switch (h.type) {
                  case 'post-sb':
                    txt = `posts small blind ${fmtBB(h.amount, bb)}`;
                    break;
                  case 'post-bb':
                    txt = `posts big blind ${fmtBB(h.amount, bb)}`;
                    break;
                  case 'post-ante':
                    txt = `posts ante ${fmtBB(h.amount, bb)}`;
                    break;
                  case 'fold':
                    txt = 'folds';
                    break;
                  case 'check':
                    txt = 'checks';
                    break;
                  case 'call':
                    txt = `calls ${fmtBB(h.amount, bb)}`;
                    break;
                  case 'bet':
                    txt = `bets ${fmtBB(h.to, bb)}`;
                    break;
                  case 'raise':
                    txt = `raises to ${fmtBB(h.to, bb)}`;
                    break;
                }
                if (h.player === hero) txt = txt.replace(/^(posts|folds|checks|calls|bets|raises)/, (w) => ({ posts: 'post', folds: 'fold', checks: 'check', calls: 'call', bets: 'bet', raises: 'raise' })[w] ?? w);
                if (h.allIn) txt += ' (all-in)';
                if (h.type === 'post-ante' && state.config.anteType === 'each' && h.player !== hero) return null;
                return (
                  <li key={k} className={h.player === hero ? 'mine' : ''}>
                    <span className="who">{who}</span> {txt}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
