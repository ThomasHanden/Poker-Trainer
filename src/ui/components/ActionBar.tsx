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
  const preflopMult = state.street === 'preflop' && la.canRaise ? [2, 2.5, 3, 4].map((m) => Math.round(state.currentBet * m)) : [];

  return (
    <div className="action-bar" role="group" aria-label="Your actions">
      <div className="action-buttons">
        {la.canFold && (
          <button className="btn act fold" disabled={disabled} onClick={() => onAct({ type: 'fold' })}>
            Fold <kbd>F</kbd>
          </button>
        )}
        {la.canCheck && (
          <button className="btn act check" disabled={disabled} onClick={() => onAct({ type: 'check' })}>
            Check <kbd>C</kbd>
          </button>
        )}
        {la.canCall && (
          <button className="btn act call" disabled={disabled} onClick={() => onAct({ type: 'call' })}>
            Call {fmtBB(la.toCall, bb)}
            {la.toCall >= me.stack ? ' (all-in)' : ''} <kbd>C</kbd>
          </button>
        )}
        {canSize && (
          <button className="btn act raise" disabled={disabled} aria-expanded={sizingOpen} onClick={() => setSizingOpen((o) => !o)}>
            {la.canBet ? 'Bet…' : 'Raise…'} <kbd>{la.canBet ? 'B' : 'R'}</kbd>
          </button>
        )}
      </div>
      {canSize && sizingOpen && (
        <div className="sizing" aria-label="Bet sizing">
          {la.shortAllInOnly ? (
            <p className="note">You cannot make a full raise: the only legal raise is all-in for {fmtBB(la.maxTo, bb)} (it may not reopen the betting).</p>
          ) : (
            <div className="presets">
              {preflopMult.map((to) =>
                to >= la.minTo && to <= la.maxTo ? (
                  <button key={`m${to}`} className="chip" onClick={() => setAmountBB(String(+(to / bb).toFixed(2)))}>
                    {+(to / state.currentBet).toFixed(1)}x
                  </button>
                ) : null,
              )}
              {POT_PRESETS.map((f, i) => {
                const to = potFractionTo(state, f);
                return (
                  <button key={f} className="chip" title={`Shortcut ${i + 1}`} onClick={() => setAmountBB(String(+(to / bb).toFixed(2)))}>
                    {Math.round(f * 100)}%
                  </button>
                );
              })}
              <button className="chip" onClick={() => setAmountBB(String(+(la.minTo / bb).toFixed(2)))}>
                Min
              </button>
              <button className="chip allin" onClick={() => setAmountBB(String(+(la.maxTo / bb).toFixed(2)))}>
                All-in <kbd>A</kbd>
              </button>
            </div>
          )}
          <div className="amount-row">
            <label htmlFor="bet-amount">
              {la.canBet ? 'Bet' : <Term id="raiseto">Raise to</Term>} (bb)
            </label>
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
            <input
              type="range"
              aria-label="Amount slider"
              min={la.minTo}
              max={la.maxTo}
              step={Math.max(1, Math.round(bb / 10))}
              value={Number.isFinite(toChips) ? Math.min(la.maxTo, Math.max(la.minTo, toChips)) : la.minTo}
              onChange={(e) => setAmountBB(String(+(Number(e.target.value) / bb).toFixed(2)))}
            />
            <button className="btn primary" disabled={!!err || disabled} onClick={() => onAct({ type: la.canBet ? 'bet' : 'raise', to: toChips })}>
              {verb} {Number.isFinite(toChips) ? fmtBB(toChips, bb) : ''}
              {toChips === la.maxTo ? ' (all-in)' : ''}
            </button>
          </div>
          <p id="sizing-help" className="note">
            {err ? (
              <span className="error">{err.replace(/\d+ \(to\)/, `${fmtBB(la.minTo, bb)}`)}</span>
            ) : la.canRaise ? (
              <>
                Raise <em>to</em> {fmtBB(toChips, bb)} = raise <em>by</em> {fmtBB(raiseBy, bb)} over the current bet of {fmtBB(state.currentBet, bb)}. Minimum: to {fmtBB(la.minTo, bb)}; maximum: {fmtBB(la.maxTo, bb)} (all-in). Pot % buttons use <Term id="potraise">call first, then raise by that share of the pot</Term>.
              </>
            ) : (
              <>
                {fmtBB(toChips, bb)} is {Math.round((100 * toChips) / Math.max(1, la.pot))}% of the {fmtBB(la.pot, bb)} pot. Minimum {fmtBB(la.minTo, bb)}; maximum {fmtBB(la.maxTo, bb)} (all-in).
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
