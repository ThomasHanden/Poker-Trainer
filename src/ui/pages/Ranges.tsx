import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { RangeMatrix, MatrixLegend, CellView } from '../components/RangeMatrix';
import { allChartsIncludingComputed, chartPlayRange } from '../../ranges/presets';
import { ALL_CLASSES, HandClass, Range, emptyRange, parseRange, formatRange, rangeCombos, rangePercent, compareRanges, blockedFraction } from '../../ranges/hands';
import { parseCards, Card } from '../../engine/cards';
import { HAND_GROUPS, groupClasses } from '../../ranges/groups';
import { preflopRanking } from '../../ranges/preflopEquity';
import { Presets, GroupBreakdown } from './RangePresets';
import { useStore } from '../store';
import { newId, SavedRange } from '../../persistence/storage';
import { run } from '../../workers/client';
import type { Drill, DrillKind, MatrixDrill, ChoiceDrill } from '../../ranges/practice';
import { scoreSelection } from '../../ranges/practice';
import { EquityResult } from '../../engine/equity';
import { CardRow } from '../components/Card';

type Tab = 'presets' | 'editor' | 'compare' | 'drills' | 'equity';

function parseDead(text: string): { cards: Card[]; error?: string } {
  if (!text.trim()) return { cards: [] };
  try {
    return { cards: parseCards(text) };
  } catch (e) {
    return { cards: [], error: (e as Error).message };
  }
}

