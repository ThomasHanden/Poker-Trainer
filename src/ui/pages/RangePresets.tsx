import { useEffect, useMemo, useState } from 'react';
import { RangeMatrix, MatrixLegend, CellView } from '../components/RangeMatrix';
import { allChartsIncludingComputed, Chart, chartFreq, chartPlayRange, chartTotals, reachWeight } from '../../ranges/presets';
import { ALL_CLASSES, HandClass, Range, formatRange, blockedFraction, describeClass, comboCount } from '../../ranges/hands';
import { HAND_GROUPS, groupBreakdown } from '../../ranges/groups';
import { preflopRanking, equityVsRandom } from '../../ranges/preflopEquity';
import { explainPreflopHand } from '../../scenarios/templates/helpers';
import { Card, parseCards } from '../../engine/cards';

// ---------------- how charts are grouped in the picker ----------------

interface Variant {
  label: string;
  test: (c: Chart) => boolean;
}

interface Category {
  id: string;
  label: string;
  blurb: string;
  groups: Chart['group'][];
  /** first-level choice inside the category (table size, or which side of a shove) */
  variants?: Variant[];
  /** which variant is selected first */
  defaultVariant?: number;
  /** label above the picker row */
  pickLabel: string;
  /** optional second toggle (BB ante on/off) */
  toggles?: Variant[];
  /** order of the charts' pills */
  order?: (c: Chart) => number;
  pill: (c: Chart) => string;
  /**
   * Charts in the same chain differ in one thing only (the seat, the raiser's seat, the stack),
   * so “show changes” compares a chart with the previous one in its chain.
   */
  chain?: (c: Chart) => string;
}

const SEAT_ORDER = ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const seat = (p?: string) => SEAT_ORDER.indexOf(p ?? '');

export const CATEGORIES: Category[] = [
  {
    id: 'open',
    label: 'Open first in',
    blurb: 'Everyone before you folded, so it is raise or fold. Just calling the big blind (limping) is left out on purpose: raising first can win the blinds right away and gives you the lead in the hand. Calling makes sense once someone has raised — see Facing a raise.',
    groups: ['open'],
    pickLabel: 'Table and seat',
    variants: [
      { label: '6-max', test: (c) => c.tableSize === 6 },
      { label: 'Full ring', test: (c) => c.tableSize === 9 },
      { label: 'Heads-up', test: (c) => c.tableSize === 2 },
    ],
    pill: (c) => (c.tableSize === 2 ? 'Button' : c.position === 'UTG1' ? 'UTG+1' : c.position),
    chain: (c) => `${c.tableSize}`,
  },
  {
    id: 'defend',
    label: 'Facing a raise',
    blurb: 'One player raised first and it is your turn. Here you have three options: 3-bet, call (flat) or fold. Pick your seat, then who raised.',
    groups: ['defend'],
    pickLabel: 'Your seat, then who raised',
    variants: ['HJ', 'CO', 'BTN', 'SB', 'BB'].map((p) => ({ label: `You: ${p}`, test: (c: Chart) => c.position === p })),
    defaultVariant: 4,
    order: (c) => seat(c.vsPosition),
    pill: (c) => `${c.vsPosition} raised`,
    chain: (c) => c.position,
  },
  {
    id: 'reraise',
    label: 'Facing a 3-bet or 4-bet',
    blurb: 'You raised and were re-raised. Only the hands you raised with can be here.',
    groups: ['vs3bet', 'vs4bet'],
    pickLabel: 'Spot',
    pill: (c) => c.short ?? c.name,
  },
  {
    id: 'multi',
    label: 'Limpers & squeezes',
    blurb: 'More than one player is already in the pot.',
    groups: ['squeeze', 'iso'],
    pickLabel: 'Spot',
    pill: (c) => c.short ?? c.name,
  },
  {
    id: 'pf',
    label: 'Short-stack all-in',
    blurb: 'Folded to the small blind with a short stack: the SB shoves or folds, the BB calls or folds.',
    groups: ['pushfold', 'call-shove'],
    pickLabel: 'Player, ante and stack',
    variants: [
      { label: 'SB: shove or fold', test: (c) => c.group === 'pushfold' },
      { label: 'BB: call a shove', test: (c) => c.group === 'call-shove' },
    ],
    toggles: [
      { label: 'No ante', test: (c) => !c.id.endsWith('-ante') },
      { label: 'BB ante (1bb)', test: (c) => c.id.endsWith('-ante') },
    ],
    pill: (c) => `${c.stackBB}bb`,
    chain: (c) => `${c.group}${c.id.endsWith('-ante') ? '-ante' : ''}`,
  },
];

