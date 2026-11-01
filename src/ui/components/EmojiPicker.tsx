// The chat's emoji picker: every emoji by category, a search by name, and the ones you used last
// (kept in this browser only). The full list is loaded the first time the picker opens.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EmojiGroup } from '../emojiData';

const RECENT_KEY = 'chat-recent-emoji';
const RECENT_MAX = 24;
/** shown under Recent until you have used some of your own */
const STARTERS = ['😂', '👍', '🔥', '😎', '🤔', '😭', '😬', '🤯', '👏', '🙏', '💪', '🎉', '🍀', '🃏', '♠️', '♥️', '♦️', '♣️', '💰', '🐟', '🦈', '😡', '🥶', '👋'];

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((e) => typeof e === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

let loaded: Promise<EmojiGroup[]> | null = null;
const loadGroups = () => (loaded ??= import('../emojiData').then((m) => m.EMOJI_GROUPS));

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const [tab, setTab] = useState('recent');
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadGroups().then(
      (g) => live && setGroups(g),
      () => {
        loaded = null;
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !groups) return null;
    return groups.flatMap((g) => g.emoji).filter(([, name]) => name.includes(q));
  }, [query, groups]);
  const names = useMemo(() => new Map(groups?.flatMap((g) => g.emoji)), [groups]);

  const pick = (emoji: string) => {
    onPick(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* only remembered until the page closes */
    }
  };

  const jump = (id: string) => {
    setQuery('');
    setTab(id);
    requestAnimationFrame(() => {
      const box = grid.current;
      const head = box?.querySelector<HTMLElement>(`[data-group="${id}"]`);
      if (box && head) box.scrollTop = head.offsetTop - box.offsetTop;
    });
  };

  // the tab follows whichever category is at the top of the grid as you scroll
  const onScroll = () => {
    const box = grid.current;
    if (!box || results) return;
    let current = 'recent';
    for (const head of box.querySelectorAll<HTMLElement>('[data-group]')) {
      if (head.offsetTop - box.offsetTop <= box.scrollTop + 8) current = head.dataset.group!;
    }
    setTab(current);
  };

  const cell = ([emoji, name]: [string, string]) => (
    <button key={emoji} type="button" title={name} aria-label={name} onClick={() => pick(emoji)}>
      {emoji}
    </button>
  );
  const recentList = recent.length ? recent : STARTERS;

  return (
    <div className="emoji-picker" role="dialog" aria-label="Emoji">
      <input
        className="emoji-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search emoji"
        aria-label="Search emoji"
        autoComplete="off"
        disabled={!groups}
      />
      {!results && (
        <nav className="emoji-tabs" aria-label="Emoji categories">
          <button type="button" aria-label="Recent" title="Recent" aria-current={tab === 'recent'} onClick={() => jump('recent')}>
            🕘
          </button>
          {groups?.map((g) => (
            <button key={g.id} type="button" aria-label={g.label} title={g.label} aria-current={tab === g.id} onClick={() => jump(g.id)}>
              {g.icon}
            </button>
          ))}
        </nav>
      )}
      <div className="emoji-grid-wrap" ref={grid} onScroll={onScroll}>
        {results ? (
          results.length ? (
            <div className="emoji-grid">{results.map(cell)}</div>
          ) : (
            <p className="emoji-note">No emoji match “{query.trim()}”.</p>
          )
        ) : (
          <>
            <h3 className="emoji-head" data-group="recent">
              {recent.length ? 'Recent' : 'Table favourites'}
            </h3>
            <div className="emoji-grid">{recentList.map((e) => cell([e, names.get(e) ?? e]))}</div>
            {groups?.map((g) => (
              <section key={g.id} aria-label={g.label}>
                <h3 className="emoji-head" data-group={g.id}>
                  {g.label}
                </h3>
                <div className="emoji-grid">{g.emoji.map(cell)}</div>
              </section>
            ))}
            {!groups && <p className="emoji-note">{failed ? 'Could not load the rest of the emoji. Check your connection.' : 'Loading emoji…'}</p>}
          </>
        )}
      </div>
    </div>
  );
}
