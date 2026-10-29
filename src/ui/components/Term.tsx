import { useId, useState } from 'react';
import { GLOSSARY } from '../../content/glossary';

/** Inline glossary term with an accessible tooltip (hover, focus or tap). */
export function Term({ id, children }: { id: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const g = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const tid = useId();
  if (!g) return <>{children}</>;
  return (
    <span className="term" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="term-btn" aria-describedby={open ? tid : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((o) => !o)}>
        {children ?? g.term}
      </button>
      {open && (
        <span role="tooltip" id={tid} className="tooltip">
          <strong>{g.term}.</strong> {g.def}
        </span>
      )}
    </span>
  );
}
