import { Card as C, rankOf, suitOf, RANKS, SUIT_SYMBOLS, SUIT_NAMES } from '../../engine/cards';

const RANK_LABEL = (r: number) => (RANKS[r] === 'T' ? '10' : RANKS[r]);

export function PlayingCard({ card, size = 'md', fourColor = false }: { card?: C; size?: 'sm' | 'md' | 'lg'; fourColor?: boolean }) {
  if (card === undefined) {
    return <span className={`pcard back ${size}`} aria-label="face-down card" />;
  }
  const r = rankOf(card);
  const s = suitOf(card);
  const color = fourColor ? ['club4', 'diamond4', 'heart', 'spade'][s] : s === 1 || s === 2 ? 'heart' : 'spade';
  return (
    <span className={`pcard ${size} ${color}`} aria-label={`${RANK_LABEL(r)} of ${SUIT_NAMES[s]}`} role="img">
      <span className="rank">{RANK_LABEL(r)}</span>
      <span className="suit" aria-hidden="true">{SUIT_SYMBOLS[s]}</span>
    </span>
  );
}

export function CardRow({ cards, size, fourColor, placeholders = 0 }: { cards: C[]; size?: 'sm' | 'md' | 'lg'; fourColor?: boolean; placeholders?: number }) {
  return (
    <span className="card-row">
      {cards.map((c) => (
        <PlayingCard key={c} card={c} size={size} fourColor={fourColor} />
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
