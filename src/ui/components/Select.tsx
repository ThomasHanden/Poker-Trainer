// A styled replacement for <select>: same props and <option> children, but the open list is drawn
// by the app so it matches the site on every platform. Keyboard: arrows, Home/End, Enter/Space,
// Escape, Tab, and type-to-jump.

import { Children, ReactElement, ReactNode, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Opt {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (ch) => {
    if (!isValidElement(ch)) return;
    const el = ch as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>;
    if (el.type === 'option') {
      const label = Children.toArray(el.props.children).join('');
      out.push({ value: String(el.props.value ?? label), label, disabled: el.props.disabled, group });
    } else if (el.type === 'optgroup') collect(el.props.children, el.props.label, out);
    else if (el.props.children) collect(el.props.children, group, out);
  });
  return out;
}

export interface SelectProps {
  value?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

export function Select({ value, onChange, children, disabled, className, id, ...rest }: SelectProps) {
  const opts = collect(children);
  const current = String(value ?? '');
  const selIndex = Math.max(0, opts.findIndex((o) => o.value === current));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selIndex);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const uid = useId();

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const want = Math.min(320, opts.length * 40 + 12);
    const up = below < Math.min(want, 200) && above > below;
    const width = Math.max(r.width, 180);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, width, up, maxH: Math.max(140, Math.min(320, up ? above : below)) });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || list.current?.contains(t)) return;
      setOpen(false);
    };
    const reflow = () => place();
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const choose = (i: number) => {
    const o = opts[i];
    if (!o || o.disabled) return;
    setOpen(false);
    btn.current?.focus();
    if (o.value !== current) onChange?.({ target: { value: o.value } });
  };

  const move = (d: number) => {
    let i = active;
    for (let k = 0; k < opts.length; k++) {
      i = (i + d + opts.length) % opts.length;
      if (!opts[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setActive(selIndex);
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(opts.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const i = opts.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    } else return;
    e.preventDefault();
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn}
        type="button"
        id={id}
        className={`select-btn ${open ? 'open' : ''} ${className ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-label={rest['aria-label']}
        data-testid={rest['data-testid']}
        data-value={current}
        disabled={disabled}
        onClick={() => {
          setActive(selIndex);
          setOpen((o) => !o);
        }}
        onKeyDown={onKey}
      >
        <span className="select-value">{opts[selIndex]?.label ?? ''}</span>
        <svg className="select-chev" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={list}
            id={`${uid}-list`}
            role="listbox"
            className={`select-pop ${pos.up ? 'up' : ''}`}
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH }}
            aria-activedescendant={`${uid}-${active}`}
            tabIndex={-1}
            onKeyDown={onKey}
          >
            {opts.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={`${o.value}-${i}`} role="presentation">
                  {header && <div className="select-group">{header}</div>}
                  <div
                    id={`${uid}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={o.value === current}
                    aria-disabled={o.disabled || undefined}
                    className={`select-opt ${i === active ? 'active' : ''} ${o.value === current ? 'sel' : ''} ${o.disabled ? 'dis' : ''}`}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(i)}
                  >
                    <span>{o.label}</span>
                    {o.value === current && (
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
                        <path d="M3 7.5 5.8 10 11 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
