import { useId, useLayoutEffect, useRef, useState } from 'react';
import { GLOSSARY } from '../../content/glossary';

/** Inline glossary term with an accessible tooltip (hover, focus or tap). */
export function Term({ id, children }: { id: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const g = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const tid = useId();
  const tip = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  // keep the tooltip inside the screen when the term sits near the right edge
  useLayoutEffect(() => {
    if (!open || !tip.current) return setShift(0);
    const r = tip.current.getBoundingClientRect();
    const over = r.right - shift - (document.documentElement.clientWidth - 8);
    setShift(over > 0 ? over : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!g) return <>{children}</>;
  return (
    <span className="term" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="term-btn" aria-describedby={open ? tid : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((o) => !o)}>
        {children ?? g.term}
      </button>
      {open && (
        <span role="tooltip" id={tid} className="tooltip" ref={tip} style={shift ? { left: -shift } : undefined}>
          <strong>{g.term}.</strong> {g.def}
        </span>
      )}
    </span>
  );
}
