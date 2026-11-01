import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Table, HistoryList, dealMs, type Seating } from '../components/Table';
import { ActionBar, type AmountUnit } from '../components/ActionBar';
import { LiveChat, useMutes } from '../components/LiveChat';
import { PARTY_HOST, claimDailyChips, fetchBankroll, LOBBY_POLL_MS, occupancy, rememberTable, useLiveTable, usePublicTables, type Bankroll } from '../useLiveTable';
import {
  CHIP,
  HIGH_PREFIX,
  HIGH_STAKES,
  LOW_STAKES,
  MAX_SEATS,
  NAME_MAX,
  PUBLIC_TABLES,
  TURN_MS,
  affordableTables,
  buyInFor,
  fmtChips,
  isPublicTable,
  stakesFor,
  tableLabel,
  type Stakes,
  type TableSummary,
} from '../../multiplayer/table';
import { DAILY_MAX, DAILY_MIN, buyInAfterClaim, claimCovers as claimCoversTable, nextUtcMidnight } from '../../multiplayer/bank';
import { isBotId } from '../../multiplayer/bots';
import { useAuth } from '../../auth/AuthContext';
import { nameProblem } from '../../multiplayer/moderation';
import { track, trackFirst, trackOnce, waitBucket } from '../analytics';
import { legalActions, type HandState, type PlayerAction } from '../../engine/rules';
import { describeScore } from '../../engine/evaluator';

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (i/l/1, o/0)

/** Live tables type and show amounts in chips. */
const CHIPS: AmountUnit = { per: CHIP, fmt: fmtChips, short: '', name: 'chips' };

/** A time in the viewer's own clock, e.g. "7:00 PM". */
const localTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Your chips and the daily claim. The button only asks: the server picks the amount and allows one
 * claim per UTC day for this browser's player key, and a repeat request cannot pay twice.
 */
