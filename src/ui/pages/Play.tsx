import { CSSProperties, FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Table, DecisionFacts, HistoryList, dealMs } from '../components/Table';
import { ActionBar, type AmountUnit } from '../components/ActionBar';
import { PARTY_HOST, fetchBankroll, rememberTable, tableInfoUrl, useLiveTable, type Bankroll } from '../useLiveTable';
import {
  CHIP,
  HIGH_PREFIX,
  HIGH_STAKES,
  LOW_STAKES,
  MAX_SEATS,
  NAME_MAX,
  PUBLIC_TABLES,
  TURN_MS,
  buyInFor,
  fmtChips,
  stakesFor,
  tableLabel,
  type TableSummary,
} from '../../multiplayer/table';
import { DAILY } from '../../multiplayer/bank';
import { legalActions, type HandState, type PlayerAction } from '../../engine/rules';
import { describeScore } from '../../engine/evaluator';

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (i/l/1, o/0)
const LOBBY_POLL_MS = 10_000;

/** Live tables type and show amounts in chips. */
const CHIPS: AmountUnit = { per: CHIP, fmt: fmtChips, short: '', name: 'chips' };

/** When balances refill, in the viewer's own time, e.g. "7:00 PM". */
const refillTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function BankLine({ bank }: { bank: Bankroll | null }) {
  if (!bank) return null;
  return (
    <p className="live-bank">
      <span>
        Your chips: <strong>{fmtChips(bank.balance)}</strong>
      </span>
      <span className="note">
        Topped up to {fmtChips(DAILY)} at {refillTime(bank.refillsAt)} each day
      </span>
    </p>
  );
}

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
  const [bank, setBank] = useState<Bankroll | null>(null);
  useEffect(() => {
    if (!PARTY_HOST) return;
    // check again shortly after arriving: a stack you just left with may still be on its way back
    const load = () => !document.hidden && fetchBankroll().then((b) => b && setBank(b));
    load();
    const soon = setTimeout(load, 1500);
    const t = setInterval(load, LOBBY_POLL_MS);
    return () => {
      clearTimeout(soon);
      clearInterval(t);
    };
  }, []);
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
            Free play-money No-Limit Hold’em against real people. You get {fmtChips(DAILY)} chips a day. Each table has a minimum and maximum buy-in, and you choose how much
            to bring; your stack comes back to you when you leave. Run out, and you are done until tomorrow.
          </p>
        </div>
      </header>
      {!PARTY_HOST && <NotConfigured />}
      <BankLine bank={bank} />
      <section className="live-card live-public" aria-labelledby="pub-title">
        <h2 id="pub-title">Public tables</h2>
        <p className="note">Open to anyone. Hands start on their own once two players sit down.</p>
        <ul className="live-tables">
          {PUBLIC_TABLES.map((room) => {
            const s = tables[room];
            const full = !!s && s.players >= s.maxSeats;
            const buyIn = buyInFor(stakesFor(room));
            return (
              <li key={room}>
                <span className="lt-name">{tableLabel(room)}</span>
                <span className="lt-count note">
                  Buy-in {fmtChips(buyIn.min)}–{fmtChips(buyIn.max)} · {s === undefined ? '…' : s === null ? 'unavailable' : `${s.players}/${s.maxSeats} seated${s.playing ? ' · in a hand' : ''}`}
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
          <div className="row">
            <button className="btn primary" onClick={() => nav(`/play/${newCode()}`)} disabled={!PARTY_HOST}>
              Start {LOW_STAKES.label} table
            </button>
            <button className="btn primary" onClick={() => nav(`/play/${HIGH_PREFIX}${newCode()}`)} disabled={!PARTY_HOST}>
              Start {HIGH_STAKES.label} table
            </button>
          </div>
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

/** Who won each pot and with what, e.g. "Bob wins 12 with two pair, kings and fours". */
function resultLines(h: HandState, me: number): string[] {
  const r = h.result!;
  const who = (i: number) => (i === me ? 'You' : h.players[i].name);
  const wins = (i: number) => (i === me ? 'win' : 'wins');
  if (r.reason === 'fold') {
    const w = r.pots[0].winners[0];
    const total = r.pots.reduce((a, pot) => a + pot.amount, 0);
    return [`${who(w)} ${wins(w)} ${fmtChips(total)}. Everyone else folded.`];
  }
  // a pot only one player could win is an uncalled bet coming back, not a win
  const pots = r.pots.filter((pot) => pot.eligible.length > 1);
  return pots.map((pot, k) => {
    const label = pots.length > 1 ? (k === 0 ? 'Main pot: ' : `Side pot${pots.length > 2 ? ` ${k}` : ''}: `) : '';
    const hand = pot.score !== undefined ? ` with ${describeScore(pot.score).toLowerCase()}` : '';
    if (pot.winners.length > 1) {
      const names = pot.winners.map((i) => (i === me ? 'you' : h.players[i].name));
      return `${label}${fmtChips(pot.amount)} split between ${names.join(' and ')}${hand}.`;
    }
    const w = pot.winners[0];
    return `${label}${who(w)} ${wins(w)} ${fmtChips(pot.amount)}${hand}.`;
  });
}

type PreAction = 'checkfold' | 'callany';

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
  const { view, bank, error, status, offset, sit, leave, start, act } = useLiveTable(room);
  const stakes = view?.stakes ?? stakesFor(room);
  const buyIn = buyInFor(stakes);
  // buy-in choice, in whole chips: from the table minimum up to its maximum or what you have, whichever is less
  const canBuyIn = !bank || bank.balance >= buyIn.min;
  const minChips = buyIn.min / CHIP;
  const maxChips = Math.floor((bank ? Math.min(buyIn.max, bank.balance) : buyIn.max) / CHIP);
  const [buyChips, setBuyChips] = useState<number | ''>(maxChips);
  useEffect(() => setBuyChips(maxChips), [maxChips]);
  const buyValid = typeof buyChips === 'number' && Number.isInteger(buyChips) && buyChips >= minChips && buyChips <= maxChips;
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
  // before the first hand there is nothing to show on the felt; after one, the last hand stays up
  const waiting = !!view && !h;

  // one action per turn: re-enable when the server sends the next state
  useEffect(() => setSent(false), [h?.history.length, view?.handNo]);

  const seated = !!mySeat;
  useEffect(() => {
    if (seated) rememberTable(room);
  }, [seated, room]);

  // pre-actions: chosen while waiting, played as soon as it is your turn; cleared each street
  const [pre, setPre] = useState<PreAction | null>(null);
  useEffect(() => setPre(null), [h?.street, view?.handNo]);
  const myPlayer = h && me >= 0 ? h.players[me] : null;
  const canPre = live && !!myPlayer && !myPlayer.folded && !myPlayer.allIn && !myTurn;

  // let the cards go out before showing the action buttons
  const [dealing, setDealing] = useState(false);
  const players = h?.players.length ?? 0;
  useEffect(() => {
    if (!view?.handNo || !players) return;
    setDealing(true);
    const t = setTimeout(() => setDealing(false), dealMs(players));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.handNo]);

  useEffect(() => {
    if (!myTurn || dealing || sent || !pre || !h) return;
    const la = legalActions(h);
    if (!la) return;
    const a: PlayerAction = la.canCheck ? { type: 'check' } : { type: pre === 'checkfold' ? 'fold' : 'call' };
    setPre(null);
    setSent(true);
    act(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, dealing, sent, pre]);

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
    if (!buyValid) return;
    saveName(name.trim());
    sit(name, (buyChips as number) * CHIP);
  };

  if (!PARTY_HOST)
    return (
      <div className="page practice live">
        <NotConfigured />
        <Link to="/play">Back to live tables</Link>
      </div>
    );

  const toActName = live ? h!.players[h!.toAct]?.name : '';
  const results = h?.complete && h.result ? resultLines(h, me) : [];
  const busted = !!h?.complete && !!myPlayer && myPlayer.stack === 0;

  return (
    <div className={`page practice live ${(myTurn && !dealing) || canPre ? 'has-dock' : ''}`}>
      <header className="practice-head">
        <div className="ph-main">
          <h1 className="ph-title">{tableLabel(room)}</h1>
          <div className="ph-chips">
            <span className={`pchip ${status === 'open' ? 'target' : 'muted'}`} role="status">
              {status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
            <span className="pchip muted">Blinds {stakes.label}</span>
            {bank && <span className="pchip muted">Your chips: {fmtChips(bank.balance)}</span>}
            {view?.seats.map((s) => (
              <span key={s.id} className={`pchip ${s.away || s.leaving ? 'muted' : ''}`}>
                {s.name}
                {s.id === view.you ? ' (you)' : ''} · {fmtChips(s.stack)}
                {s.leaving ? ' · leaving' : s.away ? ' · away' : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="ph-side live-invite">
          <button className="btn" onClick={copy}>
            {copied ? (
              'Copied'
            ) : (
              <>
                <span className="long">Copy invite link</span>
                <span className="short">Invite</span>
              </>
            )}
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              if (mySeat) leave();
              nav('/play');
            }}
          >
            {mySeat ? (
              <>
                <span className="long">Leave table</span>
                <span className="short">Leave</span>
              </>
            ) : (
              <>
                <span className="long">Back to lobby</span>
                <span className="short">Lobby</span>
              </>
            )}
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
          ) : !canBuyIn ? (
            <p>
              You are out of chips for today: this table needs at least {fmtChips(buyIn.min)} and you have {fmtChips(bank!.balance)}. You get topped up to {fmtChips(DAILY)} at{' '}
              {refillTime(bank!.refillsAt)}.
            </p>
          ) : (
            <form className="live-buyin" onSubmit={sitDown}>
              <div className="row">
                <label htmlFor="live-name">Your name</label>
                <input id="live-name" className="live-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
              </div>
              <div className="row live-buyin-row">
                <label htmlFor="buyin-amount">Buy-in</label>
                <button type="button" className={`btn small ${buyChips === minChips ? 'primary' : ''}`} onClick={() => setBuyChips(minChips)}>
                  Min {minChips}
                </button>
                <input
                  type="range"
                  className="size-slider"
                  aria-label="Buy-in amount"
                  min={minChips}
                  max={maxChips}
                  step={1}
                  value={buyValid ? buyChips : maxChips}
                  style={{ '--fill': `${maxChips > minChips && buyValid ? (100 * ((buyChips as number) - minChips)) / (maxChips - minChips) : 100}%` } as CSSProperties}
                  onChange={(e) => setBuyChips(Number(e.target.value))}
                />
                <button type="button" className={`btn small ${buyChips === maxChips ? 'primary' : ''}`} onClick={() => setBuyChips(maxChips)}>
                  Max {maxChips}
                </button>
                <input
                  id="buyin-amount"
                  className="live-input live-amt"
                  type="number"
                  inputMode="numeric"
                  min={minChips}
                  max={maxChips}
                  step={1}
                  value={buyChips}
                  aria-invalid={!buyValid}
                  onChange={(e) => setBuyChips(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div className="row">
                <button className="btn primary" type="submit" disabled={!buyValid}>
                  Sit down with {buyValid ? buyChips : '…'} chips
                </button>
                <span className="note">
                  {buyValid ? '' : `Choose between ${minChips} and ${maxChips}. `}
                  {bank ? `You have ${fmtChips(bank.balance)} chips. ` : ''}
                  {live ? 'You will be dealt in from the next hand.' : ''}
                </span>
              </div>
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
          <Table
            state={h!}
            hero={me >= 0 ? me : 0}
            profiles={{}}
            fourColor={data.prefs.fourColor}
            showNames
            handKey={view.handNo}
            live
            turnEndsAt={view.turnEndsAt === null || dealing ? null : view.turnEndsAt - offset}
            turnMs={TURN_MS}
            money={fmtChips}
          />
          <p className="live-status" aria-live="polite">
            {live && dealing
              ? 'Dealing…'
              : live
              ? myTurn
                ? `Your turn · ${turnLeft ?? ''}s`
                : `Waiting for ${toActName} · ${turnLeft ?? ''}s`
              : results.length
                ? results.map((line) => (
                    <span key={line} className="live-result">
                      {line}
                    </span>
                  ))
                : 'Hand over'}
            {!live && dealIn !== null && <span className="live-next">Next hand in {dealIn}s</span>}
            {!live && ready < 2 && (
              <span className="live-next">
                {view.autoDeal ? 'Waiting for another player to sit down.' : 'Waiting for another player. Send the invite link to a friend.'}
              </span>
            )}
          </p>
          {busted && (
            <p className="note live-bust">
              {canBuyIn
                ? `You lost your stack. Buy in again above (${fmtChips(buyIn.min)}–${fmtChips(buyIn.max)}); you have ${fmtChips(bank?.balance ?? 0)} chips left today.`
                : `You lost your stack, and that is your chips for today. More at ${bank ? refillTime(bank.refillsAt) : 'midnight'}.`}
            </p>
          )}
          {canPre && (
            <div className="live-pre live-dock" role="group" aria-label="Act in advance">
              <span className="note">While you wait:</span>
              {(
                [
                  ['checkfold', 'Check / Fold'],
                  ['callany', 'Call any'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={`btn small ${pre === k ? 'primary' : ''}`} aria-pressed={pre === k} onClick={() => setPre(pre === k ? null : k)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {myTurn && !dealing && (
            <section className="decision-panel live-dock" aria-label="Your decision">
              <DecisionFacts state={h!} hero={me} money={fmtChips} />
              <ActionBar
                unit={CHIPS}
                state={h!}
                disabled={sent}
                onAct={(a) => {
                  setSent(true);
                  act(a);
                }}
              />
            </section>
          )}
          <details className="more live-history">
            <summary>Hand history</summary>
            <HistoryList state={h!} hero={me} showNames money={fmtChips} />
          </details>
        </div>
      )}
    </div>
  );
}
