import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { HandRecord, exportData, importData, reset, DecisionSummary } from '../../persistence/storage';
import { CONCEPTS, ConceptId } from '../../content/concepts';
import { LESSONS, LESSON_INDEX } from '../../content/lessons';
import { SCORING_VERSION } from '../../evaluation/evaluate';

interface Agg {
  key: string;
  n: number;
  avg: number;
  mistakes: number;
}

function aggregate(rows: { key: string; d: DecisionSummary }[]): Agg[] {
  const m = new Map<string, { n: number; sum: number; mistakes: number }>();
  for (const { key, d } of rows) {
    if (d.points === null) continue;
    const a = m.get(key) ?? { n: 0, sum: 0, mistakes: 0 };
    a.n++;
    a.sum += d.points;
    if (d.grade === 'mistake' || d.grade === 'blunder' || d.grade === 'inaccuracy') a.mistakes++;
    m.set(key, a);
  }
  return [...m.entries()].map(([key, a]) => ({ key, n: a.n, avg: a.sum / a.n, mistakes: a.mistakes }));
}

const MIN_N = 5;

export function ProgressPage() {
  const { data, replaceAll } = useStore();
  const [assistedView, setAssistedView] = useState<'unassisted' | 'assisted'>('unassisted');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hist = data.history;
  const pick = (h: HandRecord) => (assistedView === 'assisted' ? h.assisted : !h.assisted);
  const decs = useMemo(() => hist.flatMap((h) => h.decisions.filter((d) => (assistedView === 'assisted' ? d.assisted : !d.assisted)).map((d) => ({ h, d }))), [hist, assistedView]);
  const byConcept = useMemo(() => aggregate(decs.flatMap(({ d }) => d.concepts.map((c) => ({ key: c, d })))), [decs]);
  const byStreet = useMemo(() => aggregate(decs.map(({ d }) => ({ key: d.street, d }))), [decs]);
  const byPos = useMemo(() => aggregate(decs.filter(({ d }) => d.isKey).map(({ h, d }) => ({ key: h.heroPosition, d }))), [decs]);
  const byDiff = useMemo(() => aggregate(decs.map(({ h, d }) => ({ key: h.difficulty, d }))), [decs]);
  const scored = byConcept.filter((a) => a.n >= MIN_N).sort((a, b) => a.avg - b.avg);
  const weak = scored.filter((a) => a.avg < 80).slice(0, 4);
  const strong = [...scored].reverse().filter((a) => a.avg >= 80).slice(0, 4);
  const handsUn = hist.filter((h) => !h.assisted);
  const handsAs = hist.filter((h) => h.assisted);
  const avg = (xs: HandRecord[]) => {
    const s = xs.filter((h) => h.score !== null);
    return s.length ? s.reduce((a, h) => a + (h.score as number), 0) / s.length : null;
  };
  const versions = new Set(hist.map((h) => h.scoringVersion));
  const lessonsDone = Object.values(data.lessons).filter((l) => l.completed).length;

  const doExport = () => {
    const blob = new Blob([exportData(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `poker-trainer-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = async (file: File, mode: 'merge' | 'replace') => {
    try {
      const text = await file.text();
      const next = importData(text, data, mode);
      replaceAll(next);
      setMsg(`Imported (${mode}). ${next.history.length} hands, ${next.ranges.length} saved ranges.`);
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page progress">
      <header className="page-head">
        <p className="eyebrow">Your results</p>
        <h1>Progress</h1>
        <p className="lead">How your decisions are scoring, where you are strong, and what to work on next.</p>
      </header>
      {hist.length === 0 ? (
        <div className="empty">
          <p>No hands played yet. <Link to="/practice">Play a few hands</Link> and your scores will show up here.</p>
        </div>
      ) : (
        <>
          <section className="tiles">
            <div className="tile">
              <span className="tile-n">{hist.length}</span>
              <span className="tile-l">scenarios completed</span>
            </div>
            <div className="tile">
              <span className="tile-n">{avg(handsUn)?.toFixed(0) ?? '—'}</span>
              <span className="tile-l">avg score, unassisted ({handsUn.length})</span>
            </div>
            <div className="tile">
              <span className="tile-n">{avg(handsAs)?.toFixed(0) ?? '—'}</span>
              <span className="tile-l">avg score, assisted ({handsAs.length})</span>
            </div>
            <div className="tile">
              <span className="tile-n">
                {lessonsDone}/{LESSONS.length}
              </span>
              <span className="tile-l">lessons completed</span>
            </div>
            <div className="tile">
              <span className="tile-n">{hist.filter((h) => h.bookmarked).length}</span>
              <span className="tile-l">bookmarked hands</span>
            </div>
          </section>
          {versions.size > 1 && <p className="banner warn">Your history contains hands scored with different scoring versions ({[...versions].join(', ')}; current {SCORING_VERSION}). Compare them with care.</p>}
          <div className="seg" role="radiogroup" aria-label="Which decisions to analyze">
            {(['unassisted', 'assisted'] as const).map((v) => (
              <button key={v} role="radio" aria-checked={assistedView === v} className={assistedView === v ? 'on' : ''} onClick={() => setAssistedView(v)}>
                {v === 'unassisted' ? 'Unassisted decisions' : 'Assisted decisions'}
              </button>
            ))}
          </div>
          <p className="note">Assisted practice (hints, pot odds, equity help or immediate feedback) is kept separate from unassisted decisions. Figures are averages of instructional decision scores; unscored decisions are excluded. Categories need at least {MIN_N} scored decisions before they are called a strength or weakness.</p>
          <section className="grid2">
            <div>
              <h2>Suggested practice</h2>
              {weak.length ? (
                <ul className="suggest">
                  {weak.map((w) => {
                    const c = CONCEPTS[w.key as ConceptId];
                    return (
                      <li key={w.key}>
                        <strong>{c?.name ?? w.key}</strong> — average {w.avg.toFixed(0)} over {w.n} decisions ({w.mistakes} below “reasonable”).{' '}
                        <Link to={`/practice?concept=${w.key}`}>Practice</Link>
                        {c && LESSON_INDEX[c.lesson] && (
                          <>
                            {' · '}
                            <Link to={`/learn/${c.lesson}`}>Read: {LESSON_INDEX[c.lesson].title}</Link>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="note">No repeated weaknesses yet (or not enough decisions per concept). Recommendations are optional — every topic stays open.</p>
              )}
            </div>
            <div>
              <h2>Strengths</h2>
              {strong.length ? (
                <ul>
                  {strong.map((s) => (
                    <li key={s.key}>
                      <strong>{CONCEPTS[s.key as ConceptId]?.name ?? s.key}</strong> — average {s.avg.toFixed(0)} over {s.n} decisions
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">Not enough scored decisions yet.</p>
              )}
            </div>
          </section>
          <section>
            <h2>Score trend ({assistedView})</h2>
            <TrendChart hands={hist.filter(pick)} />
          </section>
          <section className="grid2">
            <BarList title="By concept" rows={byConcept.map((a) => ({ ...a, label: CONCEPTS[a.key as ConceptId]?.name ?? a.key }))} />
            <div>
              <BarList title="By street" rows={byStreet.map((a) => ({ ...a, label: a.key }))} />
              <BarList title="By position (key decisions)" rows={byPos.map((a) => ({ ...a, label: a.key }))} />
              <BarList title="By difficulty" rows={byDiff.map((a) => ({ ...a, label: a.key }))} note="Scores at different difficulties are not directly comparable: harder settings use more ambiguous spots and lower-confidence evaluations." />
            </div>
          </section>
        </>
      )}
      <section className="data-tools">
        <h2>Your data</h2>
        <p className="note">Everything is stored in this browser (no account). Export to keep a backup or move to another device.</p>
        <div className="row">
          <button className="btn" onClick={doExport} disabled={hist.length === 0 && data.ranges.length === 0 && lessonsDone === 0}>
            Export history
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0], 'merge')} aria-label="Import file" />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import (merge)
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Delete all hands, lesson progress and saved ranges from this browser? This cannot be undone (export first if unsure).')) {
                replaceAll(reset());
                setMsg('All data reset.');
              }
            }}
          >
            Reset everything
          </button>
        </div>
        {msg && <p role="status">{msg}</p>}
      </section>
    </div>
  );
}

function BarList({ title, rows, note }: { title: string; rows: (Agg & { label: string })[]; note?: string }) {
  const sorted = [...rows].sort((a, b) => b.n - a.n);
  return (
    <div className="barlist">
      <h3>{title}</h3>
      {sorted.length === 0 ? (
        <p className="note">No scored decisions yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Avg score</th>
              <th scope="col">n</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} className={r.n < MIN_N ? 'low-n' : ''}>
                <th scope="row">{r.label}</th>
                <td>
                  <span className="bar" style={{ width: `${Math.max(2, r.avg)}%` }} aria-hidden="true" />
                  <span className="bar-v">{r.avg.toFixed(0)}</span>
                </td>
                <td>
                  {r.n}
                  {r.n < MIN_N ? '*' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sorted.some((r) => r.n < MIN_N) && <p className="note">* fewer than {MIN_N} decisions — too few to draw conclusions.</p>}
      {note && <p className="note">{note}</p>}
    </div>
  );
}

/** Rolling-average line of hand scores, with hover crosshair and a table view. */
function TrendChart({ hands }: { hands: HandRecord[] }) {
  const pts = hands.filter((h) => h.score !== null);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  if (pts.length < 2) return <p className="note">Play at least two scored scenarios to see a trend.</p>;
  const win = Math.min(10, Math.max(2, Math.floor(pts.length / 4)));
  const series = pts.map((h, i) => {
    const slice = pts.slice(Math.max(0, i - win + 1), i + 1);
    return { i, raw: h.score as number, avg: slice.reduce((a, x) => a + (x.score as number), 0) / slice.length, date: h.createdAt, title: h.title };
  });
  const W = 640;
  const H = 200;
  const pad = { l: 34, r: 12, t: 10, b: 24 };
  const x = (i: number) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const path = series.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  const h = hover !== null ? series[hover] : null;
  return (
    <div className="viz-root trend">
      <div className="legend">
        <span className="sw line" /> Rolling average (last {win} hands) <span className="sw dot" /> individual hand scores
        <button className="linklike" onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <table className="trend-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Scenario</th>
              <th>Score</th>
              <th>Rolling avg</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.i}>
                <td>{p.i + 1}</td>
                <td>{new Date(p.date).toLocaleDateString()}</td>
                <td>{p.title}</td>
                <td>{p.raw}</td>
                <td>{p.avg.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Score trend over ${series.length} hands; latest rolling average ${series[series.length - 1].avg.toFixed(0)}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const k = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (series.length - 1));
            setHover(Math.max(0, Math.min(series.length - 1, k)));
          }}
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={pad.l - 6} y={y(v) + 4} className="axis" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {series.map((p) => (
            <circle key={p.i} cx={x(p.i)} cy={y(p.raw)} r={3} className="pt" />
          ))}
          <path d={path} className="line" fill="none" />
          <text x={x(series.length - 1)} y={y(series[series.length - 1].avg) - 8} className="dlabel" textAnchor="end">
            {series[series.length - 1].avg.toFixed(0)}
          </text>
          {h && (
            <g>
              <line x1={x(h.i)} x2={x(h.i)} y1={pad.t} y2={H - pad.b} className="cross" />
              <circle cx={x(h.i)} cy={y(h.avg)} r={5} className="hov" />
            </g>
          )}
        </svg>
      )}
      {h && !table && (
        <div className="tt" role="status">
          Hand {h.i + 1} · {new Date(h.date).toLocaleDateString()} · {h.title}: score {h.raw}, rolling average {h.avg.toFixed(0)}
        </div>
      )}
    </div>
  );
}
