// Your live-table hands: stats, recent hands to review with the trainer, and sessions with their
// logs to download. Kept in this browser (per account when signed in); see src/ui/liveHands.ts.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { CardRow } from '../components/Card';
import { clearLiveHands, liveStats, loadLiveHands, reviewedIds, sessionText, sessions, type LiveHand, type Session } from '../liveHands';
import { fmtChips, tableLabel } from '../../multiplayer/table';

const PAGE = 20;

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
  const [shownCount, setShownCount] = useState(PAGE);
  const [confirmClear, setConfirmClear] = useState(false);
  const all = useMemo(() => liveStats(hands), [hands]);
  const list = useMemo(() => sessions(hands), [hands]);
  const recent = useMemo(() => [...hands].sort((a, b) => b.at - a.at), [hands]);
  const reviewed = useMemo(() => reviewedIds(), [hands]);

  return (
    <div className="page live-history-page">
      <header className="page-head">
        <p className="eyebrow">Live tables</p>
        <h1>Your live hands</h1>
        <p className="lead">Every live hand you played, as you saw it: your cards, and other players’ when they were shown. Review any finished hand with the trainer, or download a session’s log.</p>
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
          <section className="live-card lh-recent" aria-labelledby="lh-recent-title">
            <h2 id="lh-recent-title">Recent hands</h2>
            <ul className="lh-hands">
              {recent.slice(0, shownCount).map((h) => (
                <HandRow key={h.id} h={h} reviewed={reviewed.has(h.id)} fourColor={data.prefs.fourColor} />
              ))}
            </ul>
            {recent.length > shownCount && (
              <button className="btn small" onClick={() => setShownCount((n) => n + PAGE)}>
                Show {Math.min(PAGE, recent.length - shownCount)} more
              </button>
            )}
          </section>
          <h2 className="lh-sessions-title">Sessions</h2>
          {list.map((s) => (
            <SessionCard key={`${s.room}:${s.start}`} s={s} />
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

function SessionCard({ s }: { s: Session }) {
  const st = liveStats(s.hands);
  return (
    <section className="live-card lh-session">
      <div className="lh-session-head">
        <div>
          <h3>{tableLabel(s.room)}</h3>
          <p className="note">
            {when(s.start)} – {new Date(s.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {s.hands.length} hand{s.hands.length === 1 ? '' : 's'} ·{' '}
            <span className={st.net > 0 ? 'up' : st.net < 0 ? 'down' : ''}>{signed(st.net)}</span> · VPIP {pct(st.vpip)} · PFR {pct(st.pfr)}
          </p>
        </div>
        <button className="btn small" onClick={() => download(s)}>
          Download log
        </button>
      </div>
    </section>
  );
}

/** One hand: your cards, seat, the board, how it went, whether you reviewed it, and the way in. */
export function HandRow({ h, reviewed, fourColor, newTab = false }: { h: LiveHand; reviewed: boolean; fourColor: boolean; newTab?: boolean }) {
  const net = h.hand.result?.net[h.me] ?? 0;
  const hole = h.hand.players[h.me]?.hole ?? [];
  const finished = !!h.hand.complete;
  return (
    <li>
      <CardRow cards={hole} size="sm" fourColor={fourColor} />
      <span className="lh-what">
        <span>
          {h.hand.players[h.me]?.position} · {h.hand.players.length} players{h.hand.bomb ? ' · bomb pot' : ''} · <span className="note">{when(h.at)}</span>
        </span>
        <span className="lh-board" aria-label="Board">
          {h.hand.board.length ? <CardRow cards={h.hand.board} size="sm" fourColor={fourColor} /> : <span className="note">No flop</span>}
        </span>
      </span>
      <span className={`lh-net ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>{signed(net)}</span>
      <span className="lh-review">
        {reviewed && <span className="tag">Reviewed</span>}
        {finished && (
          <Link className="btn small" to={`/play/history/${encodeURIComponent(h.id)}`} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}>
            {reviewed ? 'Open review' : 'Review with Trainer'}
          </Link>
        )}
      </span>
    </li>
  );
}
