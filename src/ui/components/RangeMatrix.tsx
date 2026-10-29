import { useRef } from 'react';
import { classAt, HandClass, comboCount } from '../../ranges/hands';

export interface CellView {
  raise?: number; // 0..1
  call?: number;
  weight?: number; // for single-colour ranges
  tone?: 'a' | 'b' | 'both' | 'value' | 'bluff' | 'ref' | 'miss' | 'extra' | 'new' | 'dropped' | 'none';
  /** fade the cell (used to highlight a hand family or a difference) */
  dim?: boolean;
  blocked?: number; // fraction of combos blocked by dead cards
  disabled?: boolean;
  label?: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function background(v: CellView): string {
  if (v.tone && v.tone !== 'none') return '';
  const r = v.raise ?? 0;
  const c = v.call ?? 0;
  if (v.weight !== undefined) {
    const w = v.weight;
    return w > 0 ? `linear-gradient(to top, var(--range-fill) ${pct(w)}, transparent ${pct(w)})` : '';
  }
  if (r + c <= 0) return '';
  return `linear-gradient(to right, var(--raise) 0 ${pct(r)}, var(--call) ${pct(r)} ${pct(r + c)}, var(--fold-cell) ${pct(r + c)} 100%)`;
}

export function RangeMatrix({
  cells,
  onPaint,
  onSelect,
  selected,
  showNumbers,
  ariaLabel,
}: {
  cells: (h: HandClass) => CellView;
  onPaint?: (h: HandClass, first: boolean) => void;
  onSelect?: (h: HandClass) => void;
  selected?: HandClass | null;
  showNumbers?: boolean;
  ariaLabel: string;
}) {
  const painting = useRef(false);
  const last = useRef<string | null>(null);
  const hit = (h: HandClass, first: boolean) => {
    if (!onPaint) return;
    if (!first && last.current === h) return;
    last.current = h;
    onPaint(h, first);
  };
  const fromPoint = (e: React.PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const h = el?.closest('[data-hand]')?.getAttribute('data-hand');
    return h ?? null;
  };
  return (
    <div className="matrix-wrap">
      <div
        className={`matrix ${onPaint ? 'paintable' : ''}`}
        role="grid"
        aria-label={ariaLabel}
        onPointerUp={() => {
          painting.current = false;
          last.current = null;
        }}
        onPointerLeave={() => {
          painting.current = false;
          last.current = null;
        }}
        onPointerMove={(e) => {
          if (!painting.current) return;
          const h = fromPoint(e);
          if (h) hit(h, false);
        }}
      >
        {Array.from({ length: 13 }, (_, r) => (
          <div role="row" key={r} className="matrix-row">
            {Array.from({ length: 13 }, (_, c) => {
              const h = classAt(r, c);
              const v = cells(h);
              const r0 = v.raise ?? 0;
              const c0 = v.call ?? 0;
              const desc =
                v.label ??
                (v.weight !== undefined ? `${pct(v.weight)} included` : r0 + c0 > 0 ? `${r0 ? `raise ${pct(r0)}` : ''}${r0 && c0 ? ', ' : ''}${c0 ? `call ${pct(c0)}` : ''}` : 'fold');
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={h}
                  data-hand={h}
                  className={`cell ${r === c ? 'pair' : r < c ? 'suited' : 'offsuit'} ${v.tone ? `t-${v.tone}` : ''} ${selected === h ? 'sel' : ''} ${v.disabled ? 'dis' : ''} ${v.dim ? 'dimmed' : ''}`}
                  style={{ backgroundImage: background(v) || undefined, opacity: v.blocked ? Math.max(0.25, 1 - v.blocked) : undefined }}
                  aria-label={`${h}: ${desc}${v.blocked ? `, ${pct(v.blocked)} of combos blocked` : ''}, ${comboCount(h)} combos`}
                  aria-pressed={v.weight !== undefined ? v.weight > 0 : undefined}
                  onPointerDown={(e) => {
                    if (onPaint) {
                      e.preventDefault();
                      painting.current = true;
                      hit(h, true);
                    }
                  }}
                  onClick={() => onSelect?.(h)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && onPaint) {
                      e.preventDefault();
                      onPaint(h, true);
                    }
                  }}
                  disabled={v.disabled}
                >
                  <span className="cell-h">{h}</span>
                  {showNumbers && (
                    <span className="cell-n">
                      {v.weight !== undefined ? (v.weight > 0 ? Math.round(v.weight * 100) : '') : r0 + c0 > 0 ? `${r0 ? `R${Math.round(r0 * 100)}` : ''}${c0 ? ` C${Math.round(c0 * 100)}` : ''}` : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatrixLegend({ kind }: { kind: 'chart' | 'weight' | 'compare' | 'drill' }) {
  const items: [string, string][] =
    kind === 'chart'
      ? [
          ['raise', 'Raise / 3-bet / shove'],
          ['call', 'Call'],
          ['fold', 'Fold'],
        ]
      : kind === 'weight'
        ? [['fill', 'Included (fill height = weight)']]
        : kind === 'compare'
          ? [
              ['a', 'Only A'],
              ['b', 'Only B'],
              ['both', 'Both'],
            ]
          : [
              ['value', 'Value'],
              ['bluff', 'Bluff'],
              ['fill', 'Selected'],
            ];
  return (
    <div className="legend" aria-label="Legend">
      {items.map(([sw, label]) => (
        <span key={sw} className="li">
          <span className={`sw ${sw}`} /> {label}
        </span>
      ))}
      {kind === 'chart' && <span className="li note">Split cells are mixed strategies.</span>}
    </div>
  );
}
