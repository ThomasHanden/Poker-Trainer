// Settings: every preference in one place, for signed-in players (reached from the account menu).
// They are saved with the rest of your progress, with your account, so they follow you to every device.
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { useAuth } from '../../auth/AuthContext';
import { CardRow } from '../components/Card';
import { FeltPicker, useTablePrefs } from '../components/LiveExtras';
import { parseCards } from '../../engine/cards';
import { sounds } from '../sounds';
import type { PlaySpeed } from '../../persistence/storage';

const SAMPLE = parseCards('As Kh Qd Jc');
const SPEEDS: [PlaySpeed, string][] = [
  ['slow', 'Slow'],
  ['normal', 'Normal'],
  ['fast', 'Fast'],
];

export function SettingsPage() {
  const { status } = useAuth();
  if (status !== 'signed-in') {
    return (
      <div className="page settings-page">
        <header className="page-head">
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
        </header>
        <div className="set-group set-signin">
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
  const set = (p: Partial<typeof prefs>) => update((d) => ({ ...d, prefs: { ...d.prefs, ...p } }));
  const speed = prefs.playSpeed ?? 'normal';

  return (
    <div className="page settings-page">
      <header className="page-head">
        <p className="eyebrow">Preferences</p>
        <h1>Settings</h1>
        <p className="lead">Saved to your account, so they follow you to every device you sign in on. Changes apply straight away.</p>
      </header>

      <section className="set-group" aria-labelledby="set-cards">
        <h2 id="set-cards">Cards and table</h2>
        <div className="set-row">
          <div className="set-text">
            <label htmlFor="set-four">Four-colour deck</label>
            <p className="note">Each suit gets its own colour, so hearts and diamonds (and spades and clubs) are easier to tell apart at a glance.</p>
          </div>
          <div className="set-control">
            <input id="set-four" type="checkbox" checked={prefs.fourColor} onChange={(e) => set({ fourColor: e.target.checked })} />
          </div>
          <div className="set-preview" aria-hidden="true">
            <CardRow cards={SAMPLE} size="sm" fourColor={prefs.fourColor} />
          </div>
        </div>
        <div className="set-row">
          <div className="set-text">
            <span id="set-felt-label">Felt colour</span>
            <p className="note">The colour of the live tables.</p>
          </div>
          <div className="set-control">
            <FeltPicker value={table.felt} onChange={(felt) => setTable({ felt })} />
          </div>
        </div>
        <div className="set-row">
          <div className="set-text">
            <label htmlFor="set-bb">Show amounts in big blinds at live tables</label>
            <p className="note">Stacks, bets and pots as big blinds instead of chips. Practice always uses big blinds.</p>
          </div>
          <div className="set-control">
            <input id="set-bb" type="checkbox" checked={table.bb} onChange={(e) => setTable({ bb: e.target.checked })} />
          </div>
        </div>
      </section>

      <section className="set-group" aria-labelledby="set-sound">
        <h2 id="set-sound">Sound</h2>
        <div className="set-row">
          <div className="set-text">
            <label htmlFor="set-sound-on">Table sounds</label>
            <p className="note">A chime when it is your turn, chips for bets, and a few notes when you win a pot.</p>
          </div>
          <div className="set-control">
            <input id="set-sound-on" type="checkbox" checked={table.sound} onChange={(e) => setTable({ sound: e.target.checked })} />
            <button
              className="btn small"
              disabled={!table.sound}
              onClick={() => sounds.turn()}
            >
              Play a test sound
            </button>
          </div>
        </div>
      </section>

      <section className="set-group" aria-labelledby="set-practice">
        <h2 id="set-practice">Practice</h2>
        <div className="set-row">
          <div className="set-text">
            <span id="set-speed-label">Playback speed</span>
            <p className="note">How quickly the other players’ actions play out before your decision.</p>
          </div>
          <div className="set-control">
            <div className="seg" role="radiogroup" aria-labelledby="set-speed-label">
              {SPEEDS.map(([v, label]) => (
                <button key={v} role="radio" aria-checked={speed === v} className={speed === v ? 'on' : ''} onClick={() => set({ playSpeed: v })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="set-row">
          <div className="set-text">
            <label htmlFor="set-fast">Fast mode</label>
            <p className="note">After a hand where every decision was good, show a short result and deal the next hand straight away. Mistakes always stop for a full review.</p>
          </div>
          <div className="set-control">
            <input id="set-fast" type="checkbox" checked={!!prefs.fastMode} onChange={(e) => set({ fastMode: e.target.checked })} />
          </div>
        </div>
        <p className="note set-more">
          What practice deals you (difficulty, positions, stack depths, opponents, help) is chosen on the <Link to="/practice">Practice</Link> page.
        </p>
      </section>

      <section className="set-group" aria-labelledby="set-keys">
        <h2 id="set-keys">Keyboard</h2>
        <div className="set-row">
          <div className="set-text">
            <label htmlFor="set-kbd">Show keyboard shortcut hints</label>
            <p className="note">
              The small letters on the action buttons: <kbd>F</kbd> fold, <kbd>C</kbd> check or call, <kbd>B</kbd> or <kbd>R</kbd> bet or raise. The shortcuts work either
              way.
            </p>
          </div>
          <div className="set-control">
            <input id="set-kbd" type="checkbox" checked={prefs.showShortcuts !== false} onChange={(e) => set({ showShortcuts: e.target.checked })} />
          </div>
        </div>
      </section>

      <section className="set-group" aria-labelledby="set-data">
        <h2 id="set-data">Your data</h2>
        <ul className="set-links">
          <li>
            <Link to="/progress">Progress</Link>: export your history, import a backup, or reset practice progress.
          </li>
          <li>
            <Link to="/play/history">Your live hands</Link>: download session logs, or delete your live hand history.
          </li>
          <li>
            <Link to="/account">Account</Link>: your name, signing out, and deleting your account.
          </li>
          <li>
            <Link to="/privacy">Privacy</Link>: what is stored, where, and how to delete it.
          </li>
        </ul>
      </section>
    </div>
  );
}
