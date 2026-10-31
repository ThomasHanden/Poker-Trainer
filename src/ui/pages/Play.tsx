import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Table, DecisionFacts, HistoryList, dealMs, type Seating } from '../components/Table';
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
  isPublicTable,
  stakesFor,
  tableLabel,
  type Stakes,
  type TableSummary,
} from '../../multiplayer/table';
import { DAILY } from '../../multiplayer/bank';
import { isBotId } from '../../multiplayer/bots';
import { track, trackFirst, trackOnce, waitBucket } from '../analytics';
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

/** "1 player · 3 bots · in a hand". Bots are counted separately, never as players. */
function occupancy(s: TableSummary): string {
  const bots = s.bots ?? 0; // table servers from before bots leave it out
  if (!s.players && !bots) return 'empty';
  const parts = [`${s.players} ${s.players === 1 ? 'player' : 'players'}`];
  if (bots) parts.push(`${bots} ${bots === 1 ? 'bot' : 'bots'}`);
  if (s.playing) parts.push('in a hand');
  return parts.join(' · ');
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
            Free play-money No-Limit Hold’em against real people, with bots filling empty seats at public tables. You get {fmtChips(DAILY)} chips a day. Each table has a minimum and maximum buy-in, and you choose how much
            to bring; your stack comes back to you when you leave. Run out, and you are done until tomorrow.
          </p>
        </div>
      </header>
      {!PARTY_HOST && <NotConfigured />}
      <BankLine bank={bank} />
      <section className="live-card live-public" aria-labelledby="pub-title">
        <h2 id="pub-title">Public tables</h2>
        <p className="note">
          Open to anyone, and you never wait for a game: when you sit down, bots (marked <span className="bot-tag inline">Bot</span>) fill the empty seats and
          the first hand starts in a few seconds. Bots step aside between hands to make room for people.
        </p>
        <ul className="live-tables">
          {PUBLIC_TABLES.map((room) => {
            const s = tables[room];
            const full = !!s && s.players >= s.maxSeats;
            const buyIn = buyInFor(stakesFor(room));
            return (
              <li key={room}>
                <span className="lt-name">{tableLabel(room)}</span>
                <span className="lt-count note">
                  Buy-in {fmtChips(buyIn.min)}–{fmtChips(buyIn.max)} · {s === undefined ? '…' : s === null ? 'unavailable' : occupancy(s)}
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

/** A felt with no cards on it yet, for a table before its first hand. */
function emptyHand(stakes: Stakes): HandState {
  return {
    config: { format: 'cash', numPlayers: 0, sb: stakes.sb, bb: stakes.bb, ante: 0, anteType: 'none' },
    players: [],
    buttonIndex: -1,
    street: 'preflop',
    board: [],
    deck: [],
    currentBet: 0,
    minRaiseIncrement: stakes.bb,
    fullRaiseCount: 0,
    lastFullBetLevel: 0,
    toAct: -1,
    history: [],
    complete: false,
    lastAggressor: -1,
    preflopAggressor: -1,
  };
}

export function PlayTablePage() {
  const { room = '' } = useParams();
  const nav = useNavigate();
  const { data } = useStore();
  const { view, bank, error, status, offset, sit, leave, act } = useLiveTable(room);
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
  const kind = isPublicTable(room) ? 'public' : 'private';

  const h = view?.hand ?? null;
  const me = view?.me ?? -1;
  const holder = (slot: number) => view?.seats.find((s) => s.seat === slot);
  const mySeat = view?.seats.find((s) => s.id === view.you);
  const live = !!h && !h.complete;
  const myTurn = live && me >= 0 && h!.toAct === me;
  const turnLeft = useSecondsUntil(view?.turnEndsAt ?? null, offset);
  const dealIn = useSecondsUntil(view?.nextHandAt ?? null, offset);
  const ready = view ? view.seats.filter((s) => !s.away && !s.leaving).length : 0;

  // the seat you clicked: the buy-in window is open for it until you sit down (or start waiting) or cancel
  const [picking, setPicking] = useState<number | null>(null);
  const seated = !!mySeat;
  const waiting = view?.waiting ?? null;
  useEffect(() => {
    if (seated || waiting) {
      setPicking(null);
      rememberTable(room);
    }
  }, [seated, waiting, room]);

  // analytics: only for seats asked for on this page, so a reload does not count again
  const asked = useRef<{ at: number; bot: boolean } | null>(null);
  const dealtAfterAsking = useRef(false);
  useEffect(() => trackOnce(`open:${room}`, 'Live Table Opened', { table: kind }), [room, kind]);
  useEffect(() => {
    if (!seated || !asked.current) return;
    track('Seat Assigned', { table: kind, via: asked.current.bot ? 'bot seat' : 'open seat' });
    if (asked.current.bot) track('Bot Seat Replacement Completed', { table: kind, wait: waitBucket(Date.now() - asked.current.at) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seated]);
  const dealtIn = !!view?.hand && !view.hand.complete && view.me >= 0;
  useEffect(() => {
    if (!dealtIn || !asked.current || dealtAfterAsking.current) return;
    dealtAfterAsking.current = true;
    track('First Live Hand Dealt', { table: kind, wait: waitBucket(Date.now() - asked.current.at) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealtIn]);
  const finishedMine = !!view?.hand?.complete && view.me >= 0;
  useEffect(() => {
    if (finishedMine) trackFirst('First Live Hand Completed', { table: kind });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedMine]);
  useEffect(() => {
    if (picking === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);

  // one action per turn: re-enable when the server sends the next state
  useEffect(() => setSent(false), [h?.history.length, view?.handNo]);

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
    if (!buyValid || picking === null) return;
    saveName(name.trim());
    const bot = !!holder(picking)?.bot;
    if (!asked.current) {
      asked.current = { at: Date.now(), bot };
      track('Seat Requested', { table: kind, seat: bot ? 'bot seat' : 'open seat' });
    }
    sit(name, picking, (buyChips as number) * CHIP);
  };

  if (!PARTY_HOST)
    return (
      <div className="page practice live">
        <NotConfigured />
        <Link to="/play">Back to live tables</Link>
      </div>
    );

  const toActName = live ? h!.players[h!.toAct]?.name : '';
  const botToAct = live && isBotId(view?.handIds[h!.toAct] ?? '');
  const botTable = (view?.botSeats ?? 0) > 0;
  const results = h?.complete && h.result ? resultLines(h, me) : [];
  const busted = !!h?.complete && !!myPlayer && myPlayer.stack === 0;

  // Seats. Players in the hand are drawn in the seat they were dealt in; once a hand is over, anyone
  // who has since left is hidden. Seated players not in the hand shown wait in their seat.
  const slots = view?.maxSeats ?? MAX_SEATS;
  const handSeats = view?.handSeats ?? [];
  const handIds = view?.handIds ?? [];
  const slotOf = (i: number) => {
    const slot = handSeats[i];
    if (holder(slot)?.id === handIds[i]) return slot;
    // left mid-hand but still has cards (all-in): stays in view until the hand ends
    return live && h && !h.players[i].folded ? slot : -1;
  };
  const shown = new Set(h ? h.players.map((_, i) => (slotOf(i) >= 0 ? handIds[i] : '')) : []);
  const used = new Set([...(view?.seats.map((s) => s.seat) ?? []), ...(h ? h.players.map((_, i) => slotOf(i)) : [])]);
  const seating: Seating = {
    slots,
    viewSlot: mySeat?.seat ?? 0,
    slotOf,
    open: Array.from({ length: slots }, (_, slot) => slot)
      .filter((slot) => !used.has(slot))
      .map((slot) => ({ slot, onSit: mySeat || waiting ? undefined : () => setPicking(slot) })),
    idle: (view?.seats ?? [])
      .filter((s) => !shown.has(s.id))
      .map((s) => ({
        slot: s.seat,
        name: s.name,
        stack: s.stack,
        you: s.id === view?.you,
        note: s.reserved ? 'Leaving' : s.leaving ? 'Leaving' : s.away ? 'Away' : live ? 'Next hand' : 'Waiting',
        bot: s.bot,
      })),
    isBot: (i) => isBotId(handIds[i] ?? ''),
  };
  // the seat you clicked may be a bot's, which you can have; a person's (or one someone is waiting for) you cannot
  const picked = picking === null ? undefined : holder(picking);
  const pickedBot = picked?.bot ? picked : undefined;
  const pickedTaken = !!picked && (!picked.bot || picked.reserved) && !mySeat && !waiting;
  // with no open seat left, people can still take a bot's seat
  const botSeatsFree = !mySeat && !waiting && !seating.open.length ? (view?.seats ?? []).filter((s) => s.bot && !s.reserved) : [];
  const waitingFor = waiting ? holder(waiting.seat) : undefined;

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
              if (mySeat || waiting) leave();
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

      {error && picking === null && (
        <div className="banner warn" role="alert">
          {error}
        </div>
      )}

      {waiting && (
        <div className="banner info live-waiting" role="status">
          <span>
            You take seat {waiting.seat + 1}
            {waitingFor?.bot ? ` from ${waitingFor.name} (a bot)` : ''} as soon as this hand ends. Your {fmtChips(waiting.buyIn)} chips are set aside until then.
          </span>{' '}
          <button className="linklike" onClick={() => leave()}>
            Cancel
          </button>
        </div>
      )}

      {mySeat?.leaving && (
        <div className="banner warn" role="status">
          You missed two turns in a row, so you will stand up after this hand.{' '}
          <button className="linklike" onClick={() => sit(mySeat.name, mySeat.seat, 0)}>
            Stay seated
          </button>
        </div>
      )}

      {!view ? (
        <div className="loading" role="status">
          Connecting to the table…
        </div>
      ) : (
        <div className="practice-body">
          <Table
            state={h ?? emptyHand(stakes)}
            hero={me}
            profiles={{}}
            fourColor={data.prefs.fourColor}
            showNames
            handKey={view.handNo}
            live
            turnEndsAt={view.turnEndsAt === null || dealing || botToAct ? null : view.turnEndsAt - offset}
            turnMs={TURN_MS}
            money={fmtChips}
            seating={seating}
          />
          <p className="live-status" aria-live="polite">
            {live && dealing
              ? 'Dealing…'
              : live
                ? myTurn
                  ? `Your turn · ${turnLeft ?? ''}s`
                  : botToAct
                    ? `${toActName} (bot) is thinking…`
                    : `Waiting for ${toActName} · ${turnLeft ?? ''}s`
                : results.map((line) => (
                    <span key={line} className="live-result">
                      {line}
                    </span>
                  ))}
            {!live && dealIn !== null && <span className="live-next">{h ? 'Next hand' : 'First hand'} in {dealIn}s</span>}
            {!live && ready < 2 && !waiting && (
              <span className="live-next">
                {mySeat
                  ? 'Waiting for another player. The first hand starts as soon as someone sits down.'
                  : seating.open.length
                    ? botTable
                      ? 'Pick an open seat to play. Bots fill the other seats, so the first hand starts in a few seconds.'
                      : 'Pick an open seat to play.'
                    : 'The table is full.'}
              </span>
            )}
            {!mySeat && !waiting && (live || (ready >= 2 && dealIn !== null)) && (
              <span className="live-next">
                {seating.open.length
                  ? 'You are watching. Pick an open seat to join the next hand.'
                  : botSeatsFree.length
                    ? 'You are watching. Every seat is taken, but you can take a bot’s seat below.'
                    : 'You are watching. The table is full.'}
              </span>
            )}
          </p>
          {botSeatsFree.length > 0 && (
            <div className="live-takeover" role="group" aria-label="Take a bot’s seat">
              {botSeatsFree.map((s) => (
                <button key={s.seat} className="btn small" onClick={() => setPicking(s.seat)}>
                  Take seat {s.seat + 1} from {s.name}
                </button>
              ))}
            </div>
          )}
          {busted && (
            <p className="note live-bust">
              {canBuyIn
                ? `You lost your stack. Pick an open seat to buy in again; you have ${fmtChips(bank?.balance ?? 0)} chips left today.`
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
          {botTable && (
            <p className="note live-bots-note">
              <span className="bot-tag inline">Bot</span> seats are computer players using the practice styles (TAG, Nit, Station and others). They join only while
              someone is playing, see only their own cards, and give their seats to people between hands. Their chips are their own, never anyone’s bank.
            </p>
          )}
          {h && (
            <details className="more live-history">
              <summary>Hand history</summary>
              <HistoryList state={h} hero={me} showNames money={fmtChips} />
            </details>
          )}
        </div>
      )}

      {picking !== null && !mySeat && (
        <div className="live-modal" role="presentation" onClick={(e) => e.target === e.currentTarget && setPicking(null)}>
          <section className="live-modal-box live-sit" role="dialog" aria-modal="true" aria-labelledby="sit-title">
            <h2 id="sit-title">
              Take seat {picking + 1}
              {pickedBot ? ` from ${pickedBot.name}` : ''}
            </h2>
            {pickedTaken ? (
              <>
                <p>Someone just took that seat. Pick another one.</p>
                <button className="btn" onClick={() => setPicking(null)}>
                  Back to the table
                </button>
              </>
            ) : !canBuyIn ? (
              <>
                <p>
                  You are out of chips for today: this table needs at least {fmtChips(buyIn.min)} and you have {fmtChips(bank!.balance)}. You get topped up to {fmtChips(DAILY)} at{' '}
                  {refillTime(bank!.refillsAt)}.
                </p>
                <button className="btn" onClick={() => setPicking(null)}>
                  Back to the table
                </button>
              </>
            ) : (
              <form className="live-buyin" onSubmit={sitDown}>
                <p className="live-have">
                  You have <strong>{bank ? fmtChips(bank.balance) : '…'}</strong> chips
                </p>
                <div className="row">
                  <label htmlFor="live-name">Your name</label>
                  <input id="live-name" className="live-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="nickname" autoFocus={!name} />
                </div>
                <div className="live-buyin-row">
                  <label htmlFor="buyin-amount">Buy in for</label>
                  <span className="live-amt-box">
                    <input
                      id="buyin-amount"
                      type="number"
                      inputMode="numeric"
                      min={minChips}
                      max={maxChips}
                      step={1}
                      value={buyChips}
                      autoFocus={!!name}
                      aria-invalid={!buyValid}
                      aria-describedby="buyin-range"
                      onChange={(e) => setBuyChips(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    <span className="unit">chips</span>
                  </span>
                  <span className="live-quick">
                    <button type="button" className={`btn small ${buyChips === minChips ? 'primary' : ''}`} onClick={() => setBuyChips(minChips)}>
                      Min {minChips}
                    </button>
                    <button type="button" className={`btn small ${buyChips === maxChips ? 'primary' : ''}`} onClick={() => setBuyChips(maxChips)}>
                      Max {maxChips}
                    </button>
                  </span>
                </div>
                <input
                  type="range"
                  className="size-slider live-buyin-slider"
                  aria-label="Buy-in amount"
                  min={minChips}
                  max={maxChips}
                  step={1}
                  value={buyValid ? buyChips : maxChips}
                  style={{ '--fill': `${maxChips > minChips && buyValid ? (100 * ((buyChips as number) - minChips)) / (maxChips - minChips) : 100}%` } as CSSProperties}
                  onChange={(e) => setBuyChips(Number(e.target.value))}
                />
                <p id="buyin-range" className={`note live-range ${buyValid ? '' : 'bad'}`}>
                  {buyValid ? '' : `Type an amount from ${minChips} to ${maxChips}. `}
                  This table: {fmtChips(buyIn.min)}–{fmtChips(buyIn.max)} chips
                  {maxChips < buyIn.max / CHIP ? ` (you have ${fmtChips(bank!.balance)}, so up to ${maxChips})` : ''}.
                </p>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <div className="row">
                  <button className="btn primary" type="submit" disabled={!buyValid}>
                    Sit down with {buyValid ? buyChips : '…'} chips
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setPicking(null)}>
                    Cancel
                  </button>
                </div>
                {pickedBot ? (
                  <p className="note">
                    {live
                      ? `${pickedBot.name} is a bot. It plays out this hand with its own cards, then stands up and you sit down. Your chips are set aside until then, and you can cancel.`
                      : `${pickedBot.name} is a bot. It stands up and you sit down straight away.`}
                  </p>
                ) : (
                  live && <p className="note">You will be dealt in from the next hand.</p>
                )}
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