function Wallet({ bank, onBank, compact = false }: { bank: Bankroll | null; onBank: (b: Bankroll) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [got, setGot] = useState<number | null>(null);
  // a new day while the page is open: ask the server again when the next claim opens
  const reopensAt = bank?.claimedToday ? bank.nextClaimAt : null;
  useEffect(() => {
    if (reopensAt === null) return;
    const t = setTimeout(() => {
      setGot(null);
      fetchBankroll().then((b) => b && onBank(b));
    }, Math.max(1000, reopensAt - Date.now() + 1000));
    return () => clearTimeout(t);
  }, [reopensAt, onBank]);
  if (!bank) return null;
  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await claimDailyChips();
      onBank(r);
      setGot(r.amount);
      trackOnce(`claim:${r.claim?.day}`, 'Daily Chips Claimed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not claim your chips. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const resetNote = `Resets at midnight UTC (${localTime(bank.claimedToday ? bank.nextClaimAt : nextUtcMidnight(Date.now()))} your time).`;
  return (
    <section className={`live-wallet ${compact ? 'compact' : ''}`} aria-label="Your chips">
      <p className="live-bank">
        Your chips: <strong>{fmtChips(bank.balance)}</strong>
      </p>
      {bank.claimedToday === undefined ? null : bank.claimedToday ? (
        <div className="daily">
          <button className="btn" disabled>
            Claimed today
          </button>
          <p className="note" role="status">
            {got !== null && got > 0 ? (
              <span className="daily-got">+{fmtChips(got)} chips</span>
            ) : bank.claim?.amount ? (
              `You claimed ${fmtChips(bank.claim.amount)} chips today.`
            ) : (
              'Today’s chips are already in your balance.'
            )}{' '}
            Next claim at {localTime(bank.nextClaimAt)} your time (midnight UTC).
          </p>
        </div>
      ) : (
        <div className="daily">
          <button className="btn primary" onClick={claim} disabled={busy} aria-busy={busy}>
            {busy ? 'Claiming…' : 'Claim daily chips'}
          </button>
          <p className="note">
            Get {DAILY_MIN}–{DAILY_MAX} free chips each day. {resetNote}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
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

const CHAT_OPEN_KEY = 'live-chat-open';
const narrowScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* not remembered */
  }
}

function NotConfigured() {
  return (
    <div className="banner warn" role="status">
      Live tables are not switched on for this site yet: the table server address (VITE_PARTY_HOST) is missing.
    </div>
  );
}

/**
 * Not enough chips for this table: what you can do instead, with no pressure to win anything back.
 * Today's free chips if they are still to claim, a public table your chips cover (only one with a
 * seat for you), or practice, which uses no chips at all.
 */
function NotEnoughChips({ room, bank, onBank, tables, lost = false }: { room: string; bank: Bankroll; onBank: (b: Bankroll) => void; tables: Record<string, TableSummary | null | undefined>; lost?: boolean }) {
  const min = buyInFor(stakesFor(room)).min;
  const other = affordableTables(bank.balance, tables, room)[0];
  return (
    <div className="live-options" data-testid="chip-options">
      <p>
        {lost ? 'You are out of chips at this table. ' : ''}It needs at least {fmtChips(min)} chips to sit down, and you have {fmtChips(bank.balance)}.
      </p>
      {bank.claimedToday === false && <Wallet bank={bank} onBank={onBank} compact />}
      <div className="row">
        {other && (
          <Link className="btn primary" to={`/play/${other}`}>
            Join {tableLabel(other)}
          </Link>
        )}
        <Link className={`btn ${other ? '' : 'primary'}`} to="/practice?start=1">
          Practice without chips
        </Link>
      </div>
      {bank.claimedToday && <p className="note">Your next free chips: {localTime(bank.nextClaimAt)} your time.</p>}
    </div>
  );
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
            Free play-money No-Limit Hold’em against real people, with bots filling empty seats at public tables. Claim {DAILY_MIN}–{DAILY_MAX} free chips each day.
            Each table has a minimum and maximum buy-in, and you choose how much to bring; your stack comes back to you when you leave. Chips you win stay in
            your balance: it never resets.
          </p>
        </div>
      </header>
      {!PARTY_HOST && <NotConfigured />}
      <Wallet bank={bank} onBank={setBank} />
      <section className="live-card live-public" aria-labelledby="pub-title">
        <h2 id="pub-title">Public tables</h2>
        <p className="note">
          Open to anyone, and you never wait for a game: when you sit down, bots (named Bot 1, Bot 2 and so on) fill the empty seats and the first hand starts in a
          few seconds.
        </p>
        <p className="note">
          <strong>You can always take a bot’s seat.</strong> People come first: if every seat is taken, press <em>Take seat from…</em> under the table, and
          the bot hands you its seat as soon as the hand it is playing ends.
        </p>
        <ul className="live-tables">
          {PUBLIC_TABLES.map((room) => {
            const s = tables[room];
            const full = !!s && s.players >= s.maxSeats;
            const buyIn = buyInFor(stakesFor(room));
            // joinable: your chips cover the minimum, or today's claim (still to come) surely will
            const short = !!bank && bank.balance < buyIn.min && !claimCoversTable(stakesFor(room), bank);
            const watch = full || short;
            return (
              <li key={room}>
                <span className="lt-name">{tableLabel(room)}</span>
                <span className="lt-count note">
                  Buy-in {fmtChips(buyIn.min)}–{fmtChips(buyIn.max)} · {s === undefined ? '…' : s === null ? 'unavailable' : occupancy(s)}
                  {short && !full ? ` · needs ${fmtChips(buyIn.min)} chips` : ''}
                </span>
                <Link className={`btn small ${watch ? '' : 'primary'}`} to={`/play/${room}`} aria-label={`${watch ? 'Watch' : 'Join'} ${tableLabel(room)}`}>
                  {watch ? 'Watch' : 'Join'}
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
  const { account } = useAuth();
  // signed in: you play, buy in and chat as your account; otherwise as this browser's guest
  const { view, bank, setBank, error, status, offset, sit, leave, act, chat, sendChat } = useLiveTable(room, account?.id ?? null);
  const stakes = view?.stakes ?? stakesFor(room);
  const buyIn = buyInFor(stakes);
  // buy-in choice, in whole chips: from the table minimum up to its maximum or what you have, whichever is less
  const canBuyIn = !bank || bank.balance >= buyIn.min;
  const minChips = buyIn.min / CHIP;
  const maxChips = Math.floor((bank ? Math.min(buyIn.max, bank.balance) : buyIn.max) / CHIP);
  const [buyChips, setBuyChips] = useState<number | ''>(maxChips);
  useEffect(() => setBuyChips(maxChips), [maxChips]);
  const buyValid = typeof buyChips === 'number' && Number.isInteger(buyChips) && buyChips >= minChips && buyChips <= maxChips;
  const [name, setName] = useState(() => loadName() || account?.displayName || '');
  // the account's name arrives a moment after signing in; use it unless a name was already chosen
  useEffect(() => {
    if (account?.displayName && !loadName()) setName((n) => (!n || n === 'Player' ? account.displayName : n));
  }, [account?.displayName]);
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
  const pickingRef = useRef<number | null>(null);
  pickingRef.current = picking;
  const seated = !!mySeat;
  const waiting = view?.waiting ?? null;
  // a seat request on its way to the server: one at a time (the server also refuses a second buy-in)
  const [sitting, setSitting] = useState(false);
  useEffect(() => {
    if (seated || waiting) {
      setPicking(null);
      rememberTable(room);
    }
  }, [seated, waiting, room]);
  useEffect(() => {
    if (error) setSitting(false);
  }, [error]);
  useEffect(() => setSitting(false), [picking, seated, waiting]);
  useEffect(() => {
    if (!sitting) return;
    const t = setTimeout(() => setSitting(false), 8000); // no answer: let them try again
    return () => clearTimeout(t);
  }, [sitting]);

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
  // left this table (Leave, another table or another page) after asking for a seat here but before
  // being dealt a hand; once per seat request
  const leftEarly = (r: string, k: string) => {
    const a = asked.current;
    if (a && !dealtAfterAsking.current) trackOnce(`left-early:${r}:${a.at}`, 'Live Table Left Before First Hand', { table: k });
  };
  useEffect(
    () => () => {
      leftEarly(room, kind);
      // a different table is a fresh start for these counts
      asked.current = null;
      dealtAfterAsking.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, kind],
  );
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

  // chat: open beside the table (desktop) or as a drawer (phones); it starts closed, and on a phone
  // it gets out of the way when it is your turn (your draft is kept)
  const [chatOpen, setChatOpenState] = useState(() => !narrowScreen() && readFlag(CHAT_OPEN_KEY));
  const setChatOpen = (open: boolean) => {
    setChatOpenState(open);
    if (!narrowScreen()) writeFlag(CHAT_OPEN_KEY, open);
  };
  useEffect(() => {
    if (myTurn && !dealing && narrowScreen()) setChatOpenState(false);
  }, [myTurn, dealing]);
  const { muted, toggle: toggleMute } = useMutes();
  const lastId = Math.max(0, ...(chat ?? []).map((l) => l.id));
  const [seenId, setSeenId] = useState(0);
  useEffect(() => {
    if (chatOpen) setSeenId(lastId);
  }, [chatOpen, lastId]);
  useEffect(() => setSeenId(0), [room]);
  const unread = (chat ?? []).filter((l) => l.kind === 'player' && !l.state && l.id > seenId && l.from !== view?.you && !muted.has(l.from ?? '')).length;

  const invite = `${location.origin}/play/${room}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the link is still shown */
    }
  };

  const [nameError, setNameError] = useState<string | null>(null);
  /** Guests need a name the tables accept (signed in, you sit under your account name, whatever is sent). */
  const nameReady = () => {
    if (account) return true;
    const problem = nameProblem(name);
    setNameError(problem);
    if (problem) return false;
    saveName(name.trim());
    return true;
  };
  const requestSeat = (seat: number, units: number) => {
    const bot = !!holder(seat)?.bot;
    if (!asked.current) {
      asked.current = { at: Date.now(), bot };
      track('Seat Requested', { table: kind, seat: bot ? 'bot seat' : 'open seat' });
    }
    setSitting(true);
    // the server takes the chips from your balance only if the seat is still free, and gives them back if not
    sit(account ? account.displayName : name, seat, units);
  };
  const sitDown = (e: FormEvent) => {
    e.preventDefault();
    if (!buyValid || picking === null || sitting || !nameReady()) return;
    requestSeat(picking, (buyChips as number) * CHIP);
  };

  // no chips yet, and today's free chips cover this table: claim them and sit down in one go
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const claimCovers = !!bank && claimCoversTable(stakes, bank);
  // another table (e.g. a cheaper one offered below): nothing of this one's sit-down stays open
  useEffect(() => {
    setPicking(null);
    setClaimError(null);
    setNameError(null);
  }, [room]);
  const claimAndSit = async (e: FormEvent) => {
    e.preventDefault();
    const seat = picking;
    if (claiming || sitting || seat === null || !nameReady()) return;
    setClaiming(true);
    setClaimError(null);
    try {
      // paid at most once a day: asking again (a double click, a retry) returns the same claim
      const r = await claimDailyChips();
      setBank(r);
      trackOnce(`claim:${r.claim?.day}`, 'Daily Chips Claimed');
      // the chips are yours whatever happens next; sit down unless the window was closed meanwhile
      const units = buyInAfterClaim(stakes, r.balance);
      if (pickingRef.current === seat && units !== null) requestSeat(seat, units);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Could not claim your chips. Try again.');
    } finally {
      setClaiming(false);
    }
  };

  // out of chips here: the options stay on screen (the next hand starts without you) until you sit
  // down again, with that hand's actions to look back at
  const bustedNow = !!h?.complete && !!myPlayer && myPlayer.stack === 0;
  const [bustHand, setBustHand] = useState<{ state: HandState; me: number } | null>(null);
  useEffect(() => {
    if (bustedNow && h) setBustHand({ state: h, me });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bustedNow]);
  useEffect(() => {
    if (seated || waiting) setBustHand(null);
  }, [seated, waiting]);
  useEffect(() => setBustHand(null), [room]);
  // other tables, for somewhere your chips do cover (only looked up when needed)
  const tables = usePublicTables(!!bustHand || (picking !== null && !canBuyIn));

  if (!PARTY_HOST)
    return (
      <div className="page practice live">
        <NotConfigured />
        <Link to="/play">Back to live tables</Link>
      </div>
    );

  const nameField = account ? (
    <p className="live-have">
      You play as <strong>{account.displayName || '…'}</strong>. <Link to="/account">Change your name</Link>
    </p>
  ) : (
    <div className="row">
      <label htmlFor="live-name">Your name</label>
      <input
        id="live-name"
        className="live-input"
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => {
          setName(e.target.value);
          setNameError(null);
        }}
        autoComplete="nickname"
        autoFocus={!name}
        aria-invalid={!!nameError}
        aria-describedby={nameError ? 'live-name-err' : undefined}
      />
      {nameError && (
        <span id="live-name-err" className="error" role="alert">
          {nameError}
        </span>
      )}
    </div>
  );
  const toActName = live ? h!.players[h!.toAct]?.name : '';
  const others = (view?.seats ?? []).filter((s) => !s.bot && s.id !== view?.you).map((s) => ({ id: s.id, name: s.name }));
  const botToAct = live && isBotId(view?.handIds[h!.toAct] ?? '');
  const botTable = (view?.botSeats ?? 0) > 0;
  const results = h?.complete && h.result ? resultLines(h, me) : [];

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
    isAway: (i) => !!view?.seats.find((s) => s.id === handIds[i])?.away,
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
          {/* everyone at the table sees the button; the chat itself is only for seated players */}
          {view && (
            <button className={`btn live-chat-btn ${chatOpen ? 'on' : ''}`} aria-expanded={chatOpen} aria-controls="table-chat" onClick={() => setChatOpen(!chatOpen)}>
              Chat
              {unread > 0 && !chatOpen && (
                <span className="chat-badge" aria-label={`${unread} unread`}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          )}
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
              leftEarly(room, kind);
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
        <div className={`live-layout ${chatOpen ? 'chat-open' : ''}`}>
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
                      ? `${toActName} is thinking…`
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
            {bustHand && !mySeat && !waiting && bank && (
              <div className="live-bust">
                {canBuyIn ? (
                  <p className="note">
                    You are out of chips at this table. You have {fmtChips(bank.balance)} chips: pick an open seat to buy in again, or{' '}
                    <Link to="/practice?start=1">practise without chips</Link>.
                  </p>
                ) : (
                  <NotEnoughChips room={room} bank={bank} onBank={setBank} tables={tables} lost />
                )}
                <details className="more live-history">
                  <summary>Actions in that hand</summary>
                  <HistoryList state={bustHand.state} hero={bustHand.me} showNames money={fmtChips} />
                </details>
              </div>
            )}
            {/* your controls keep one place on the page, so nothing jumps when your turn comes */}
            <div className={`live-controls ${myPlayer && live ? 'reserve' : ''}`}>
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
                  <ActionBar
                    live
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
            </div>
            {h && (
              <details className="more live-history">
                <summary>Hand history</summary>
                <HistoryList state={h} hero={me} showNames money={fmtChips} />
              </details>
            )}
            <details className="more live-history">
              <summary>About this table</summary>
              <p className="note">
                No-Limit Hold’em, blinds {stakes.label}. Buy in for {fmtChips(buyIn.min)}–{fmtChips(buyIn.max)} chips from your bank; your stack goes back when you
                leave. You have {TURN_MS / 1000} seconds to act.
              </p>
              {botTable && (
                <p className="note">
                  Seats named Bot 1, Bot 2 and so on are played by the computer. Bots join only while someone is playing, see only their own cards, and give their
                  seats to people between hands. Their chips are their own, never anyone’s bank.
                </p>
              )}
            </details>
          </div>
          <LiveChat
            id="table-chat"
            open={chatOpen}
            lines={chat}
            me={view.you}
            people={others}
            muted={muted}
            onToggleMute={toggleMute}
            onSend={sendChat}
            onClose={() => setChatOpen(false)}
          />
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
            ) : !canBuyIn && claimCovers ? (
              <form className="live-buyin" onSubmit={claimAndSit} data-testid="claim-and-sit">
                <p className="live-have">
                  You have <strong>{fmtChips(bank!.balance)}</strong> chips. This table needs {fmtChips(buyIn.min)}, and today’s free chips ({DAILY_MIN}–{DAILY_MAX}) cover
                  that.
                </p>
                {nameField}
                {(claimError || error) && (
                  <p className="error" role="alert">
                    {claimError ?? error}
                  </p>
                )}
                <div className="row">
                  <button className="btn primary" type="submit" disabled={claiming || sitting} aria-busy={claiming || sitting}>
                    {claiming ? 'Claiming…' : sitting ? 'Sitting down…' : 'Claim daily chips & sit down'}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setPicking(null)}>
                    Cancel
                  </button>
                </div>
                <p className="note">
                  You bring as many of your chips as the table allows (up to {fmtChips(buyIn.max)}); the rest stay in your balance. Free chips can be claimed once a day.
                </p>
              </form>
            ) : !canBuyIn ? (
              <>
                <NotEnoughChips room={room} bank={bank!} onBank={setBank} tables={tables} />
                <button className="btn ghost" onClick={() => setPicking(null)}>
                  Back to the table
                </button>
              </>
            ) : (
              <form className="live-buyin" onSubmit={sitDown}>
                <p className="live-have">
                  You have <strong>{bank ? fmtChips(bank.balance) : '…'}</strong> chips
                </p>
                {nameField}
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
                  <button className="btn primary" type="submit" disabled={!buyValid || sitting} aria-busy={sitting}>
                    {sitting ? 'Sitting down…' : `Sit down with ${buyValid ? buyChips : '…'} chips`}
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
