// Live-table extras: table settings (chosen when a private table is created, changed later by its
// host), the host's controls, the session ledger, quick reactions and this browser's table options
// (sound, amounts in chips or big blinds, felt colour).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { Felt } from '../../persistence/storage';
import {
  BOMB_BB,
  BOMB_EVERY,
  BOUNTY_BB,
  DOUBLE_BOARD,
  REACTIONS,
  TIME_BANK_MAX,
  TIME_BANK_PER_HAND,
  TIME_BANK_START,
  TURN_SECS,
  fmtChips,
  type LedgerLine,
  type SeatRequest,
  type SeatView,
  type TableSettings,
} from '../../multiplayer/table';

type Money = (units: number) => string;

// ---------------- settings ----------------

/** The settings menus, for a new private table and for its host later. */
export function SettingsFields({ value, onChange, idPrefix }: { value: TableSettings; onChange: (s: TableSettings) => void; idPrefix: string }) {
  const set = <K extends keyof TableSettings>(k: K, v: TableSettings[K]) => onChange({ ...value, [k]: v });
  const select = (k: 'turnSecs' | 'bounty72' | 'bombEvery' | 'bombBB' | 'doubleBoard', label: string, options: number[], text: (n: number) => string) => (
    <label className="ts-field" htmlFor={`${idPrefix}-${k}`}>
      <span>{label}</span>
      <select id={`${idPrefix}-${k}`} value={value[k]} onChange={(e) => set(k, Number(e.target.value))}>
        {options.map((n) => (
          <option key={n} value={n}>
            {text(n)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="ts-fields">
      {select('turnSecs', 'Time to act', TURN_SECS, (n) => `${n} seconds`)}
      {select('bounty72', '7-2 bounty', BOUNTY_BB, (n) => (n ? `${n} big blind${n === 1 ? '' : 's'} from each player` : 'Off'))}
      {select('bombEvery', 'Bomb pots', BOMB_EVERY, (n) => (n ? `Every ${n} hands` : 'Only when the host calls one'))}
      {select('bombBB', 'Bomb pot size', BOMB_BB, (n) => `${n} big blind${n === 1 ? '' : 's'} each`)}
      {select('doubleBoard', 'Double board', DOUBLE_BOARD, (n) => ['Off', 'In bomb pots', 'Every hand'][n])}
      <label className="ts-check">
        <input type="checkbox" checked={value.straddle} onChange={(e) => set('straddle', e.target.checked)} />
        <span>
          <strong>Straddles</strong> — players can choose to put in two big blinds when under the gun, and act last before the flop
        </span>
      </label>
      <label className="ts-check">
        <input type="checkbox" checked={value.runItTwice} onChange={(e) => set('runItTwice', e.target.checked)} />
        <span>
          <strong>Run it twice</strong> — when everyone is all-in, they can agree to deal the rest of the board twice, each run winning half
        </span>
      </label>
      <label className="ts-check">
        <input type="checkbox" checked={value.approval} onChange={(e) => set('approval', e.target.checked)} />
        <span>
          <strong>Approve players</strong> — new players ask you before they sit down
        </span>
      </label>
      <label className="ts-check">
        <input type="checkbox" checked={value.rabbitHunt} onChange={(e) => set('rabbitHunt', e.target.checked)} />
        <span>
          <strong>Rabbit hunting</strong> — after a hand ends early, anyone can see the cards that would have come
        </span>
      </label>
    </div>
  );
}

/** The table's rules in a sentence or two, for "About this table". */
export function describeSettings(s: TableSettings, bbChips: number): string {
  const parts = [
    `You have ${s.turnSecs} seconds to act, then your time bank: ${TIME_BANK_START / 1000} seconds to start, ${TIME_BANK_PER_HAND / 1000} more for each hand you are dealt (up to ${TIME_BANK_MAX / 1000}).`,
    s.rabbitHunt ? 'After a hand that ends early, anyone at the table can rabbit hunt.' : '',
    s.bounty72 ? `7-2 bounty: win a hand with 7-2 and show it to collect ${fmtChips(s.bounty72 * bbChips)} from everyone else dealt in.` : '',
    s.bombEvery ? `Every ${s.bombEvery}th hand is a bomb pot: everyone puts in ${fmtChips(s.bombBB * bbChips)} and the hand starts on the flop.` : '',
    s.straddle ? `Players can straddle ${fmtChips(2 * bbChips)} when under the gun.` : '',
    s.runItTwice ? 'When everyone is all-in, the players can agree to run it twice.' : '',
    s.doubleBoard === 2 ? 'Every hand is dealt two boards, each winning half the pot.' : s.doubleBoard === 1 ? 'Bomb pots are dealt two boards, each winning half the pot.' : '',
    s.approval ? 'The host lets new players in.' : '',
  ];
  return parts.filter(Boolean).join(' ');
}

// ---------------- the host ----------------

export function HostPanel({
  settings,
  paused,
  bombNext,
  requests,
  seats,
  you,
  money,
  on,
}: {
  settings: TableSettings;
  paused: boolean;
  bombNext: boolean;
  requests: SeatRequest[];
  seats: SeatView[];
  you: string;
  money: Money;
  on: {
    settings: (s: TableSettings) => void;
    pause: (p: boolean) => void;
    bomb: (b: boolean) => void;
    remove: (id: string) => void;
    approve: (id: string, ok: boolean) => void;
  };
}) {
  const [draft, setDraft] = useState<TableSettings | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const people = seats.filter((s) => !s.bot && s.id !== you);
  return (
    <section className="live-card host-panel" aria-labelledby="host-title">
      <div className="host-head">
        <h2 id="host-title">You’re the host</h2>
        <div className="row">
          <button className={`btn small ${paused ? 'primary' : ''}`} onClick={() => on.pause(!paused)} aria-pressed={paused}>
            {paused ? 'Resume the game' : 'Pause after this hand'}
          </button>
          <button className={`btn small ${bombNext ? 'primary' : ''}`} onClick={() => on.bomb(!bombNext)} aria-pressed={bombNext}>
            {bombNext ? 'Bomb pot next hand ✓' : 'Bomb pot next hand'}
          </button>
        </div>
      </div>
      {requests.length > 0 && (
        <div className="host-requests" role="group" aria-label="Players asking to sit">
          <h3>Asking to sit</h3>
          <ul>
            {requests.map((q) => (
              <li key={q.id}>
                <span>
                  <strong>{q.name}</strong> · seat {q.seat + 1} · {money(q.buyIn)}
                </span>
                <span className="row">
                  <button className="btn small primary" onClick={() => on.approve(q.id, true)}>
                    Let in
                  </button>
                  <button className="btn small" onClick={() => on.approve(q.id, false)}>
                    No
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {people.length > 0 && (
        <details className="more">
          <summary>Players</summary>
          <ul className="host-players">
            {people.map((s) => (
              <li key={s.id}>
                <span>
                  {s.name} · {money(s.stack)}
                  {s.away ? ' · away' : ''}
                </span>
                {confirm === s.id ? (
                  <span className="row">
                    <button
                      className="btn small danger"
                      onClick={() => {
                        on.remove(s.id);
                        setConfirm(null);
                      }}
                    >
                      Remove {s.name}
                    </button>
                    <button className="btn small ghost" onClick={() => setConfirm(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button className="btn small ghost" onClick={() => setConfirm(s.id)}>
                    Remove…
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="note">A removed player stands up after the hand they are in (their chips go back to their bank) and cannot sit at this table again.</p>
        </details>
      )}
      <details className="more" onToggle={(e) => (e.currentTarget.open ? setDraft(settings) : setDraft(null))}>
        <summary>Table settings</summary>
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              on.settings(draft);
            }}
          >
            <SettingsFields value={draft} onChange={setDraft} idPrefix="host" />
            <button className="btn small primary" type="submit" disabled={JSON.stringify(draft) === JSON.stringify(settings)}>
              Save settings
            </button>
          </form>
        )}
      </details>
    </section>
  );
}

// ---------------- the ledger ----------------

export function LedgerPanel({ lines, you, money }: { lines: LedgerLine[]; you: string; money: Money }) {
  const [copied, setCopied] = useState(false);
  if (!lines.length) return null;
  const sorted = [...lines].sort((a, b) => b.net - a.net);
  const copy = async () => {
    const text = ['Player · bought in · cashed out · at the table · net', ...sorted.map((l) => `${l.name} · ${fmtChips(l.buyIn)} · ${fmtChips(l.cashOut)} · ${fmtChips(l.stack)} · ${l.net >= 0 ? '+' : ''}${fmtChips(l.net)}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <details className="more live-history ledger">
      <summary>Session ledger</summary>
      <div className="ledger-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Bought in</th>
              <th scope="col">Cashed out</th>
              <th scope="col">At table</th>
              <th scope="col">Net</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.id} className={l.id === you ? 'me' : ''}>
                <th scope="row">{l.id === you ? `${l.name} (you)` : l.name}</th>
                <td>{money(l.buyIn)}</td>
                <td>{money(l.cashOut)}</td>
                <td>{money(l.stack)}</td>
                <td className={l.net > 0 ? 'up' : l.net < 0 ? 'down' : ''}>
                  {l.net > 0 ? '+' : ''}
                  {money(l.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Everyone who has sat here since the table opened. Bots are not listed.{' '}
        <button className="linklike" onClick={copy}>
          {copied ? 'Copied' : 'Copy the ledger'}
        </button>
      </p>
    </details>
  );
}

// ---------------- reactions ----------------

export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="react-bar" role="group" aria-label="React">
      {REACTIONS.map((e) => (
        <button key={e} type="button" onClick={() => onReact(e)} aria-label={`React ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}

// ---------------- table options (your preferences, also on the Settings page) ----------------

export const FELTS: [Felt, string][] = [
  ['green', 'Green'],
  ['blue', 'Blue'],
  ['red', 'Red'],
  ['charcoal', 'Charcoal'],
];

export interface TablePrefs {
  sound: boolean;
  /** show amounts in big blinds instead of chips */
  bb: boolean;
  felt: Felt;
}

/** The table options, read from and saved to your preferences (with your account when signed in). */
export function useTablePrefs(): [TablePrefs, (p: Partial<TablePrefs>) => void] {
  const { data, update } = useStore();
  const prefs: TablePrefs = { sound: data.prefs.sound !== false, bb: data.prefs.amountsBB === true, felt: data.prefs.felt ?? 'green' };
  const set = (p: Partial<TablePrefs>) =>
    update((d) => ({
      ...d,
      prefs: {
        ...d.prefs,
        ...(p.sound !== undefined ? { sound: p.sound } : {}),
        ...(p.bb !== undefined ? { amountsBB: p.bb } : {}),
        ...(p.felt !== undefined ? { felt: p.felt } : {}),
      },
    }));
  return [prefs, set];
}

export function FeltPicker({ value, onChange }: { value: Felt; onChange: (f: Felt) => void }) {
  return (
    <div className="felt-swatches" role="radiogroup" aria-label="Felt colour">
      {FELTS.map(([f, label]) => (
        <button key={f} type="button" role="radio" aria-checked={value === f} className={`swatch felt-${f}`} onClick={() => onChange(f)} title={label}>
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function TableOptions({ prefs, onChange }: { prefs: TablePrefs; onChange: (p: Partial<TablePrefs>) => void }) {
  return (
    <details className="more live-history table-options">
      <summary>Table options</summary>
      <div className="ts-fields">
        <label className="ts-check">
          <input type="checkbox" checked={prefs.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
          <span>Sounds (your turn, bets, wins)</span>
        </label>
        <label className="ts-check">
          <input type="checkbox" checked={prefs.bb} onChange={(e) => onChange({ bb: e.target.checked })} />
          <span>Show amounts in big blinds</span>
        </label>
        <div className="ts-field">
          <span>Felt</span>
          <FeltPicker value={prefs.felt} onChange={(felt) => onChange({ felt })} />
        </div>
      </div>
      <p className="note">
        Saved with your other preferences. <Link to="/settings">All settings</Link>
      </p>
    </details>
  );
}
