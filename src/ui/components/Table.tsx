import { HandState, potSize, ActionRecord, effectiveStack } from '../../engine/rules';
import { PlayingCard, CardRow } from './Card';
import { PROFILES, ProfileId } from '../../opponents/profiles';
import { Term } from './Term';
import { describeHolding } from '../../engine/board';

export const fmtBB = (chips: number, bb: number) => {
  const v = chips / bb;
  return `${Number.isInteger(v) ? v : v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, '')}bb`;
};

function lastStreetAction(s: HandState, player: number): ActionRecord | undefined {
  for (let i = s.history.length - 1; i >= 0; i--) {
    const h = s.history[i];
    if (h.street !== s.street) break;
    if (h.player === player && !h.type.startsWith('post')) return h;
  }
  return undefined;
}

const ACTION_WORD: Record<string, string> = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise' };

export function Table({
  state,
  hero,
  profiles,
  fourColor,
  revealAll = false,
}: {
  state: HandState;
  hero: number;
  profiles: Record<number, ProfileId>;
  fourColor: boolean;
  revealAll?: boolean;
}) {
  const n = state.players.length;
  const bb = state.config.bb;
  const showdown = state.complete && state.result?.reason === 'showdown' ? new Set(state.result.showdownPlayers) : new Set<number>();
  const totalPot = potSize(state);
  const streetBets = state.players.reduce((a, p) => a + p.streetCommitted, 0);
  const potBefore = state.complete ? totalPot : totalPot - streetBets;
  const toCall = state.toAct === hero ? Math.max(0, Math.min(state.currentBet - state.players[hero].streetCommitted, state.players[hero].stack)) : 0;
  const me = state.players[hero];
  // seat geometry: hero at the bottom, others evenly spaced clockwise
  const geo = (i: number) => {
    const rel = (i - hero + n) % n;
    const ang = Math.PI / 2 + (rel * 2 * Math.PI) / n;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    return {
      seat: { left: `${50 + 47 * cos}%`, top: `${50 + 47 * sin}%` },
      chip: { left: `${50 + 35 * cos}%`, top: `${50 + 31 * sin}%` },
      button: { left: `${50 + 33 * Math.cos(ang - 0.38)}%`, top: `${50 + 30 * Math.sin(ang - 0.38)}%` },
      low: sin > 0.35, // seat is in the lower part of the table: show cards above the plate
    };
  };
  return (
    <div className="table-wrap" aria-label="Poker table">
      <div className="felt">
        <div className="felt-line" aria-hidden="true" />
        <div className="table-center">
          <div className="pot-pill" aria-live="polite">
            <Term id="pot">Pot</Term> <strong data-testid="pot">{fmtBB(totalPot, bb)}</strong>
          </div>
          <div className="board" aria-label="Community cards">
            <CardRow cards={state.board} placeholders={5} size="md" fourColor={fourColor} />
          </div>
          <div className="pot-sub">
            {streetBets > 0 && !state.complete ? `${fmtBB(potBefore, bb)} in the middle + ${fmtBB(streetBets, bb)} bet this street` : '\u00a0'}
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
          const isTurn = state.toAct === i && !state.complete;
          const show = p.isHero || showdown.has(i) || revealAll;
          const prof = profiles[i];
          const cards =
            p.folded ? null : p.hole.length === 2 && show ? (
              <div className={`seat-cards ${p.isHero ? 'big' : ''}`}>
                <PlayingCard card={p.hole[0]} size={p.isHero ? 'lg' : 'sm'} fourColor={fourColor} />
                <PlayingCard card={p.hole[1]} size={p.isHero ? 'lg' : 'sm'} fourColor={fourColor} />
              </div>
            ) : (
              <div className="seat-cards backs" aria-hidden="true">
                <PlayingCard size="sm" />
                <PlayingCard size="sm" />
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
                  <span className="plate-pos">
                    {p.position}
                    {p.isHero ? ' · You' : prof && !p.folded ? <span className="plate-prof"> · {PROFILES[prof].short}</span> : null}
                  </span>
                  <span className="plate-stack">{p.allIn ? 'All-in' : fmtBB(p.stack, bb)}</span>
                </div>
                {!g.low && cards}
                {act && !state.complete && act.type === 'check' && <div className="seat-action">Check</div>}
                {showdown.has(i) && state.board.length === 5 && <div className="seat-showdown">{describeHolding(p.hole, state.board)}</div>}
              </div>
              {p.streetCommitted > 0 && !state.complete && (
                <div className={`bet-chip ${act?.type === 'raise' || act?.type === 'bet' ? 'agg' : ''}`} style={g.chip} aria-label={`${p.isHero ? 'Your' : p.position} bet this street: ${fmtBB(p.streetCommitted, bb)}`}>
                  <span className="chip-dot" aria-hidden="true" />
                  {act && (act.type === 'bet' || act.type === 'raise') ? `${ACTION_WORD[act.type]} ` : ''}
                  {fmtBB(p.streetCommitted, bb)}
                </div>
              )}
              {i === state.buttonIndex && (
                <div className="dealer-btn" style={g.button} title="Dealer button">
                  D
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="table-facts" aria-live="polite">
        {!state.complete && state.toAct === hero && (
          <span>
            <Term id="tocall">To call</Term> <strong data-testid="to-call">{fmtBB(toCall, bb)}</strong>
          </span>
        )}
        <span>
          <Term id="effective">Effective</Term> <strong>{fmtBB(effectiveStack(state, hero), bb)}</strong>
        </span>
        {me.hole.length === 2 && state.board.length >= 3 && (
          <span>
            You have <strong>{describeHolding(me.hole, state.board)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export function HistoryList({ state, hero }: { state: HandState; hero: number }) {
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
                const who = h.player === hero ? 'You' : state.players[h.player].position;
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
