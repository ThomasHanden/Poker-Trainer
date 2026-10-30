import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Table, DecisionFacts, HistoryList, fmtBB } from '../components/Table';
import { ActionBar } from '../components/ActionBar';
import { PARTY_HOST, tableInfoUrl, useLiveTable } from '../useLiveTable';
import { MAX_SEATS, NAME_MAX, START_STACK, BB, PUBLIC_TABLES, tableLabel, type TableSummary } from '../../multiplayer/table';

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (i/l/1, o/0)
const LOBBY_POLL_MS = 10_000;

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

/** How full each public table is, refreshed while the lobby is open and visible. */
function usePublicTables(): Record<string, TableSummary | null | undefined> {
  const [info, setInfo] = useState<Record<string, TableSummary | null>>({});
  useEffect(() => {
    if (!PARTY_HOST) return;
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      const rows = await Promise.all(
        PUBLIC_TABLES.map(async (room) => {
          try {
            const r = await fetch(tableInfoUrl(room));
            return [room, r.ok ? ((await r.json()) as TableSummary) : null] as const;
          } catch {
            return [room, null] as const;
          }
        }),
      );
      if (!stopped) setInfo(Object.fromEntries(rows));
    };
    load();
    const t = setInterval(load, LOBBY_POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);
  return info;
}

export function PlayLobbyPage() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const tables = usePublicTables();
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
            Free play-money poker against real people. Everyone starts with {START_STACK / BB}bb, blinds 0.5/1, and busted players get a fresh stack.
          </p>
        </div>
      </header>
      {!PARTY_HOST && <NotConfigured />}
      <section className="live-card live-public" aria-labelledby="pub-title">
        <h2 id="pub-title">Public tables</h2>
        <p className="note">Open to anyone. Hands start on their own once two players sit down.</p>
        <ul className="live-tables">
          {PUBLIC_TABLES.map((room) => {
            const s = tables[room];
            const full = !!s && s.players >= s.maxSeats;
            return (
              <li key={room}>
                <span className="lt-name">{tableLabel(room)}</span>
                <span className="lt-count note">
                  {s === undefined ? '…' : s === null ? 'unavailable' : `${s.players}/${s.maxSeats} seated${s.playing ? ' · in a hand' : ''}`}
                </span>
                <Link className={`btn small ${full ? '' : 'primary'}`} to={`/play/${room}`} aria-label={`${full ? 'Watch' : 'Join'} ${tableLabel(room)}`}>
                  {full ? 'Watch' : 'Join'}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <h2 className="live-subhead">Private tables</h2>
      <div className="live-lobby">
        <section className="live-card">
          <h3>Start a table</h3>
          <p className="note">Only people with the link can join. Up to {MAX_SEATS} players.</p>
          <button className="btn primary" onClick={() => nav(`/play/${newCode()}`)} disabled={!PARTY_HOST}>
            Start a private table
          </button>
        </section>
        <section className="live-card">
          <h3>Join a table</h3>
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
  const nav = useNavigate();
  const { data } = useStore();
  const { view, error, status, offset, sit, leave, start, act } = useLiveTable(room);
  const [name, setName] = useState(loadName);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const h = view?.hand ?? null;
  const me = view?.me ?? -1;
  const mySeat = view?.seats.find((s) => s.id === view.you);
  const live = !!h && !h.complete;
  const myTurn = live && me >= 0 && h!.toAct === me;
  const turnLeft = useSecondsUntil(view?.turnEndsAt ?? null, offset);
  const dealIn = useSecondsUntil(view?.nextHandAt ?? null, offset);
  const ready = view ? view.seats.filter((s) => !s.away && !s.leaving).length : 0;
  // between hands with fewer than two players there is nothing to show on the felt
  const waiting = !!view && !live && (!h || ready < 2);

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
          <h1 className="ph-title">{tableLabel(room)}</h1>
          <div className="ph-chips">
            <span className={`pchip ${status === 'open' ? 'target' : 'muted'}`} role="status">
              {status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
            <span className="pchip muted">
              Blinds {fmtBB(1, BB)}/{fmtBB(BB, BB)}
            </span>
            {view?.seats.map((s) => (
              <span key={s.id} className={`pchip ${s.away || s.leaving ? 'muted' : ''}`}>
                {s.name}
                {s.id === view.you ? ' (you)' : ''} · {fmtBB(s.stack, BB)}
                {s.leaving ? ' · leaving' : s.away ? ' · away' : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="ph-side live-invite">
          <button className="btn" onClick={copy}>
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              if (mySeat) leave();
              nav('/play');
            }}
          >
            {mySeat ? 'Leave table' : 'Back to lobby'}
          </button>
        </div>
      </header>

      {error && (
        <div className="banner warn" role="alert">
          {error}
        </div>
      )}

      {mySeat?.leaving && (
        <div className="banner warn" role="status">
          You missed two turns in a row, so you will stand up after this hand.{' '}
          <button className="linklike" onClick={() => sit(mySeat.name)}>
            Stay seated
          </button>
        </div>
      )}

      {view && !mySeat && (
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
      ) : waiting ? (
        <section className="decision-panel live-wait" aria-live="polite">
          {winners.length > 0 && (
            <p className="note">
              Last hand: {winners.map((p) => `${p.index === me ? 'you won' : `${p.name} won`} the ${fmtBB(h!.result!.payouts[p.index], BB)} pot`).join(', ')}.
            </p>
          )}
          {ready < 2 ? (
            <p>
              {view.seats.length === 0
                ? 'Nobody is seated yet.'
                : view.autoDeal
                  ? 'Waiting for one more player. The first hand starts as soon as someone sits down.'
                  : 'Waiting for another player. Send the invite link to a friend.'}
            </p>
          ) : dealIn !== null ? (
            <p>
              {ready} players seated. First hand in {dealIn}s.
            </p>
          ) : (
            <>
              <p>{ready} players seated.</p>
              {mySeat && (
                <button className="btn primary big" onClick={start}>
                  Deal the first hand
                </button>
              )}
            </>
          )}
        </section>
      ) : (
        <div className="practice-body">
          <Table state={h!} hero={me >= 0 ? me : 0} profiles={{}} fourColor={data.prefs.fourColor} showNames />
          <p className="live-status" aria-live="polite">
            {live
              ? myTurn
                ? `Your turn · ${turnLeft ?? ''}s`
                : `Waiting for ${toActName} · ${turnLeft ?? ''}s`
              : winners.length
                ? winners.map((p) => `${p.index === me ? 'You win' : `${p.name} wins`} the ${fmtBB(h!.result!.payouts[p.index], BB)} pot`).join(' · ')
                : 'Hand over'}
            {!live && dealIn !== null && ` · Next hand in ${dealIn}s`}
          </p>
          {myTurn && (
            <section className="decision-panel" aria-label="Your decision">
              <DecisionFacts state={h!} hero={me} />
              <ActionBar
                state={h!}
                disabled={sent}
                onAct={(a) => {
                  setSent(true);
                  act(a);
                }}
              />
            </section>
          )}
          <HistoryList state={h!} hero={me} showNames />
        </div>
      )}
    </div>
  );
}
