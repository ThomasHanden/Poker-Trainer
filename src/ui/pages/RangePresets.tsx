import { useEffect, useMemo, useState } from 'react';
import { RangeMatrix, MatrixLegend, CellView } from '../components/RangeMatrix';
import { allChartsIncludingComputed, Chart, chartFreq, chartPlayRange } from '../../ranges/presets';
import { ALL_CLASSES, HandClass, Range, formatRange, rangeCombos, rangePercent, blockedFraction, describeClass, comboCount, availableCombos } from '../../ranges/hands';
import { HAND_GROUPS, groupBreakdown } from '../../ranges/groups';
import { preflopRanking, equityVsRandom } from '../../ranges/preflopEquity';
import { explainPreflopHand } from '../../scenarios/templates/helpers';
import { Card, parseCards } from '../../engine/cards';

interface Category {
  id: string;
  label: string;
  blurb: string;
  groups: Chart['group'][];
  sub?: (c: Chart) => string;
  pill: (c: Chart) => string;
}

const CATEGORIES: Category[] = [
  {
    id: 'open',
    label: 'Open first in',
    blurb: 'Everyone before you folded. Which hands raise?',
    groups: ['open'],
    sub: (c) => (c.tableSize === 2 ? 'Heads-up' : c.tableSize === 9 ? 'Full ring' : '6-max'),
    pill: (c) => (c.tableSize === 2 ? 'Button' : c.position),
  },
  { id: 'defend', label: 'Facing an open', blurb: 'Someone raised first. Which hands 3-bet, call or fold?', groups: ['defend'], pill: (c) => `${c.position} vs ${c.vsPosition}` },
  { id: 'reraise', label: '3-bets & 4-bets', blurb: 'You raised and were re-raised (or the reverse).', groups: ['vs3bet', 'vs4bet'], pill: (c) => c.name },
  { id: 'multi', label: 'Squeeze & limpers', blurb: 'Pots with more than one player already in.', groups: ['squeeze', 'iso'], pill: (c) => c.name },
  {
    id: 'pf',
    label: 'Push/fold',
    blurb: 'Short stacks: all-in or fold, and calling an all-in.',
    groups: ['pushfold', 'call-shove'],
    sub: (c) => (c.group === 'pushfold' ? 'SB shove' : 'BB call'),
    pill: (c) => c.name.replace(/^(SB shove|BB call vs SB shove) /, ''),
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

export function Presets() {
  const charts = useMemo(() => allChartsIncludingComputed(), []);
  const [catId, setCatId] = useState('open');
  const cat = CATEGORIES.find((c) => c.id === catId)!;
  const inCat = charts.filter((c) => cat.groups.includes(c.group));
  const subs = cat.sub ? [...new Set(inCat.map(cat.sub))] : [];
  const [sub, setSub] = useState<string>('6-max');
  const activeSub = subs.includes(sub) ? sub : subs[0];
  const siblings = cat.sub ? inCat.filter((c) => cat.sub!(c) === activeSub) : inCat;
  const [id, setId] = useState(siblings[0]?.id);
  const chart = siblings.find((c) => c.id === id) ?? siblings[0];
  const idx = siblings.indexOf(chart);
  const prev = idx > 0 ? siblings[idx - 1] : undefined;

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

  const play = chartPlayRange(chart);
  const prevPlay = prev ? chartPlayRange(prev) : null;
  const focusGroup = HAND_GROUPS.find((g) => g.id === focus);

  const cells = (h: HandClass): CellView => {
    const blocked = dead.cards.length ? blockedFraction(h, dead.cards) : undefined;
    const dim = focusGroup ? !focusGroup.test(h) : false;
    if (quiz && !revealed.has(h)) return { weight: 0, blocked, dim, label: 'hidden (quiz mode)' };
    const f = chartFreq(chart, h);
    if (diff && prevPlay && !quiz) {
      const now = play[h] ?? 0;
      const before = prevPlay[h] ?? 0;
      if (now > 0 && before === 0) return { tone: 'new', blocked, dim, label: `added vs ${cat.pill(prev!)}` };
      if (now === 0 && before > 0) return { tone: 'dropped', blocked, dim, label: `played by ${cat.pill(prev!)} but not here` };
      if (now > 0) return { raise: f.raise, call: f.call, blocked, dim: true };
      return { blocked, dim };
    }
    return { raise: f.raise, call: f.call, blocked, dim };
  };

  const rc = rangeCombos(chart.raise, dead.cards);
  const cc = rangeCombos(chart.call, dead.cards);
  const total = availableCombos(dead.cards);
  const playPct = rangePercent(play, dead.cards);
  const changes = prevPlay ? ALL_CLASSES.filter((h) => (play[h] ?? 0) > 0 && (prevPlay[h] ?? 0) === 0) : [];
  const dropped = prevPlay ? ALL_CLASSES.filter((h) => (play[h] ?? 0) === 0 && (prevPlay[h] ?? 0) > 0) : [];

  return (
    <div>
      <div className="picker">
        <div className="seg picker-cats" role="tablist" aria-label="Situation">
          {CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === catId} className={c.id === catId ? 'on' : ''} onClick={() => setCatId(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="picker-blurb">{cat.blurb}</p>
        <div className="picker-row">
          {subs.length > 1 && (
            <div className="seg small" role="radiogroup" aria-label="Variant">
              {subs.map((s) => (
                <button key={s} role="radio" aria-checked={s === activeSub} className={s === activeSub ? 'on' : ''} onClick={() => setSub(s)}>
                  {s}
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
              <span className="li"><span className="sw new" /> Added vs {cat.pill(prev!)}</span>
              <span className="li"><span className="sw dropped" /> Dropped</span>
              <span className="li">Faded: played by both</span>
            </div>
          ) : (
            <MatrixLegend kind="chart" />
          )}
          {diff && prevPlay && !quiz && (
            <p className="note">
              {changes.length ? `${cat.pill(chart)} adds ${changes.length} hand types: ${changes.join(', ')}.` : `No hands added.`} {dropped.length ? `Dropped: ${dropped.join(', ')}.` : ''}
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
              <div className="freqbar" aria-label="Share of all starting hands">
                <span className="fb-raise" style={{ width: `${(100 * rc) / total}%` }} />
                <span className="fb-call" style={{ width: `${(100 * cc) / total}%` }} />
              </div>
              <div className="fb-legend">
                <span>
                  <span className="sw raise" /> {chart.raiseLabel} {pct1(rc / total)}
                </span>
                {cc > 0 && (
                  <span>
                    <span className="sw call" /> {chart.callLabel ?? 'Call'} {pct1(cc / total)}
                  </span>
                )}
                <span>
                  <span className="sw fold" /> Fold {pct1(Math.max(0, 1 - (rc + cc) / total))}
                </span>
              </div>
              <p className="ci-plays">
                Plays <strong>{playPct.toFixed(1)}%</strong> of {dead.cards.length ? 'remaining' : ''} hands — about 1 deal in {playPct > 0 ? Math.max(1, Math.round(100 / playPct)) : '∞'}. ({(rc + cc).toFixed(0)} of {total} combos.)
              </p>
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
                <textarea readOnly value={formatRange(chart.raise)} rows={4} aria-label="Exported range text" />
              </details>
            </div>
          )}

          {!quiz && sel && <HandDetail h={sel} chart={chart} dead={dead.cards} />}
          {!quiz && !sel && <p className="note">Click a hand in the grid to see why it is (or isn’t) played.</p>}

          {!quiz && <GroupBreakdown range={play} focus={focus} onFocus={setFocus} title="What this range plays" />}

          <label>
            Known cards (card removal)
            <input value={deadText} onChange={(e) => setDeadText(e.target.value)} placeholder="e.g. As Kd" aria-invalid={!!dead.error} />
          </label>
          {dead.error && <p className="error">{dead.error}</p>}
          <p className="note">Cards you can see (your hand, the board) remove combos from other players’ ranges. Blocked cells fade.</p>
        </div>
      </div>
    </div>
  );
}

function HandDetail({ h, chart, dead }: { h: HandClass; chart: Chart; dead: Card[] }) {
  const f = chartFreq(chart, h);
  const n = comboCount(h);
  const left = dead.length ? Math.round(n * (1 - blockedFraction(h, dead))) : n;
  const verdict = f.raise >= 0.99 ? chart.raiseLabel : f.call >= 0.99 ? chart.callLabel ?? 'Call' : f.fold >= 0.99 ? 'Fold' : 'Mixed';
  return (
    <div className="why-box">
      <div className="hd-head">
        <h3>{h}</h3>
        <span className="note">{describeClass(h)}</span>
        <span className={`hd-verdict v-${verdict === 'Fold' ? 'fold' : verdict === 'Mixed' ? 'mixed' : f.raise > f.call ? 'raise' : 'call'}`}>{verdict}</span>
      </div>
      <div className="freqbar slim">
        <span className="fb-raise" style={{ width: `${f.raise * 100}%` }} />
        <span className="fb-call" style={{ width: `${f.call * 100}%` }} />
      </div>
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
      <ul>
        {explainPreflopHand(h, f, chart).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function GroupBreakdown({ range, compare, focus, onFocus, title }: { range: Range; compare?: Range; focus?: string | null; onFocus?: (id: string | null) => void; title: string }) {
  const rows = groupBreakdown(range);
  const rowsB = compare ? groupBreakdown(compare) : null;
  return (
    <div className="groups">
      <h3>{title}</h3>
      <p className="note">{onFocus ? 'Share of each hand family that is played. Click a row to highlight it in the grid.' : 'Share of each hand family that is played.'}</p>
      <ul>
        {rows.map((r, i) => {
          const share = r.played / r.total;
          const b = rowsB?.[i];
          const on = focus === r.group.id;
          const Tag = onFocus ? 'button' : 'div';
          return (
            <li key={r.group.id}>
              <Tag className={`grow-row ${on ? 'on' : ''}`} {...(onFocus ? { onClick: () => onFocus(on ? null : r.group.id), 'aria-pressed': on, type: 'button' as const } : {})}>
                <span className="gr-name">
                  {r.group.name} <span className="note">{r.group.hint}</span>
                </span>
                <span className={`gr-bar ${b ? 'a' : ''}`}>
                  <span style={{ width: `${share * 100}%` }} />
                </span>
                <span className="gr-val">{Math.round(share * 100)}%</span>
                {b && (
                  <>
                    <span className="gr-bar b">
                      <span style={{ width: `${(b.played / b.total) * 100}%` }} />
                    </span>
                    <span className="gr-val">{Math.round((b.played / b.total) * 100)}%</span>
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
  const order = preflopRanking();
  const n = order.filter((h) => (play[h] ?? 0) > 0).length;
  const edge = order.slice(Math.max(0, n - 30), n + 30);
  const mixed = ALL_CLASSES.filter((h) => {
    const p = play[h] ?? 0;
    return p > 0 && p < 1;
  });
  const pool = Math.random() < 0.75 ? [...edge, ...mixed] : ALL_CLASSES;
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
  const options: ['raise' | 'call' | 'fold', string][] = [['raise', chart.raiseLabel], ...(ALL_CLASSES.some((h) => (chart.call[h] ?? 0) > 0) ? [['call', chart.callLabel ?? 'Call'] as ['call', string]] : []), ['fold', 'Fold']];
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
            <strong>{grade(answer) === 'right' ? 'Correct.' : grade(answer) === 'mixed' ? 'Acceptable — this hand is mixed.' : 'Not in this chart.'}</strong> The chart plays it: {parts.join(', ')}.
          </p>
          <p className="note">{explainPreflopHand(hand, f, chart).filter((t) => !t.startsWith('Chart frequencies')).slice(0, 3).join(' ')}</p>
          <button className="btn primary" onClick={next} autoFocus>
            Next hand
          </button>
        </div>
      )}
      <p className="note">Hands you answer appear on the grid. Turn quiz mode off to see the whole chart.</p>
    </div>
  );
}
