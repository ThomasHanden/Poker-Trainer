import { CSSProperties, useRef } from 'react';
import { Card as C, rankOf, suitOf, RANKS, SUIT_SYMBOLS, SUIT_NAMES } from '../../engine/cards';

const RANK_LABEL = (r: number) => (RANKS[r] === 'T' ? '10' : RANKS[r]);

/** Seconds between cards when dealing, and how long each card takes to land. */
export const DEAL_GAP = 0.13;
export const DEAL_ANIM = 0.32;
/** Extra pause before the turn and river when several streets are dealt at once (an all-in runout). */
const STREET_GAP = 0.75;

export function PlayingCard({
  card,
  size = 'md',
  fourColor = false,
  className = '',
  style,
}: {
  card?: C;
  size?: 'sm' | 'md' | 'lg';
  fourColor?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (card === undefined) {
    return <span className={`pcard back ${size} ${className}`} style={style} aria-label="face-down card" />;
  }
  const r = rankOf(card);
  const s = suitOf(card);
  const color = fourColor ? ['club4', 'diamond4', 'heart', 'spade'][s] : s === 1 || s === 2 ? 'heart' : 'spade';
  return (
    <span className={`pcard ${size} ${color} ${className}`} style={style} aria-label={`${RANK_LABEL(r)} of ${SUIT_NAMES[s]}`} role="img">
      <span className="rank">{RANK_LABEL(r)}</span>
      <span className="suit" aria-hidden="true">{SUIT_SYMBOLS[s]}</span>
    </span>
  );
}

/**
 * Board delays: each card that was not on the board last render is dealt after the ones before it,
 * flop cards in quick succession and the turn and river after a pause. A card keeps its delay for as
 * long as it stays on the board, so re-renders do not restart its animation.
 */
function useDealDelays(cards: C[]): Map<C, number> {
  const delays = useRef(new Map<C, number>());
  const m = delays.current;
  for (const c of [...m.keys()]) if (!cards.includes(c)) m.delete(c);
  let t = 0;
  let first = true;
  cards.forEach((c, i) => {
    if (m.has(c)) return;
    if (!first) t += i >= 3 ? STREET_GAP : DEAL_GAP;
    m.set(c, t);
    first = false;
  });
  return m;
}

export function CardRow({
  cards,
  size,
  fourColor,
  placeholders = 0,
  deal = false,
}: {
  cards: C[];
  size?: 'sm' | 'md' | 'lg';
  fourColor?: boolean;
  placeholders?: number;
  /** animate cards as they are added (the board) */
  deal?: boolean;
}) {
  const delays = useDealDelays(cards);
  return (
    <span className="card-row">
      {cards.map((c) => (
        <PlayingCard key={c} card={c} size={size} fourColor={fourColor} className={deal ? 'deal' : ''} style={deal ? { animationDelay: `${delays.get(c)}s` } : undefined} />
      ))}
      {Array.from({ length: Math.max(0, placeholders - cards.length) }, (_, i) => (
        <span key={`p${i}`} className={`pcard empty ${size ?? 'md'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

export function cardText(c: C) {
  return `${RANK_LABEL(rankOf(c))}${SUIT_SYMBOLS[suitOf(c)]}`;
}