function parseDead(text: string): { cards: Card[]; error?: string } {
  if (!text.trim()) return { cards: [] };
  try {
    return { cards: parseCards(text) };
  } catch (e) {
    return { cards: [], error: (e as Error).message };
  }
}

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const hasRaise = (c: Chart) => ALL_CLASSES.some((h) => (c.raise[h] ?? 0) > 0);
const hasCall = (c: Chart) => ALL_CLASSES.some((h) => (c.call[h] ?? 0) > 0);

/** Text export: one range per action, each importable in “Build a range”. */
function exportParts(c: Chart): [string, string][] {
  const parts: [string, string][] = [];
  if (hasRaise(c)) parts.push([c.raiseLabel, formatRange(c.raise)]);
  if (hasCall(c)) parts.push([c.callLabel ?? 'Call', formatRange(c.call)]);
  return parts;
}

export function Presets() {
  const charts = useMemo(() => allChartsIncludingComputed(), []);
  const [catId, setCatId] = useState('open');
  const cat = CATEGORIES.find((c) => c.id === catId)!;
  const inCat = charts.filter((c) => cat.groups.includes(c.group));
  const [variant, setVariant] = useState(cat.defaultVariant ?? 0);
  const [toggle, setToggle] = useState(0);
  const v = cat.variants?.[variant] ?? cat.variants?.[0];
  const t = cat.toggles?.[toggle] ?? cat.toggles?.[0];
  const siblings = inCat.filter((c) => (!v || v.test(c)) && (!t || t.test(c))).sort((a, b) => (cat.order ? cat.order(a) - cat.order(b) : 0));
  const [id, setId] = useState<string | undefined>(undefined);
  const chart = siblings.find((c) => c.id === id) ?? siblings[0];
  const chain = siblings.filter((c) => cat.chain && cat.chain(c) === cat.chain(chart));
  const prev = chain[chain.indexOf(chart) - 1];

  const [deadText, setDeadText] = useState('');
  const dead = parseDead(deadText);
  const [sel, setSel] = useState<HandClass | null>(null);
  const [nums, setNums] = useState(false);
  const [diff, setDiff] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [quiz, setQuiz] = useState(false);
  const [revealed, setRevealed] = useState<Set<HandClass>>(new Set());

  useEffect(() => {
    setSel(null);
    setRevealed(new Set());
    if (!prev) setDiff(false);
  }, [chart?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCategory = (cid: string) => {
    setCatId(cid);
    setVariant(CATEGORIES.find((c) => c.id === cid)?.defaultVariant ?? 0);
    setToggle(0);
    setId(undefined);
    setFocus(null);
  };

  const play = chartPlayRange(chart);
  const prevPlay = prev ? chartPlayRange(prev) : null;
  const focusGroup = HAND_GROUPS.find((g) => g.id === focus);
  const raises = hasRaise(chart);
  const calls = hasCall(chart);
  const callLabel = chart.callLabel ?? 'Call';

  const cells = (h: HandClass): CellView => {
    const blocked = dead.cards.length ? blockedFraction(h, dead.cards) : undefined;
    const dim = focusGroup ? !focusGroup.test(h) : false;
    if (reachWeight(chart, h) === 0) return { out: true, blocked, dim, label: `not in ${chart.reachLabel ?? 'the range'}` };
    if (quiz && !revealed.has(h)) return { weight: 0, blocked, dim, label: 'hidden (quiz mode)' };
    const f = chartFreq(chart, h);
    if (diff && prevPlay && !quiz) {
      const now = play[h] ?? 0;
      const before = prevPlay[h] ?? 0;
      if (now > 0 && before === 0) return { tone: 'new', blocked, dim, label: `played here, not by ${cat.pill(prev!)}` };
      if (now === 0 && before > 0) return { tone: 'dropped', blocked, dim, label: `played by ${cat.pill(prev!)}, not here` };
      if (now > 0) return { raise: f.raise, call: f.call, blocked, dim: true };
      return { blocked, dim };
    }
    return { raise: f.raise, call: f.call, blocked, dim };
  };

  const tot = chartTotals(chart, dead.cards);
  const share = (x: number) => (tot.reach > 0 ? x / tot.reach : 0);
  const played = tot.raise + tot.call;
  const changes = prevPlay ? ALL_CLASSES.filter((h) => (play[h] ?? 0) > 0 && (prevPlay[h] ?? 0) === 0) : [];
  const dropped = prevPlay ? ALL_CLASSES.filter((h) => (play[h] ?? 0) === 0 && (prevPlay[h] ?? 0) > 0) : [];
  const remaining = dead.cards.length ? ' remaining' : '';

  return (
    <div>
      <div className="picker">
        <span className="picker-label">Situation</span>
        <div className="seg picker-cats" role="tablist" aria-label="Situation">
          {CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === catId} className={c.id === catId ? 'on' : ''} onClick={() => pickCategory(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="picker-blurb">{cat.blurb}</p>
        <span className="picker-label">{cat.pickLabel}</span>
        <div className="picker-row">
          {cat.variants && (
            <div className="seg small" role="radiogroup" aria-label="Variant">
              {cat.variants.map((x, i) => (
                <button key={x.label} role="radio" aria-checked={x === v} className={x === v ? 'on' : ''} onClick={() => setVariant(i)}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {cat.toggles && (
            <div className="seg small" role="radiogroup" aria-label="Ante">
              {cat.toggles.map((x, i) => (
                <button key={x.label} role="radio" aria-checked={x === t} className={x === t ? 'on' : ''} onClick={() => setToggle(i)}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
          <div className="pills" role="radiogroup" aria-label="Chart">
            {siblings.map((c) => (
              <button key={c.id} role="radio" aria-checked={c.id === chart.id} className={`pill ${c.id === chart.id ? 'on' : ''}`} onClick={() => setId(c.id)}>
                {cat.pill(c)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ranges-grid">
        <div>
          <div className="chart-title">
            <h2>{chart.name}</h2>
            <span className={`badge ${chart.confidence}`}>{chart.confidence === 'computed' ? 'Computed (stated model)' : 'Illustrative baseline'}</span>
          </div>
          <div className="matrix-tools">
            <label className="inline">
              <input type="checkbox" checked={quiz} onChange={(e) => { setQuiz(e.target.checked); setRevealed(new Set()); setSel(null); setFocus(null); }} /> Quiz mode (hide chart)
            </label>
            {prev && !quiz && (
              <label className="inline">
                <input type="checkbox" checked={diff} onChange={(e) => setDiff(e.target.checked)} /> Show changes vs {cat.pill(prev)}
              </label>
            )}
            {!quiz && (
              <label className="inline">
                <input type="checkbox" checked={nums} onChange={(e) => setNums(e.target.checked)} /> Numbers
              </label>
            )}
          </div>
          <RangeMatrix ariaLabel={`${chart.name} chart`} cells={cells} onSelect={quiz ? undefined : setSel} selected={sel} showNumbers={nums && !quiz} />
          {diff && prevPlay && !quiz ? (
            <div className="legend">
              <span className="li"><span className="sw new" /> Played here, not by {cat.pill(prev!)}</span>
              <span className="li"><span className="sw dropped" /> Played by {cat.pill(prev!)}, not here</span>
              <span className="li">Faded: played by both</span>
            </div>
          ) : (
            <MatrixLegend kind="chart" labels={{ raise: raises ? chart.raiseLabel : null, call: calls ? callLabel : null, out: chart.reach ? `Not in ${chart.reachLabel}` : null }} />
          )}
          {diff && prevPlay && !quiz && (
            <p className="note">
              {changes.length ? `${cat.pill(chart)} adds ${changes.length} hand types: ${changes.join(', ')}.` : 'No hands added.'} {dropped.length ? `Dropped: ${dropped.join(', ')}.` : ''}
            </p>
          )}
        </div>

        <div className="side">
          {quiz ? (
            <ChartQuiz chart={chart} onReveal={(h) => setRevealed((r) => new Set(r).add(h))} />
          ) : (
            <div className="chart-info">
              <p className="ci-situation">
                <strong>Situation:</strong> {chart.priorAction} <strong>Sizing:</strong> {chart.sizing}
              </p>
              {chart.reach && (
                <p className="ci-reach">
                  Only {chart.reachLabel} can be here: {pct1(tot.reach / tot.all)} of all{remaining} hands ({tot.reach.toFixed(0)} combos). The bar shows what those hands do.
                </p>
              )}
              <div className="freqbar" aria-label={chart.reach ? `Share of ${chart.reachLabel}` : 'Share of all starting hands'}>
                <span className="fb-raise" style={{ width: `${100 * share(tot.raise)}%` }} />
                <span className="fb-call" style={{ width: `${100 * share(tot.call)}%` }} />
              </div>
              <div className="fb-legend">
                {raises && (
                  <span>
                    <span className="sw raise" /> {chart.raiseLabel} {pct1(share(tot.raise))}
                  </span>
                )}
                {calls && (
                  <span>
                    <span className="sw call" /> {callLabel} {pct1(share(tot.call))}
                  </span>
                )}
                <span>
                  <span className="sw fold" /> Fold {pct1(share(tot.fold))}
                </span>
              </div>
              <p className="ci-plays">
                {chart.reach ? (
                  <>
                    Continues with <strong>{pct1(share(played))}</strong> of {chart.reachLabel} — {pct1(played / tot.all)} of all{remaining} starting hands ({played.toFixed(0)} combos).
                  </>
                ) : (
                  <>
                    Plays <strong>{pct1(played / tot.all)}</strong> of all{remaining} starting hands ({played.toFixed(0)} of {tot.all} combos).
                  </>
                )}
              </p>
              {calls && chart.callWhy && (
                <div className="ci-why-call">
                  <strong>When to just call</strong>
                  <p>{chart.callWhy}</p>
                </div>
              )}
              <details>
                <summary>Assumptions</summary>
                <ul>
                  {chart.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Export as text</summary>
                {exportParts(chart).map(([label, text]) => (
                  <label key={label}>
                    {label}
                    <textarea readOnly value={text} rows={4} aria-label={`${label} range as text`} />
                  </label>
                ))}
                <p className="note">Frequencies are per hand: “AJo:0.6” means you take that action 60% of the time you hold AJo here. Paste a line into Build a range → Import text to edit it.</p>
              </details>
            </div>
          )}

          {!quiz && sel && <HandDetail h={sel} chart={chart} dead={dead.cards} />}
          {!quiz && !sel && <p className="note">Click a hand in the grid to see why it is (or isn’t) played.</p>}

          {!quiz && (
            <GroupBreakdown
              range={play}
              reach={chart.reach}
              focus={focus}
              onFocus={setFocus}
              title="What this range plays"
              blurb={chart.reach ? `Share of each hand family in ${chart.reachLabel} that continues (raise or call).` : 'Share of each hand family that is played (raise or call).'}
            />
          )}

          <label>
            Known cards (card removal)
            <input value={deadText} onChange={(e) => setDeadText(e.target.value)} placeholder="e.g. As Kd" aria-invalid={!!dead.error} />
          </label>
          {dead.error && <p className="error">{dead.error}</p>}
          <p className="note">Cards you can see (your hand, the board) remove combos from other players’ ranges. Blocked cells fade, and the percentages above count only the combos that are still possible.</p>
        </div>
      </div>
    </div>
  );
}

function HandDetail({ h, chart, dead }: { h: HandClass; chart: Chart; dead: Card[] }) {
  const f = chartFreq(chart, h);
  const n = comboCount(h);
  const rw = reachWeight(chart, h);
  const left = dead.length ? Math.round(n * (1 - blockedFraction(h, dead))) : n;
  const verdict = rw === 0 ? 'Not in range' : f.raise >= 0.99 ? chart.raiseLabel : f.call >= 0.99 ? chart.callLabel ?? 'Call' : f.fold >= 0.99 ? 'Fold' : 'Mixed';
  const tone = rw === 0 || verdict === 'Fold' ? 'fold' : verdict === 'Mixed' ? 'mixed' : f.raise > f.call ? 'raise' : 'call';
  return (
    <div className="why-box">
      <div className="hd-head">
        <h3>{h}</h3>
        <span className="note">{describeClass(h)}</span>
        <span className={`hd-verdict v-${tone}`}>{verdict}</span>
      </div>
      {rw > 0 && (
        <div className="freqbar slim">
          <span className="fb-raise" style={{ width: `${f.raise * 100}%` }} />
          <span className="fb-call" style={{ width: `${f.call * 100}%` }} />
        </div>
      )}
      <dl className="hd-facts">
        <div>
          <dt>Combos</dt>
          <dd>{left === n ? n : `${left} of ${n}`}</dd>
        </div>
        <div>
          <dt>Dealt</dt>
          <dd>{((100 * n) / 1326).toFixed(2)}% of hands</dd>
        </div>
        <div>
          <dt>Equity vs random</dt>
          <dd>{(equityVsRandom()[h] * 100).toFixed(0)}%</dd>
        </div>
      </dl>
      {rw > 0 && rw < 1 && (
        <p className="note">
          {h} is in {chart.reachLabel} only {Math.round(rw * 100)}% of the time; the frequencies here apply when you do have it in this spot.
        </p>
      )}
      <ul>
        {explainPreflopHand(h, f, chart).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function GroupBreakdown({
  range,
  compare,
  reach,
  focus,
  onFocus,
  title,
  blurb,
}: {
  range: Range;
  compare?: Range;
  reach?: Range;
  focus?: string | null;
  onFocus?: (id: string | null) => void;
  title: string;
  blurb?: string;
}) {
  const rows = groupBreakdown(range, reach);
  const rowsB = compare ? groupBreakdown(compare) : null;
  const shareOf = (r: { played: number; total: number }) => (r.total > 0 ? r.played / r.total : null);
  const val = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
  return (
    <div className="groups">
      <h3>{title}</h3>
      <p className="note">
        {blurb ?? 'Share of each hand family that is played.'}
        {onFocus ? ' Click a row to highlight it in the grid.' : ''}
      </p>
      <ul>
        {rows.map((r, i) => {
          const share = shareOf(r);
          const b = rowsB?.[i];
          const shareB = b ? shareOf(b) : null;
          const on = focus === r.group.id;
          const Tag = onFocus ? 'button' : 'div';
          return (
            <li key={r.group.id}>
              <Tag className={`grow-row ${on ? 'on' : ''}`} {...(onFocus ? { onClick: () => onFocus(on ? null : r.group.id), 'aria-pressed': on, type: 'button' as const } : {})}>
                <span className="gr-name">
                  {r.group.name} <span className="note">{r.group.hint}</span>
                </span>
                <span className={`gr-bar ${b ? 'a' : ''}`}>
                  <span style={{ width: `${(share ?? 0) * 100}%` }} />
                </span>
                <span className="gr-val">{val(share)}</span>
                {b && (
                  <>
                    <span className="gr-bar b">
                      <span style={{ width: `${(shareB ?? 0) * 100}%` }} />
                    </span>
                    <span className="gr-val">{val(shareB)}</span>
                  </>
                )}
              </Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------- quiz on the current chart ----------------

function pickHand(chart: Chart, avoid: HandClass | null): HandClass {
  const play = chartPlayRange(chart);
  const order = preflopRanking().filter((h) => reachWeight(chart, h) > 0);
  const n = order.filter((h) => (play[h] ?? 0) > 0).length;
  const edge = order.slice(Math.max(0, n - 30), n + 30);
  const mixed = order.filter((h) => {
    const f = chartFreq(chart, h);
    return Math.max(f.raise, f.call, f.fold) < 1;
  });
  const pool = Math.random() < 0.75 ? [...edge, ...mixed] : order;
  let h = pool[Math.floor(Math.random() * pool.length)];
  if (h === avoid) h = pool[(pool.indexOf(h) + 1) % pool.length];
  return h;
}

function ChartQuiz({ chart, onReveal }: { chart: Chart; onReveal: (h: HandClass) => void }) {
  const [hand, setHand] = useState<HandClass>(() => pickHand(chart, null));
  const [answer, setAnswer] = useState<'raise' | 'call' | 'fold' | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  useEffect(() => {
    setHand(pickHand(chart, null));
    setAnswer(null);
    setScore({ right: 0, total: 0 });
  }, [chart]);
  const f = chartFreq(chart, hand);
  const options: ['raise' | 'call' | 'fold', string][] = [
    ...(hasRaise(chart) ? [['raise', chart.raiseLabel] as ['raise', string]] : []),
    ...(hasCall(chart) ? [['call', chart.callLabel ?? 'Call'] as ['call', string]] : []),
    ['fold', 'Fold'],
  ];
  const grade = (a: 'raise' | 'call' | 'fold') => (f[a] >= 0.5 ? 'right' : f[a] >= 0.25 ? 'mixed' : 'wrong');
  const choose = (a: 'raise' | 'call' | 'fold') => {
    if (answer) return;
    setAnswer(a);
    onReveal(hand);
    setScore((s) => ({ right: s.right + (grade(a) === 'wrong' ? 0 : 1), total: s.total + 1 }));
  };
  const next = () => {
    setHand(pickHand(chart, hand));
    setAnswer(null);
  };
  const parts = [f.raise > 0 && `${chart.raiseLabel.toLowerCase()} ${Math.round(f.raise * 100)}%`, f.call > 0 && `${(chart.callLabel ?? 'call').toLowerCase()} ${Math.round(f.call * 100)}%`, f.fold > 0 && `fold ${Math.round(f.fold * 100)}%`].filter(Boolean);
  return (
    <div className="chart-quiz" aria-live="polite">
      <div className="cq-head">
        <h3>Test yourself</h3>
        <span className="note">
          {score.right}/{score.total} correct
        </span>
      </div>
      <p className="note">{chart.priorAction} What do you do with…</p>
      <div className="cq-hand">{hand}</div>
      <p className="note cq-desc">{describeClass(hand)}</p>
      <div className="cq-options">
        {options.map(([a, label]) => (
          <button key={a} className={`btn ${answer ? (a === answer ? grade(a) : f[a] >= 0.5 ? 'right' : '') : ''}`} onClick={() => choose(a)} disabled={!!answer}>
            {label}
          </button>
        ))}
      </div>
      {answer && (
        <div className="cq-result">
          <p>
            <strong>{grade(answer) === 'right' ? 'Correct.' : grade(answer) === 'mixed' ? 'Acceptable — this hand is mixed.' : 'Not what the chart does.'}</strong> The chart plays it: {parts.join(', ')}.
          </p>
          <p className="note">{explainPreflopHand(hand, f, chart).filter((t) => !t.startsWith('Chart frequencies')).slice(0, 3).join(' ')}</p>
          <button className="btn primary" onClick={next} autoFocus>
            Next hand
          </button>
        </div>
      )}
      <p className="note">An answer scores a point when the chart takes that action at least 25% of the time (“correct” from 50%). Hands you answer appear on the grid.</p>
    </div>
  );
}
