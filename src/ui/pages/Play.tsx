import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Table, DecisionFacts, HistoryList, fmtBB } from '../components/Table';
import { ActionBar } from '../components/ActionBar';
import { PARTY_HOST, useLiveTable } from '../useLiveTable';
import { MAX_SEATS, NAME_MAX, START_STACK, BB } from '../../multiplayer/table';

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (i/l/1, o/0)

function newCode(): string {
  const r = new Uint32Array(6);
  crypto.getRandomValues(r);
  return Array.from(r, (x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

const cleanCode = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/.*\/play\//, '') // accept a pasted invite link
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 20);

function loadName(): string {
  try {
    return localStorage.getItem('live-name') ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem('live-name', name);
  } catch {
    /* name just isn't remembered */
  }
}

function NotConfigured() {
  return (
    <div className="banner warn" role="status">
      Live tables are not switched on for this site yet: the table server address (VITE_PARTY_HOST) is missing.
    </div>
  );
}

export function PlayLobbyPage() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = cleanCode(code);
    if (c) nav(`/play/${c}`);
  };
  return (
    <div className="page practice live">
      <header className="practice-head">
        <div className="ph-main">
          <h1 className="ph-title">Play live</h1>
          <p className="ph-sub">
            Free play-money tables with friends. Start a table, send the link, and up to {MAX_SEATS} people can sit down.
          </p>
        </div>
      </header>
      {!PARTY_HOST && <NotConfigured />}
      <div className="live-lobby">
        <section className="live-card">
          <h2>Start a table</h2>
          <p className="note">
            Everyone starts with {START_STACK / BB}bb, blinds 0.5/1. Busted players get a fresh stack.
          </p>
          <button className="btn primary big" onClick={() => nav(`/play/${newCode()}`)} disabled={!PARTY_HOST}>
            Start a new table
          </button>
        </section>
        <section className="live-card">
          <h2>Join a table</h2>
          <p className="note">Paste the invite link or type the table code.</p>
          <form className="row" onSubmit={join}>
            <label className="sr-only" htmlFor="table-code">
              Table code
            </label>
            <input id="table-code" className="live-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. k7m2qp" autoComplete="off" />
            <button className="btn" type="submit" disabled={!PARTY_HOST || !cleanCode(code)}>
              Join
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

/** Seconds left until a server time, updated twice a second. */
function useSecondsUntil(at: number | null, offset: number): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (at === null) return;
    const t = setInterval(() => setTick((k) => k + 1), 500);
    return () => clearInterval(t);
  }, [at]);
  return at === null ? null : Math.max(0, Math.ceil((at - (Date.now() + offset)) / 1000));
}

export function PlayTablePage() {
  const { room = '' } = useParams();
  const { data } = useStore();
  const { view, error, status, offset, sit, leave, start, act } = useLiveTable(room);
  const [name, setName] = useState(loadName);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const h = view?.hand ?? null;
  const me = view?.me ?? -1;
  const seated = !!view?.seats.some((s) => s.id === view.you);
  const live = !!h && !h.complete;
  const myTurn = live && me >= 0 && h!.toAct === me;
  const turnLeft = useSecondsUntil(view?.turnEndsAt ?? null, offset);
  const dealIn = useSecondsUntil(view?.nextHandAt ?? null, offset);
  const ready = view ? view.seats.filter((s) => !s.away).length : 0;

  // one action per turn: re-enable when the server sends the next state
  useEffect(() => setSent(false), [h?.history.length, view?.handNo]);

  const invite = `${location.origin}${location.pathname}#/play/${room}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the link is still shown */
    }
  };

  const sitDown = (e: FormEvent) => {
    e.preventDefault();
    saveName(name.trim());
    sit(name);
  };

  if (!PARTY_HOST)
    return (
      <div className="page practice live">
        <NotConfigured />
        <Link to="/play">Back to live tables</Link>
      </div>
    );

  const toActName = live ? h!.players[h!.toAct]?.name : '';
  const winners = h?.complete && h.result ? h.players.filter((p) => (h.result!.net[p.index] ?? 0) > 0) : [];

  return (
    <div className="page practice live">
      <header className="practice-head">
        <div className="ph-main">
          <h1 className="ph-title">Table {room}</h1>
          <div className="ph-chips">
            <span className={`pchip ${status === 'open' ? 'target' : 'muted'}`} role="status">
              {status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
            <span className="pchip muted">
              Blinds {fmtBB(1, BB)}/{fmtBB(BB, BB)}
            </span>
            {view?.seats.map((s) => (
              <span key={s.id} className={`pchip ${s.away ? 'muted' : ''}`}>
                {s.name}
                {s.id === view.you ? ' (you)' : ''} · {fmtBB(s.stack, BB)}
                {s.away ? ' · away' : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="ph-side live-invite">
          <button className="btn" onClick={copy}>
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          {seated && (
            <button className="btn ghost" onClick={leave}>
              Leave table
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="banner warn" role="alert">
          {error}
        </div>
      )}

      {view && !seated && (
        <section className="decision-panel live-sit">
          {view.seats.length >= view.maxSeats ? (
            <p>The table is full. You can watch until a seat opens.</p>
          ) : (
            <form className="row" onSubmit={sitDown}>
              <label htmlFor="live-name">Your name</label>
              <input id="live-name" className="live-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
              <button className="btn primary" type="submit">
                Sit down
              </button>
              {live && <span className="note">You will be dealt in from the next hand.</span>}
            </form>
          )}
        </section>
      )}

      {!view ? (
        <div className="loading" role="status">
          Connecting to the table…
        </div>
      ) : !h ? (
        <section className="decision-panel live-wait">
          <p>
            {view.seats.length < 2 ? 'Waiting for players. Send the invite link to a friend.' : `${view.seats.length} players seated.`}
          </p>
          {seated && (
            <button className="btn primary big" onClick={start} disabled={ready < 2}>
              Deal the first hand
            </button>
          )}
        </section>
      ) : (
        <div className="practice-body">
          <Table state={h} hero={me >= 0 ? me : 0} profiles={{}} fourColor={data.prefs.fourColor} showNames />
          <p className="live-status" aria-live="polite">
            {live
              ? myTurn
                ? `Your turn · ${turnLeft ?? ''}s`
                : `Waiting for ${toActName} · ${turnLeft ?? ''}s`
              : winners.length
                ? winners.map((p) => `${p.index === me ? 'You win' : `${p.name} wins`} the ${fmtBB(h.result!.payouts[p.index], BB)} pot`).join(' · ')
                : 'Hand over'}
            {!live && dealIn !== null && ` · Next hand in ${dealIn}s`}
          </p>
          {!live && dealIn === null && seated && ready >= 2 && (
            <p>
              <button className="btn primary" onClick={start}>
                Deal next hand
              </button>
            </p>
          )}
          {myTurn && (
            <section className="decision-panel" aria-label="Your decision">
              <DecisionFacts state={h} hero={me} />
              <ActionBar
                state={h}
                disabled={sent}
                onAct={(a) => {
                  setSent(true);
                  act(a);
                }}
              />
            </section>
          )}
          <HistoryList state={h} hero={me} showNames />
        </div>
      )}
    </div>
  );
}
