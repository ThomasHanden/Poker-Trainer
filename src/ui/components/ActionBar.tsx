import { useEffect, useMemo, useState } from 'react';
import { HandState, legalActions, potFractionTo, PlayerAction, validateAction } from '../../engine/rules';
import { fmtBB } from './Table';
import { Term } from './Term';

const POT_PRESETS = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5];

export function ActionBar({ state, onAct, disabled }: { state: HandState; onAct: (a: PlayerAction) => void; disabled?: boolean }) {
  const la = legalActions(state);
  const bb = state.config.bb;
  const canSize = !!la && (la.canBet || la.canRaise);
  const [amountBB, setAmountBB] = useState<string>('');
  const [sizingOpen, setSizingOpen] = useState(false);
  const me = la ? state.players[la.player] : undefined;

  const defaultTo = useMemo(() => {
    if (!la || !canSize) return 0;
    if (state.street === 'preflop') {
      const t = la.canRaise && state.currentBet <= bb ? Math.round(2.5 * bb) : Math.round(state.currentBet * 3);
      return Math.max(la.minTo, Math.min(la.maxTo, t));
    }
    return potFractionTo(state, 0.66);
  }, [state, la, canSize, bb]);

  useEffect(() => {
    setAmountBB(defaultTo ? String(+(defaultTo / bb).toFixed(2)) : '');
    setSizingOpen(false);
  }, [defaultTo, bb, state.history.length]);

  const toChips = Math.round(parseFloat(amountBB || '0') * bb);
  const verb = la?.canBet ? 'Bet' : 'Raise to';
  const err = canSize && la ? (Number.isFinite(toChips) ? validateAction(state, { type: la.canBet ? 'bet' : 'raise', to: toChips }) : 'Enter an amount') : null;

  useEffect(() => {
    if (!la || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        if (e.key === 'Enter' && t.getAttribute('data-amount') === '1' && !err) {
          e.preventDefault();
          onAct({ type: la.canBet ? 'bet' : 'raise', to: toChips });
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f' && la.canFold) onAct({ type: 'fold' });
      else if (k === 'c' || k === 'k') {
        if (la.canCheck) onAct({ type: 'check' });
        else if (la.canCall) onAct({ type: 'call' });
      } else if ((k === 'b' || k === 'r') && canSize) {
        setSizingOpen(true);
        setTimeout(() => document.getElementById('bet-amount')?.focus(), 0);
      } else if (k === 'a' && canSize) {
        setAmountBB(String(+(la.maxTo / bb).toFixed(2)));
        setSizingOpen(true);
      } else if (/^[1-7]$/.test(k) && canSize) {
        const f = POT_PRESETS[Number(k) - 1];
        setAmountBB(String(+(potFractionTo(state, f) / bb).toFixed(2)));
        setSizingOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [la, disabled, canSize, onAct, state, bb, toChips, err]);

  if (!la || !me) return null;
  const raiseBy = la.canRaise ? toChips - state.currentBet : 0;
  const pre = state.street === 'preflop';
  const pct = (to: number) => Math.round(100 * (la.canBet ? to / Math.max(1, la.pot) : (to - state.currentBet) / Math.max(1, la.pot + la.toCall)));
  // standard sizes: multiples of the current bet preflop, pot fractions after the flop
  const presets: { label: string; to: number; key?: string }[] = pre && la.canRaise
    ? (state.currentBet <= bb ? [2, 2.5, 3, 4] : [2.5, 3, 4]).map((m) => ({ label: `${m}x`, to: Math.round(state.currentBet * m) }))
    : POT_PRESETS.filter((f) => f !== 0.25).map((f) => ({ label: f === 1 ? 'Pot' : f === 1.5 ? '1.5×' : `${Math.round(f * 100)}%`, to: potFractionTo(state, f), key: String(POT_PRESETS.indexOf(f) + 1) }));
  const shown = presets.filter((p, i, arr) => p.to >= la.minTo && p.to < la.maxTo && arr.findIndex((q) => q.to === p.to) === i);
  const setTo = (to: number) => setAmountBB(String(+(Math.max(la.minTo, Math.min(la.maxTo, to)) / bb).toFixed(2)));
  const step = pre ? bb / 2 : Math.max(bb / 2, Math.round(la.pot / 20 / (bb / 2)) * (bb / 2));
  const valid = Number.isFinite(toChips);
  const allIn = valid && toChips === la.maxTo;

  return (
    <div className="action-bar" role="group" aria-label="Your actions">
      <div className="action-buttons">
        {la.canFold && (
          <button className="btn act fold" disabled={disabled} onClick={() => onAct({ type: 'fold' })}>
            <span className="act-label">Fold</span>
            <kbd>F</kbd>
          </button>
        )}
        {la.canCheck && (
          <button className="btn act check" disabled={disabled} onClick={() => onAct({ type: 'check' })}>
            <span className="act-label">Check</span>
            <kbd>C</kbd>
          </button>
        )}
        {la.canCall && (
          <button className="btn act call" disabled={disabled} onClick={() => onAct({ type: 'call' })}>
            <span className="act-label">
              Call <span className="act-amt">{fmtBB(la.toCall, bb)}</span>
              {la.toCall >= me.stack ? ' · all-in' : ''}
            </span>
            <kbd>C</kbd>
          </button>
        )}
        {canSize && (
          <button className={`btn act raise ${sizingOpen ? 'open' : ''}`} disabled={disabled} aria-expanded={sizingOpen} onClick={() => setSizingOpen((o) => !o)}>
            <span className="act-label">{la.canBet ? 'Bet' : 'Raise'}</span>
            <span className="act-caret" aria-hidden="true">{sizingOpen ? '▴' : '▾'}</span>
            <kbd>{la.canBet ? 'B' : 'R'}</kbd>
          </button>
        )}
      </div>
      {canSize && sizingOpen && (
        <div className="sizing" aria-label="Bet sizing">
          {la.shortAllInOnly ? (
            <p className="note">You cannot make a full raise: the only legal raise is all-in for {fmtBB(la.maxTo, bb)} (it may not reopen the betting).</p>
          ) : (
            <>
              <div className="size-readout" aria-live="polite">
                <span className="sr-verb">{la.canBet ? 'Bet' : <Term id="raiseto">Raise to</Term>}</span>
                <span className="sr-amt">{valid ? fmtBB(toChips, bb) : '—'}</span>
                <span className="sr-sub">
                  {allIn
                    ? 'All-in'
                    : !valid
                      ? ''
                      : pre && la.canRaise
                        ? `${+(toChips / state.currentBet).toFixed(2)}× the ${state.currentBet <= bb ? 'big blind' : 'current raise'}`
                        : `${pct(toChips)}% of the pot`}
                  {la.canRaise && valid && !allIn ? ` · ${fmtBB(raiseBy, bb)} more than the current bet` : ''}
                </span>
              </div>
              <div className="size-presets" role="group" aria-label="Standard sizes">
                {shown.map((p) => (
                  <button key={p.label} className={`size-preset ${valid && toChips === p.to ? 'on' : ''}`} title={p.key ? `Shortcut ${p.key}` : undefined} onClick={() => setTo(p.to)}>
                    {p.label}
                  </button>
                ))}
                <button className={`size-preset allin ${allIn ? 'on' : ''}`} onClick={() => setTo(la.maxTo)} title="Shortcut A">
                  All-in
                </button>
              </div>
              <div className="size-adjust">
                <button className="size-step" aria-label="Smaller" onClick={() => setTo((valid ? toChips : la.minTo) - step)} disabled={valid && toChips <= la.minTo}>
                  −
                </button>
                <input
                  type="range"
                  className="size-slider"
                  style={{ '--fill': `${valid ? (100 * (Math.min(la.maxTo, Math.max(la.minTo, toChips)) - la.minTo)) / Math.max(1, la.maxTo - la.minTo) : 0}%` } as React.CSSProperties}
                  aria-label="Amount slider"
                  min={la.minTo}
                  max={la.maxTo}
                  step={Math.max(1, Math.round(bb / 10))}
                  value={valid ? Math.min(la.maxTo, Math.max(la.minTo, toChips)) : la.minTo}
                  onChange={(e) => setAmountBB(String(+(Number(e.target.value) / bb).toFixed(2)))}
                />
                <button className="size-step" aria-label="Bigger" onClick={() => setTo((valid ? toChips : la.minTo) + step)} disabled={valid && toChips >= la.maxTo}>
                  +
                </button>
                <label className="size-input">
                  <span className="sr-only">{la.canBet ? 'Bet' : 'Raise to'} amount in big blinds</span>
                  <input
                    id="bet-amount"
                    data-amount="1"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={la.minTo / bb}
                    max={la.maxTo / bb}
                    value={amountBB}
                    onChange={(e) => setAmountBB(e.target.value)}
                    aria-invalid={!!err}
                    aria-describedby="sizing-help"
                  />
                  <span className="unit">bb</span>
                </label>
              </div>
            </>
          )}
          <p id="sizing-help" className="size-help">
            {err ? <span className="error">{err.replace(/\d+ \(to\)/, `${fmtBB(la.minTo, bb)}`)}</span> : <>Min {fmtBB(la.minTo, bb)} · Max {fmtBB(la.maxTo, bb)} (all-in)</>}
          </p>
          <div className="size-actions">
            <button className="btn ghost" onClick={() => setSizingOpen(false)}>
              Cancel
            </button>
            <button className="btn primary sizing-confirm" disabled={!!err || disabled} onClick={() => onAct({ type: la.canBet ? 'bet' : 'raise', to: toChips })}>
              {allIn ? `All-in ${fmtBB(toChips, bb)}` : `${verb} ${valid ? fmtBB(toChips, bb) : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
