import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { RangeMatrix, MatrixLegend, CellView } from '../components/RangeMatrix';
import { allChartsIncludingComputed, Chart, chartFreq, chartPlayRange } from '../../ranges/presets';
import { ALL_CLASSES, HandClass, Range, emptyRange, parseRange, formatRange, rangeCombos, rangePercent, compareRanges, blockedFraction, describeClass, comboCount } from '../../ranges/hands';
import { parseCards, Card } from '../../engine/cards';
import { explainPreflopHand } from '../../scenarios/templates/helpers';
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
      <h1>Ranges</h1>
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

// ---------------- Presets ----------------

function Presets() {
  const charts = useMemo(() => allChartsIncludingComputed(), []);
  const [group, setGroup] = useState<string>('open');
  const [pos, setPos] = useState('any');
  const [stack, setStack] = useState('any');
  const filtered = charts.filter((c) => (group === 'any' || c.group === group) && (pos === 'any' || c.position === pos) && (stack === 'any' || String(c.stackBB) === stack));
  const [id, setId] = useState(filtered[0]?.id ?? charts[0].id);
  const chart = charts.find((c) => c.id === id) ?? filtered[0] ?? charts[0];
  useEffect(() => {
    if (filtered.length && !filtered.some((c) => c.id === id)) setId(filtered[0].id);
  }, [filtered, id]);
  const [deadText, setDeadText] = useState('');
  const dead = parseDead(deadText);
  const [sel, setSel] = useState<HandClass | null>(null);
  const [nums, setNums] = useState(false);
  const play = chartPlayRange(chart);
  const groups = [...new Set(charts.map((c) => c.group))];
  const positions = [...new Set(charts.map((c) => c.position))];
  const stacks = [...new Set(charts.map((c) => String(c.stackBB)))].sort((a, b) => Number(a) - Number(b));
  return (
    <div className="ranges-grid">
      <div>
        <div className="filters">
          <label>
            Type
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="any">Any</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            Position
            <select value={pos} onChange={(e) => setPos(e.target.value)}>
              <option value="any">Any</option>
              {positions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Stack (bb)
            <select value={stack} onChange={(e) => setStack(e.target.value)}>
              <option value="any">Any</option>
              {stacks.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="grow">
            Chart
            <select value={chart.id} onChange={(e) => setId(e.target.value)}>
              {filtered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <RangeMatrix
          ariaLabel={`${chart.name} chart`}
          cells={(h) => {
            const f = chartFreq(chart, h);
            return { raise: f.raise, call: f.call, blocked: dead.cards.length ? blockedFraction(h, dead.cards) : undefined };
          }}
          onSelect={setSel}
          selected={sel}
          showNumbers={nums}
        />
        <MatrixLegend kind="chart" />
        <label className="inline">
          <input type="checkbox" checked={nums} onChange={(e) => setNums(e.target.checked)} /> Show frequencies as numbers
        </label>
      </div>
      <div className="side">
        <ChartInfo chart={chart} play={play} dead={dead.cards} />
        <label>
          Known cards (card removal), e.g. <code>As Kd</code>
          <input value={deadText} onChange={(e) => setDeadText(e.target.value)} aria-invalid={!!dead.error} />
        </label>
        {dead.error && <p className="error">{dead.error}</p>}
        {sel ? (
          <div className="why-box">
            <h3>
              Why {sel} ({describeClass(sel)})?
            </h3>
            <ul>
              {explainPreflopHand(sel, chartFreq(chart, sel), chart).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <p className="note">
              {comboCount(sel)} combos{dead.cards.length ? `, ${Math.round(comboCount(sel) * (1 - blockedFraction(sel, dead.cards)))} after card removal` : ''}.
            </p>
          </div>
        ) : (
          <p className="note">Select a hand to see why it is (or is not) in the range.</p>
        )}
      </div>
    </div>
  );
}

function ChartInfo({ chart, play, dead }: { chart: Chart; play: Range; dead: Card[] }) {
  const rc = rangeCombos(chart.raise, dead);
  const cc = rangeCombos(chart.call, dead);
  return (
    <div className="chart-info">
      <h3>{chart.name}</h3>
      <p>
        <span className={`badge ${chart.confidence}`}>{chart.confidence === 'computed' ? 'Computed (stated model)' : 'Illustrative baseline'}</span>
      </p>
      <p>
        <strong>Prior action:</strong> {chart.priorAction}
        <br />
        <strong>Sizing:</strong> {chart.sizing}
        <br />
        <strong>Format:</strong> {chart.format}, {chart.tableSize === 2 ? 'heads-up' : `${chart.tableSize}-max`}, {chart.stackBB}bb
      </p>
      <p>
        {chart.raiseLabel}: {rc.toFixed(0)} combos ({((100 * rc) / 1326).toFixed(1)}%)
        {cc > 0 && (
          <>
            {' '}
            · {chart.callLabel ?? 'Call'}: {cc.toFixed(0)} combos ({((100 * cc) / 1326).toFixed(1)}%)
          </>
        )}{' '}
        · Plays {rangePercent(play, dead).toFixed(1)}% of {dead.length ? 'remaining' : 'all'} hands
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
        <summary>Export ({chart.raiseLabel.toLowerCase()} range)</summary>
        <textarea readOnly value={formatRange(chart.raise)} rows={4} aria-label="Exported range text" />
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
        <RangeMatrix ariaLabel="Editable range" cells={(h) => ({ weight: range[h] ?? 0, blocked: dead.cards.length ? blockedFraction(h, dead.cards) : undefined })} onPaint={paint} showNumbers />
        <MatrixLegend kind="weight" />
        <p className="stats" data-testid="range-stats">
          {combos.toFixed(1)} combos · {rangePercent(range, dead.cards).toFixed(1)}% of {dead.cards.length ? 'remaining' : 'all'} hands
        </p>
        <p className="note">Click or drag to paint with the selected weight. Clicking a cell that already has the brush weight clears it. Keyboard: Tab to a cell and press Enter.</p>
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
        <h3>Comparison</h3>
        <p>
          A: {cmp.combosA.toFixed(0)} combos ({((100 * cmp.combosA) / 1326).toFixed(1)}%) · B: {cmp.combosB.toFixed(0)} combos ({((100 * cmp.combosB) / 1326).toFixed(1)}%)
        </p>
        <p>
          Overlap: {cmp.overlapCombos.toFixed(0)} combos · similarity {(cmp.similarity * 100).toFixed(0)}% (weighted overlap ÷ union)
        </p>
        <p>
          <strong>Only in A:</strong> {cmp.onlyA.join(', ') || 'none'}
        </p>
        <p>
          <strong>Only in B:</strong> {cmp.onlyB.join(', ') || 'none'}
        </p>
        <p>
          <strong>Different weights:</strong> {cmp.differentWeight.join(', ') || 'none'}
        </p>
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
  { kind: 'continue', title: 'Continue vs a river bet', blurb: 'Pick the bluff-catchers that should call; answers are exact river equities vs the modelled betting range.' },
  { kind: 'value-bluff', title: 'Value bets and bluffs', blurb: 'Sort river hands into value bets, bluffs and checks.' },
  { kind: 'blockers', title: 'Useful blockers', blurb: 'Choose the holding that removes the most of the opponent’s strongest hands.' },
  { kind: 'board-advantage', title: 'Who does the board favour?', blurb: 'Predict which preflop range benefits from a flop.' },
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

function EquityCalc() {
  const opts = useRangeOptions();
  const [hero, setHero] = useState('Ah Kh');
  const [board, setBoard] = useState('');
  const [rid, setRid] = useState(opts.find((o) => o.id === 'cash6-open-CO')?.id ?? opts[0].id);
  const [custom, setCustom] = useState('');
  const [res, setRes] = useState<EquityResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const calc = async () => {
    setErr(null);
    setRes(null);
    try {
      const h = parseCards(hero);
      if (h.length !== 2) throw new Error('Enter exactly two hole cards.');
      const b = board.trim() ? parseCards(board) : [];
      if (b.length > 5 || b.length === 1 || b.length === 2) throw new Error('A board has 0, 3, 4 or 5 cards.');
      const all = [...h, ...b];
      if (new Set(all).size !== all.length) throw new Error('Duplicate card.');
      const text = custom.trim() ? custom : formatRange(opts.find((o) => o.id === rid)!.range);
      parseRange(text);
      setBusy(true);
      setRes(await run<EquityResult>({ kind: 'equity', hero: h, ranges: [text], board: b, samples: 40000 }));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="equity-calc">
      <div className="grid2">
        <label>
          Your hand
          <input value={hero} onChange={(e) => setHero(e.target.value)} />
        </label>
        <label>
          Board (optional)
          <input value={board} onChange={(e) => setBoard(e.target.value)} placeholder="e.g. Ks 7d 2c" />
        </label>
        <label>
          Opponent range
          <select value={rid} onChange={(e) => setRid(e.target.value)}>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          …or custom range text
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. TT+,AQs+,AKo" />
        </label>
      </div>
      <button className="btn primary" onClick={calc} disabled={busy}>
        {busy ? 'Calculating…' : 'Calculate equity'}
      </button>
      {err && <p className="error">{err}</p>}
      {res && (
        <div className="eq-result" role="status">
          <p>
            Equity: <strong>{(res.equity * 100).toFixed(2)}%</strong> (win {(res.win * 100).toFixed(1)}%, tie {(res.tie * 100).toFixed(1)}%)
          </p>
          <p className="note">
            {res.method === 'exact'
              ? `Exact enumeration over ${res.samples.toLocaleString()} (opponent combo, runout) pairs.`
              : `Monte Carlo simulation: ${res.samples.toLocaleString()} samples, standard error ±${(res.stdError * 100).toFixed(2)}% (95% interval ±${(196 * res.stdError).toFixed(2)}%).`}{' '}
            Card removal applied. Ties count as half.
          </p>
        </div>
      )}
    </div>
  );
}