export function RangesPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'presets';
  const setTab = (t: Tab) => setParams({ tab: t });
  return (
    <div className="page ranges">
      <header className="page-head">
        <p className="eyebrow">Tools</p>
        <h1>Ranges</h1>
        <p className="lead">See which hands to play from each seat, build your own ranges, and check equities.</p>
      </header>
      <div className="tabs" role="tablist">
        {(
          [
            ['presets', 'Preset charts'],
            ['editor', 'Build & save'],
            ['compare', 'Compare'],
            ['drills', 'Range practice'],
            ['equity', 'Equity calculator'],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'presets' && <Presets />}
      {tab === 'editor' && <Editor />}
      {tab === 'compare' && <Compare />}
      {tab === 'drills' && <Drills />}
      {tab === 'equity' && <EquityCalc />}
      <details className="format-help">
        <summary>Range text format</summary>
        <p>
          Comma-separated tokens: <code>AA</code>, <code>AKs</code>, <code>AKo</code>, <code>AK</code> (both), <code>22+</code>, <code>A2s+</code>, <code>KTo+</code>, <code>QQ-99</code>, <code>A5s-A2s</code>, <code>T9s-65s</code> (same-gap runs), specific combos like <code>AsKs</code>. Add a weight with <code>:0.5</code> or <code>:50%</code>. Later tokens override earlier ones. See <code>docs/RANGE_FORMAT.md</code>.
        </p>
      </details>
    </div>
  );
}

// ---------------- Editor ----------------

function Editor() {
  const { data, update } = useStore();
  const [range, setRange] = useState<Range>(() => emptyRange());
  const [brush, setBrush] = useState(1);
  const [paintTo, setPaintTo] = useState<number | null>(null);
  const [name, setName] = useState('My range');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [deadText, setDeadText] = useState('');
  const dead = parseDead(deadText);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const charts = useMemo(() => allChartsIncludingComputed(), []);
  const paint = (h: HandClass, first: boolean) => {
    setRange((r) => {
      const target = first ? ((r[h] ?? 0) === brush ? 0 : brush) : paintTo ?? brush;
      if (first) setPaintTo(target);
      return { ...r, [h]: target };
    });
  };
  const save = () => {
    const now = Date.now();
    const txt = formatRange(range);
    if (currentId && data.ranges.some((r) => r.id === currentId)) {
      update((d) => ({ ...d, ranges: d.ranges.map((r) => (r.id === currentId ? { ...r, name, text: txt, updatedAt: now } : r)) }));
      setMsg(`Updated “${name}”.`);
    } else {
      const rec: SavedRange = { id: newId(), name, text: txt, createdAt: now, updatedAt: now };
      update((d) => ({ ...d, ranges: [...d.ranges, rec] }));
      setCurrentId(rec.id);
      setMsg(`Saved “${name}”.`);
    }
  };
  const doImport = () => {
    try {
      setRange(parseRange(text));
      setMsg('Imported.');
    } catch (e) {
      setMsg(`Import error: ${(e as Error).message}`);
    }
  };
  const combos = rangeCombos(range, dead.cards);
  const [topPct, setTopPct] = useState(20);
  const topRange = () => {
    // fill the best hands (by this app's playability ordering) until the target share of combos is reached
    const r = emptyRange();
    let n = 0;
    for (const h of preflopRanking()) {
      if (n >= (topPct / 100) * 1326) break;
      r[h] = 1;
      n += h.length === 2 ? 6 : h[2] === 's' ? 4 : 12;
    }
    setRange(r);
    setMsg(`Filled the top ${topPct}% of hands.`);
  };
  const addGroup = (id: string) => setRange((r) => ({ ...r, ...Object.fromEntries(groupClasses(id).map((h) => [h, brush])) }));
  return (
    <div className="ranges-grid">
      <div>
        <div className="brushes" role="radiogroup" aria-label="Brush weight">
          {[1, 0.75, 0.5, 0.25, 0].map((w) => (
            <button key={w} role="radio" aria-checked={brush === w} className={`chip ${brush === w ? 'on' : ''}`} onClick={() => setBrush(w)}>
              {w === 0 ? 'Eraser' : `${w * 100}%`}
            </button>
          ))}
          <button className="chip" onClick={() => setRange(emptyRange())}>
            Clear
          </button>
          <button className="chip" onClick={() => setRange(Object.fromEntries(ALL_CLASSES.map((h) => [h, Math.max(0, 1 - (range[h] ?? 0))])))}>
            Invert
          </button>
          <select aria-label="Load a preset into the editor" onChange={(e) => e.target.value && setRange(chartPlayRange(charts.find((c) => c.id === e.target.value)!))} value="">
            <option value="">Load preset…</option>
            {charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="quick-tools">
          <div className="qt-row">
            <span className="qt-label">Quick fill</span>
            <input type="range" min={1} max={100} value={topPct} onChange={(e) => setTopPct(Number(e.target.value))} aria-label="Top percent of hands" />
            <span className="qt-val">Top {topPct}%</span>
            <button className="btn small" onClick={topRange}>
              Fill
            </button>
          </div>
          <div className="qt-row">
            <span className="qt-label">Add family</span>
            {HAND_GROUPS.map((g) => (
              <button key={g.id} className="chip" onClick={() => addGroup(g.id)} title={g.hint}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
        <RangeMatrix ariaLabel="Editable range" cells={(h) => ({ weight: range[h] ?? 0, blocked: dead.cards.length ? blockedFraction(h, dead.cards) : undefined })} onPaint={paint} showNumbers />
        <MatrixLegend kind="weight" />
        <p className="stats" data-testid="range-stats">
          {combos.toFixed(1)} combos · {rangePercent(range, dead.cards).toFixed(1)}% of {dead.cards.length ? 'remaining' : 'all'} hands
        </p>
        <p className="note">Click or drag to paint with the selected weight. Clicking a cell that already has the brush weight clears it. Keyboard: Tab to a cell and press Enter. “Add family” uses the selected brush weight.</p>
        <p className="range-text" aria-label="Current range as text">
          <code>{formatRange(range) || '(empty)'}</code>
        </p>
      </div>
      <div className="side">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="range-name" />
        </label>
        <div className="row">
          <button className="btn primary" onClick={save} data-testid="save-range">
            {currentId ? 'Save changes' : 'Save range'}
          </button>
          <button
            className="btn"
            onClick={() => {
              setCurrentId(null);
              setName('My range');
            }}
          >
            New
          </button>
        </div>
        {msg && <p role="status">{msg}</p>}
        <label>
          Known cards (card removal)
          <input value={deadText} onChange={(e) => setDeadText(e.target.value)} placeholder="e.g. Ah Kd 7c" />
        </label>
        {dead.error && <p className="error">{dead.error}</p>}
        <label>
          Import / export text
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 22+,A2s+,KTo+,T9s-65s:0.5" aria-label="Range text" />
        </label>
        <div className="row">
          <button className="btn" onClick={doImport}>
            Import text
          </button>
          <button className="btn" onClick={() => setText(formatRange(range))}>
            Export current
          </button>
        </div>
        <GroupBreakdown range={range} title="Hand families in this range" />
        <h3>Saved ranges</h3>
        {data.ranges.length === 0 ? (
          <p className="note">No saved ranges yet.</p>
        ) : (
          <ul className="saved-list" data-testid="saved-ranges">
            {data.ranges.map((r) => (
              <li key={r.id}>
                <button
                  className="linklike"
                  onClick={() => {
                    try {
                      setRange(parseRange(r.text));
                      setName(r.name);
                      setCurrentId(r.id);
                      setMsg(`Loaded “${r.name}”.`);
                    } catch (e) {
                      setMsg(`Could not load: ${(e as Error).message}`);
                    }
                  }}
                >
                  {r.name}
                </button>{' '}
                <span className="note">({rangeCombos(parseRangeSafe(r.text)).toFixed(0)} combos)</span>{' '}
                <button className="linklike danger" aria-label={`Delete ${r.name}`} onClick={() => confirm(`Delete “${r.name}”?`) && update((d) => ({ ...d, ranges: d.ranges.filter((x) => x.id !== r.id) }))}>
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function parseRangeSafe(t: string): Range {
  try {
    return parseRange(t);
  } catch {
    return emptyRange();
  }
}

// ---------------- Compare ----------------

function useRangeOptions() {
  const { data } = useStore();
  const charts = useMemo(() => allChartsIncludingComputed(), []);
  const opts: { id: string; label: string; range: Range }[] = [
    ...data.ranges.map((r) => ({ id: `saved:${r.id}`, label: `★ ${r.name}`, range: parseRangeSafe(r.text) })),
    ...charts.map((c) => ({ id: c.id, label: c.name, range: chartPlayRange(c) })),
  ];
  return opts;
}

function Compare() {
  const opts = useRangeOptions();
  const [a, setA] = useState(opts[0]?.id);
  const [b, setB] = useState(opts[1]?.id);
  const ra = opts.find((o) => o.id === a)?.range ?? emptyRange();
  const rb = opts.find((o) => o.id === b)?.range ?? emptyRange();
  const cmp = compareRanges(ra, rb);
  const chips = (hs: string[]) => (hs.length ? <span className="hand-chips">{hs.map((h) => <span key={h} className="hchip">{h}</span>)}</span> : <span className="note">none</span>);
  return (
    <div className="ranges-grid">
      <div>
        <div className="filters">
          <label className="grow">
            Range A
            <select value={a} onChange={(e) => setA(e.target.value)}>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn small swap" onClick={() => { setA(b); setB(a); }} aria-label="Swap A and B">
            ⇄
          </button>
          <label className="grow">
            Range B
            <select value={b} onChange={(e) => setB(e.target.value)}>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <RangeMatrix
          ariaLabel="Range comparison"
          showNumbers
          cells={(h): CellView => {
            const wa = ra[h] ?? 0;
            const wb = rb[h] ?? 0;
            const tone = wa > 0 && wb > 0 ? 'both' : wa > 0 ? 'a' : wb > 0 ? 'b' : 'none';
            return { tone, label: `A ${Math.round(wa * 100)}%, B ${Math.round(wb * 100)}%` };
          }}
        />
        <MatrixLegend kind="compare" />
      </div>
      <div className="side">
        <div className="cmp-stats">
          <div>
            <span className="sw a" /> A <strong>{((100 * cmp.combosA) / 1326).toFixed(1)}%</strong>
            <span className="note"> {cmp.combosA.toFixed(0)} combos</span>
          </div>
          <div>
            <span className="sw b" /> B <strong>{((100 * cmp.combosB) / 1326).toFixed(1)}%</strong>
            <span className="note"> {cmp.combosB.toFixed(0)} combos</span>
          </div>
          <div>
            Similarity <strong>{(cmp.similarity * 100).toFixed(0)}%</strong>
            <span className="note"> {cmp.overlapCombos.toFixed(0)} shared combos</span>
          </div>
        </div>
        <h4>Only in A</h4>
        {chips(cmp.onlyA)}
        <h4>Only in B</h4>
        {chips(cmp.onlyB)}
        <h4>Different weights</h4>
        {chips(cmp.differentWeight)}
        <GroupBreakdown range={ra} compare={rb} title="By hand family (A top, B below)" />
        <p className="note">
          Tip: save your own attempt in <Link to="/ranges?tab=editor">Build & save</Link>, then compare it with a reference chart here.
        </p>
      </div>
    </div>
  );
}

// ---------------- Drills ----------------

const DRILLS: { kind: DrillKind; title: string; blurb: string }[] = [
  { kind: 'open', title: 'Select hands to open', blurb: 'Build an opening range from a position and compare it with the reference.' },
  { kind: 'continue', title: 'Continue vs a river bet', blurb: 'Pick the bluff-catchers that should call; answers are exact river equities vs the modeled betting range.' },
  { kind: 'value-bluff', title: 'Value bets and bluffs', blurb: 'Sort river hands into value bets, bluffs and checks.' },
  { kind: 'blockers', title: 'Useful blockers', blurb: 'Choose the holding that removes the most of the opponent’s strongest hands.' },
  { kind: 'board-advantage', title: 'Who does the board favor?', blurb: 'Predict which preflop range benefits from a flop.' },
];

function Drills() {
  const [drill, setDrill] = useState<Drill | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = async (kind: DrillKind) => {
    setLoading(true);
    setErr(null);
    try {
      setDrill(await run<Drill>({ kind: 'rangeDrill', drill: kind, seed: Math.floor(Math.random() * 1e9) }));
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  };
  return (
    <div>
      <div className="drill-list">
        {DRILLS.map((d) => (
          <button key={d.kind} className="feature drill" onClick={() => start(d.kind)} disabled={loading}>
            <strong>{d.title}</strong>
            <span>{d.blurb}</span>
          </button>
        ))}
      </div>
      {loading && <div className="loading" role="status">Preparing drill…</div>}
      {err && <div className="error-box">{err}</div>}
      {drill && !loading && (drill.kind === 'blockers' || drill.kind === 'board-advantage' ? <ChoiceDrillView key={drill.prompt} d={drill as ChoiceDrill} /> : <MatrixDrillView key={drill.prompt} d={drill as MatrixDrill} />)}
    </div>
  );
}

function MatrixDrillView({ d }: { d: MatrixDrill }) {
  const [marks, setMarks] = useState<Record<HandClass, string>>({});
  const [mode, setMode] = useState(d.paintModes[0]);
  const [checked, setChecked] = useState(false);
  const cand = new Set(d.candidates);
  const allowed = (h: HandClass) => !d.candidates.length || cand.has(h);
  const paint = (h: HandClass, first: boolean) => {
    if (!allowed(h) || checked) return;
    setMarks((m) => {
      const cur = m[h];
      const next = { ...m };
      if (first && cur === mode) delete next[h];
      else next[h] = mode;
      return next;
    });
  };
  const results = d.paintModes.map((pm) => {
    const sel = Object.keys(marks).filter((h) => marks[h] === pm);
    const ignore = (d.reference.mixed ?? []) as HandClass[];
    return { pm, ...scoreSelection(sel, d.reference[pm] ?? [], d.candidates, ignore) };
  });
  return (
    <div className="drill-box">
      <h2>{d.title}</h2>
      <p>{d.prompt}</p>
      {d.board.length > 0 && <CardRow cards={d.board} size="md" />}
      {d.paintModes.length > 1 && (
        <div className="seg" role="radiogroup" aria-label="Mark as">
          {d.paintModes.map((pm) => (
            <button key={pm} role="radio" aria-checked={mode === pm} className={mode === pm ? 'on' : ''} onClick={() => setMode(pm)}>
              Mark {pm}
            </button>
          ))}
        </div>
      )}
      <RangeMatrix
        ariaLabel="Drill matrix"
        onPaint={paint}
        cells={(h): CellView => {
          if (!allowed(h)) return { disabled: true, label: 'not in your range here' };
          const m = marks[h];
          if (checked) {
            const inRef = d.paintModes.find((pm) => (d.reference[pm] ?? []).includes(h));
            const tone: CellView['tone'] = m && m === inRef ? (m === 'bluff' ? 'bluff' : m === 'value' ? 'value' : 'ref') : m && !inRef ? 'extra' : !m && inRef ? 'miss' : m ? 'extra' : 'none';
            return { tone, label: `${d.details[h] ?? ''}` };
          }
          return m ? { tone: m === 'bluff' ? 'bluff' : m === 'value' ? 'value' : 'ref' } : { weight: 0 };
        }}
      />
      {!checked ? (
        <button className="btn primary" onClick={() => setChecked(true)}>
          Check my answer
        </button>
      ) : (
        <div className="drill-result">
          {results.map((r) => (
            <p key={r.pm}>
              <strong>{r.pm === 'select' ? 'Selection' : r.pm}:</strong> {(r.accuracy * 100).toFixed(0)}% of combos classified like the reference. Missing: {r.missing.join(', ') || 'none'}. Extra: {r.extra.join(', ') || 'none'}.
            </p>
          ))}
          <div className="legend">
            <span className="sw ref" /> correct <span className="sw miss" /> missed <span className="sw extra" /> not in reference
          </div>
          <ul>
            {d.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p className="note">Hover or focus a cell to see its computed numbers.</p>
        </div>
      )}
    </div>
  );
}

function ChoiceDrillView({ d }: { d: ChoiceDrill }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="drill-box">
      <h2>{d.title}</h2>
      <p>{d.prompt}</p>
      <CardRow cards={d.board} size="md" />
      <div className="choices">
        {d.options.map((o, i) => (
          <button key={i} className={`btn choice ${pick !== null ? (i === d.correct ? 'right' : i === pick ? 'wrong' : '') : ''}`} onClick={() => setPick(i)} disabled={pick !== null}>
            {o.label}
            {pick !== null && <span className="note"> — {o.detail}</span>}
          </button>
        ))}
      </div>
      {pick !== null && (
        <div className="drill-result">
          <p>{pick === d.correct ? 'Correct.' : 'Not quite.'}</p>
          <ul>
            {d.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------- Equity calculator ----------------

const EXAMPLES: { label: string; hero: string; board: string; range: string; lesson: string }[] = [
  { label: 'AKs vs QQ', hero: 'Ah Kh', board: '', range: 'QQ', lesson: 'The classic “coin flip”: a pair is a small favorite over two overcards.' },
  { label: 'AK vs AQ', hero: 'As Kd', board: '', range: 'AQo', lesson: 'Domination: sharing an ace with a better kicker leaves the weaker hand about 3 outs to beat you.' },
  { label: 'JTs vs AA', hero: 'Jc Tc', board: '', range: 'AA', lesson: 'Even a strong suited connector is a big underdog to aces — but far from dead.' },
  { label: 'Flush draw on the flop', hero: 'Ah 5h', board: 'Kh 9h 2c', range: 'KQ,KJ,KT,K9,99', lesson: 'Nut flush draw plus an ace overcard: about 12 outs with two cards to come — the rule of 4 says roughly 45%. The exact figure is a little lower because not every out wins (an ace can still lose to two pair or a set).' },
  { label: 'Top pair vs a c-bet range', hero: 'Kd Qc', board: 'Ks 7d 2c', range: '22+,A2s+,K9s+,QTs+,JTs,ATo+,KJo+', lesson: 'Strong one-pair hands are well ahead of a wide range, but not of a tight one.' },
  { label: 'Overpair vs a turn raise', hero: 'Qs Qd', board: 'Jh Th 4c 2s', range: 'JJ,TT,44,JTs,KhQh,AhKh,QhJh', lesson: 'Against a narrow, strong range even an overpair can be in bad shape.' },
];

const PRICES: [string, number][] = [
  ['¼ pot', 0.25],
  ['⅓ pot', 1 / 3],
  ['½ pot', 0.5],
  ['⅔ pot', 2 / 3],
  ['Pot', 1],
  ['2× pot', 2],
];

function EquityCalc() {
  const opts = useRangeOptions();
  const [hero, setHero] = useState('Ah Kh');
  const [board, setBoard] = useState('');
  const [rid, setRid] = useState(opts.find((o) => o.id === 'cash6-open-CO')?.id ?? opts[0].id);
  const [custom, setCustom] = useState('');
  const [res, setRes] = useState<EquityResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lesson, setLesson] = useState<string | null>(null);
  const calc = async (h0 = hero, b0 = board, c0 = custom) => {
    setErr(null);
    setRes(null);
    try {
      const h = parseCards(h0);
      if (h.length !== 2) throw new Error('Enter exactly two hole cards.');
      const b = b0.trim() ? parseCards(b0) : [];
      if (b.length > 5 || b.length === 1 || b.length === 2) throw new Error('A board has 0, 3, 4 or 5 cards.');
      const all = [...h, ...b];
      if (new Set(all).size !== all.length) throw new Error('Duplicate card.');
      const text = c0.trim() ? c0 : formatRange(opts.find((o) => o.id === rid)!.range);
      parseRange(text);
      setBusy(true);
      setRes(await run<EquityResult>({ kind: 'equity', hero: h, ranges: [text], board: b, samples: 40000 }));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const example = (x: (typeof EXAMPLES)[number]) => {
    setHero(x.hero);
    setBoard(x.board);
    setCustom(x.range);
    setLesson(x.lesson);
    calc(x.hero, x.board, x.range);
  };
  return (
    <div className="equity-calc">
      <div className="eq-examples">
        <span className="qt-label">Try a classic</span>
        {EXAMPLES.map((x) => (
          <button key={x.label} className="chip" onClick={() => example(x)} disabled={busy}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="grid2">
        <label>
          Your hand
          <input value={hero} onChange={(e) => setHero(e.target.value)} placeholder="e.g. Ah Kh" />
        </label>
        <label>
          Board (optional)
          <input value={board} onChange={(e) => setBoard(e.target.value)} placeholder="e.g. Ks 7d 2c" />
        </label>
        <label>
          Opponent range
          <select value={rid} onChange={(e) => { setRid(e.target.value); setCustom(''); }}>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          …or type a range / exact hand
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. TT+,AQs+,AKo or QsQd" />
        </label>
      </div>
      <p className="note">Cards are rank + suit: A K Q J T 9…2 and s h d c. Example: “Ah Kh” is the ace and king of hearts.</p>
      <button className="btn primary" onClick={() => calc()} disabled={busy}>
        {busy ? 'Calculating…' : 'Calculate equity'}
      </button>
      {err && <p className="error">{err}</p>}
      {res && (
        <div className="eq-result" role="status">
          <div className="eq-head">
            <span className="eq-big">{(res.equity * 100).toFixed(1)}%</span>
            <span>
              your equity <span className="note">(win {(res.win * 100).toFixed(1)}%, tie {(res.tie * 100).toFixed(1)}%)</span>
            </span>
          </div>
          <div className="eq-bar" aria-hidden="true">
            <span className="eq-win" style={{ width: `${res.win * 100}%` }} />
            <span className="eq-tie" style={{ width: `${res.tie * 100}%` }} />
          </div>
          <div className="eq-bar-legend note">
            <span>You win</span>
            <span>Opponent wins</span>
          </div>
          {lesson && <p className="eq-lesson">{lesson}</p>}
          {board.trim().split(/\s+/).filter(Boolean).length < 5 && (
            <>
              <h4>Can you call a bet?</h4>
              <p className="note">If the opponent bets and you call, you need at least this much equity to break even (ignoring future betting). Your equity: {(res.equity * 100).toFixed(1)}%.</p>
              <table className="price-table">
                <thead>
                  <tr>
                    <th>Bet size</th>
                    <th>Equity needed</th>
                    <th>Call?</th>
                  </tr>
                </thead>
                <tbody>
                  {PRICES.map(([label, f]) => {
                    const need = f / (1 + 2 * f);
                    const ok = res.equity >= need;
                    return (
                      <tr key={label}>
                        <td>{label}</td>
                        <td>{(need * 100).toFixed(1)}%</td>
                        <td className={ok ? 'ok' : 'no'}>{ok ? '✓ profitable on price alone' : '✗ needs more (implied odds or fold equity)'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
          <p className="note">
            {res.method === 'exact'
              ? `Exact enumeration over ${res.samples.toLocaleString()} (opponent combo, runout) pairs.`
              : `Monte Carlo simulation: ${res.samples.toLocaleString()} samples, standard error ±${(res.stdError * 100).toFixed(2)}% (95% interval ±${(196 * res.stdError).toFixed(2)}%).`}{' '}
            Card removal applied. Ties count as half. Equity is the share of the pot you would win if all cards were dealt with no more betting — it is not the same as how profitable a hand is to play.
          </p>
        </div>
      )}
    </div>
  );
}
