// Settings: every preference in one place, for signed-in players (reached from the account menu).
// They are saved with the rest of your progress, with your account, so they follow you to every device.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { useAuth } from '../../auth/AuthContext';
import { CardRow } from '../components/Card';
import { FELTS, useTablePrefs } from '../components/LiveExtras';
import { parseCards } from '../../engine/cards';
import { DEFAULT_VOLUME, sounds } from '../sounds';
import type { AppData, PlaySpeed } from '../../persistence/storage';

const SAMPLE = parseCards('As Kh Qd Jc');
const SPEEDS: [PlaySpeed, string][] = [
  ['slow', 'Slow'],
  ['normal', 'Normal'],
  ['fast', 'Fast'],
];
/** What "Reset to defaults" puts back. */
const DEFAULTS: Partial<AppData['prefs']> = { fourColor: false, showShortcuts: true, fastMode: false, playSpeed: 'normal', sound: true, volume: DEFAULT_VOLUME, amountsBB: false, felt: 'green' };

export function SettingsPage() {
  const { status } = useAuth();
  if (status !== 'signed-in') {
    return (
      <div className="page settings-page">
        <h1 className="set-title">Settings</h1>
        <div className="set-card set-signin">
          {status === 'loading' ? (
            <p className="note">Checking your sign-in…</p>
          ) : status === 'off' ? (
            <p>Settings need an account, and accounts are not available on this site right now.</p>
          ) : (
            <>
              <p>
                <strong>Sign in to change your settings.</strong> They are saved with your account, so they follow you to every device.
              </p>
              <Link className="btn primary" to="/login?next=%2Fsettings">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }
  return <Settings />;
}

function Settings() {
  const { data, update } = useStore();
  const [table, setTable] = useTablePrefs();
  const prefs = data.prefs;
  const speed = prefs.playSpeed ?? 'normal';
  const volume = prefs.volume ?? DEFAULT_VOLUME;

  // a short "Saved" after each change
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flash = () => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = (p: Partial<AppData['prefs']>) => {
    update((d) => ({ ...d, prefs: { ...d.prefs, ...p } }));
    flash();
  };
  const setT = (p: Parameters<typeof setTable>[0]) => {
    setTable(p);
    flash();
  };
  const isDefault = Object.entries(DEFAULTS).every(([k, v]) => (prefs[k as keyof typeof prefs] ?? DEFAULTS[k as keyof typeof DEFAULTS]) === v);

  return (
    <div className="page settings-page">
      <div className="set-top">
        <h1 className="set-title">Settings</h1>
        <span className={`set-saved ${saved ? 'on' : ''}`} role="status" aria-live="polite">
          {saved ? '✓ Saved' : 'Saved to your account'}
        </span>
      </div>

      <section className="set-card" aria-labelledby="set-look">
        <h2 id="set-look">Look</h2>
        {/* what the table looks like with these choices */}
        <div className={`set-preview felt-${table.felt}`} aria-hidden="true">
          <CardRow cards={SAMPLE} size="sm" fourColor={prefs.fourColor} />
          <span className="set-preview-stack">Stack {table.bb ? '62.5bb' : '125'}</span>
        </div>
        <Row label="Four-colour deck" hint="A colour for each suit." id="four">
          <Switch id="four" on={prefs.fourColor} onChange={(fourColor) => set({ fourColor })} />
        </Row>
        <Row label="Felt" id="felt">
          <div className="set-felts" role="radiogroup" aria-labelledby="set-felt">
            {FELTS.map(([f, label]) => (
              <button key={f} type="button" role="radio" aria-checked={table.felt === f} className={`swatch felt-${f}`} title={label} onClick={() => setT({ felt: f })}>
                <span className="sr-only">{label}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row label="Live amounts in big blinds" hint="Instead of chips." id="bb">
          <Switch id="bb" on={table.bb} onChange={(bb) => setT({ bb })} />
        </Row>
      </section>

      <section className="set-card" aria-labelledby="set-play">
        <h2 id="set-play">Play</h2>
        <Row label="Sounds" hint="Your turn, bets and wins." id="sound">
          <Switch id="sound" on={table.sound} onChange={(sound) => setT({ sound })} />
        </Row>
        {table.sound && (
          <Row label="Volume" id="volume" sub>
            <div className="set-volume">
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.1}
                value={volume}
                aria-labelledby="set-volume"
                onChange={(e) => set({ volume: Number(e.target.value) })}
                onPointerUp={() => sounds.turn()}
                onKeyUp={() => sounds.turn()}
              />
              <button className="btn small ghost" onClick={() => sounds.turn()} aria-label="Play a test sound" title="Play a test sound">
                ▶
              </button>
            </div>
          </Row>
        )}
        <Row label="Practice speed" hint="How fast other players act." id="speed">
          <div className="seg set-seg" role="radiogroup" aria-labelledby="set-speed">
            {SPEEDS.map(([v, label]) => (
              <button key={v} role="radio" aria-checked={speed === v} className={speed === v ? 'on' : ''} onClick={() => set({ playSpeed: v })}>
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Fast mode" hint="Skip the full review when every decision was good." id="fast">
          <Switch id="fast" on={!!prefs.fastMode} onChange={(fastMode) => set({ fastMode })} />
        </Row>
        <Row
          label="Shortcut hints"
          hint={
            <>
              Letters on action buttons, like <kbd>F</kbd> fold.
            </>
          }
          id="kbd"
        >
          <Switch id="kbd" on={prefs.showShortcuts !== false} onChange={(showShortcuts) => set({ showShortcuts })} />
        </Row>
      </section>

      <div className="set-foot">
        <button className="btn small ghost" disabled={isDefault} onClick={() => set(DEFAULTS)}>
          Reset to defaults
        </button>
        <nav className="set-links" aria-label="Your data">
          <Link to="/progress">Export or reset progress</Link>
          <Link to="/play/history">Live hand history</Link>
          <Link to="/account">Account</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </div>
    </div>
  );
}

/** One setting: its name (and a few words), then its control. */
function Row({ label, hint, id, sub = false, children }: { label: string; hint?: ReactNode; id: string; sub?: boolean; children: ReactNode }) {
  return (
    <div className={`set-row ${sub ? 'sub' : ''}`}>
      <div className="set-text">
        <span id={`set-${id}`} className="set-label">
          {label}
        </span>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

/** An on/off switch. */
function Switch({ id, on, onChange }: { id: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={`set-${id}`} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="switch-knob" aria-hidden="true" />
    </button>
  );
}
