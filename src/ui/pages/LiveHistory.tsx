// Your live-table hands: stats, sessions, a replay of any hand and the session log to download.
// Kept in this browser (per account when signed in); see src/ui/liveHands.ts.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { HandReplay } from '../components/HandReplay';
import { clearLiveHands, liveStats, loadLiveHands, sessionText, sessions, type LiveHand, type Session } from '../liveHands';
import { fmtChips, tableLabel } from '../../multiplayer/table';
import { cardToString } from '../../engine/cards';

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const signed = (units: number) => `${units > 0 ? '+' : ''}${fmtChips(units)}`;
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function download(s: Session) {
  const blob = new Blob([sessionText(s)], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `felt-school-${s.room}-${new Date(s.start).toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function LiveHistoryPage() {
  const { data } = useStore();
  const [hands, setHands] = useState(loadLiveHands);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const all = useMemo(() => liveStats(hands), [hands]);
  const list = useMemo(() => sessions(hands), [hands]);
  const opened = hands.find((h) => h.id === open);

  return (
    <div className="page live-history-page">
      <header className="page-head">
        <p className="eyebrow">Live tables</p>
        <h1>Your live hands</h1>
        <p className="lead">Every live hand you played, as you saw it: your cards, and other players’ when they were shown. Replay any hand or download a session’s log.</p>
      </header>

      {hands.length === 0 ? (
        <div className="lh-empty">
          <p>No live hands yet. They appear here as you play.</p>
          <Link className="btn primary" to="/play">
            Play live
          </Link>
        </div>
      ) : (
        <>
          <StatRow stats={all} />
          {opened && (
            <section className="lh-replay" aria-label="Hand replay">
              <div className="row lh-replay-head">
                <h2>
                  Hand #{opened.handNo} · {tableLabel(opened.room)}
                </h2>
                <button className="btn small ghost" onClick={() => setOpen(null)}>
                  Close
                </button>
              </div>
              <HandReplay finalState={opened.hand} hero={opened.me} profiles={{}} fourColor={data.prefs.fourColor} decisions={[]} />
            </section>
          )}
          {list.map((s) => (
            <SessionCard key={`${s.room}:${s.start}`} s={s} onOpen={setOpen} openId={open} />
          ))}
          <p className="note lh-foot">
            Kept in this browser: the last 1,000 hands.{' '}
            {confirmClear ? (
              <>
                <button
                  className="linklike danger"
                  onClick={() => {
                    clearLiveHands();
                    setHands([]);
                    setConfirmClear(false);
                  }}
                >
                  Delete all live hands
                </button>{' '}
                <button className="linklike" onClick={() => setConfirmClear(false)}>
                  Keep them
                </button>
              </>
            ) : (
              <button className="linklike" onClick={() => setConfirmClear(true)}>
                Delete them…
              </button>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function StatRow({ stats }: { stats: ReturnType<typeof liveStats> }) {
  return (
    <dl className="lh-stats">
      <div>
        <dt>Hands</dt>
        <dd>{stats.hands}</dd>
      </div>
      <div>
        <dt>Won / lost</dt>
        <dd className={stats.net > 0 ? 'up' : stats.net < 0 ? 'down' : ''}>{signed(stats.net)}</dd>
      </div>
      <div>
        <dt title="Voluntarily put money in the pot preflop">VPIP</dt>
        <dd>{pct(stats.vpip)}</dd>
      </div>
      <div>
        <dt title="Raised preflop">PFR</dt>
        <dd>{pct(stats.pfr)}</dd>
      </div>
      <div>
        <dt>Biggest pot won</dt>
        <dd>{stats.biggest ? fmtChips(stats.biggest) : '—'}</dd>
      </div>
    </dl>
  );
}

function SessionCard({ s, onOpen, openId }: { s: Session; onOpen: (id: string) => void; openId: string | null }) {
  const st = liveStats(s.hands);
  return (
    <section className="live-card lh-session">
      <div className="lh-session-head">
        <div>
          <h2>{tableLabel(s.room)}</h2>
          <p className="note">
            {when(s.start)} – {new Date(s.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {s.hands.length} hand{s.hands.length === 1 ? '' : 's'} ·{' '}
            <span className={st.net > 0 ? 'up' : st.net < 0 ? 'down' : ''}>{signed(st.net)}</span> · VPIP {pct(st.vpip)} · PFR {pct(st.pfr)}
          </p>
        </div>
        <button className="btn small" onClick={() => download(s)}>
          Download log
        </button>
      </div>
      <details className="more">
        <summary>Hands</summary>
        <ul className="lh-hands">
          {[...s.hands].reverse().map((h) => (
            <HandRow key={h.id} h={h} onOpen={onOpen} open={openId === h.id} />
          ))}
        </ul>
      </details>
    </section>
  );
}

function HandRow({ h, onOpen, open }: { h: LiveHand; onOpen: (id: string) => void; open: boolean }) {
  const net = h.hand.result?.net[h.me] ?? 0;
  const hole = h.hand.players[h.me]?.hole ?? [];
  return (
    <li className={open ? 'on' : ''}>
      <span className="lh-cards">{hole.map(cardToString).join(' ')}</span>
      <span className="note">
        #{h.handNo} · {h.hand.players[h.me]?.position}
        {h.hand.bomb ? ' · bomb pot' : ''}
      </span>
      <span className={`lh-net ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>{signed(net)}</span>
      <button
        className="btn small ghost"
        onClick={() => {
          onOpen(h.id);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      >
        Replay
      </button>
    </li>
  );
}
