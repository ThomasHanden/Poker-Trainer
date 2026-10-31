// Table chat on live tables: what the seated players say, a message box with a small emoji picker,
// and muting people (kept in this browser only). Messages are shown as text, never as HTML.
import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAT_MAX_CHARS, chatLength } from '../../multiplayer/chat';
import type { ChatLine } from '../useLiveTable';

const EMOJI = ['😀', '😂', '😅', '😎', '🤔', '😬', '😮', '😭', '😡', '😴', '🤯', '🥶', '👍', '👎', '👏', '🙏', '💪', '👋', '🔥', '💯', '🎉', '🍀', '❤️', '🃏', '♠️', '♥️', '♦️', '♣️'];
const MUTED_KEY = 'live-muted';

/** People you have muted, by player id; remembered in this browser. */
export function useMutes() {
  const [muted, setMuted] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(MUTED_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback((id: string) => {
    setMuted((old) => {
      const next = new Set(old);
      if (!next.delete(id)) next.add(id);
      try {
        localStorage.setItem(MUTED_KEY, JSON.stringify([...next].slice(-200)));
      } catch {
        /* only muted until the page closes */
      }
      return next;
    });
  }, []);
  return { muted, toggle };
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function LiveChat({
  id,
  lines,
  me,
  people,
  muted,
  onToggleMute,
  onSend,
  onClose,
  open,
}: {
  id: string;
  /** null: you are not seated, so you cannot see the chat */
  lines: ChatLine[] | null;
  /** your player id */
  me: string;
  /** the other people seated (not bots), for muting */
  people: { id: string; name: string }[];
  muted: Set<string>;
  onToggleMute: (id: string) => void;
  onSend: (text: string, retryCid?: string) => void;
  onClose: () => void;
  open: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [picker, setPicker] = useState(false);
  const [showMutes, setShowMutes] = useState(false);
  const [below, setBelow] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nearBottom = useRef(true);
  const len = chatLength(draft.trim());
  const tooLong = len > CHAT_MAX_CHARS;
  const shown = (lines ?? []).filter((l) => l.kind === 'system' || l.state || !muted.has(l.from ?? ''));

  // follow new messages only if you were already at the bottom; otherwise offer a jump down
  const toBottom = () => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    setBelow(false);
  };
  const last = shown[shown.length - 1];
  useLayoutEffect(() => {
    if (!open) return;
    if (nearBottom.current || last?.state === 'sending') toBottom();
    else setBelow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.length, last?.id, last?.state, open]);
  useEffect(() => {
    if (open) toBottom();
  }, [open]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || tooLong) return;
    onSend(text);
    setDraft('');
    setPicker(false);
    nearBottom.current = true;
  };

  const insert = (emoji: string) => {
    const el = input.current;
    const at = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? at;
    setDraft(draft.slice(0, at) + emoji + draft.slice(end));
    // back to the box at once, so Enter sends; the cursor goes after the emoji once it is drawn
    el?.focus();
    requestAnimationFrame(() => el?.setSelectionRange(at + emoji.length, at + emoji.length));
  };

  return (
    <section id={id} className={`live-chat ${open ? 'open' : ''}`} aria-label="Table chat" data-no-shortcuts onKeyDown={(e) => e.key === 'Escape' && (picker ? setPicker(false) : onClose())}>
      <header className="chat-head">
        <h2>Table chat</h2>
        {lines && people.length > 0 && (
          <button type="button" className="linklike chat-mute-toggle" aria-expanded={showMutes} onClick={() => setShowMutes((s) => !s)}>
            Mute{muted.size ? ` (${people.filter((p) => muted.has(p.id)).length})` : ''}
          </button>
        )}
        <button type="button" className="chat-close" aria-label="Close chat" onClick={onClose}>
          ×
        </button>
      </header>
      {showMutes && lines && (
        <ul className="chat-mutes" aria-label="Mute players">
          {people.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              <button type="button" className="btn small" aria-pressed={muted.has(p.id)} onClick={() => onToggleMute(p.id)}>
                {muted.has(p.id) ? 'Unmute' : 'Mute'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!lines ? (
        <p className="chat-empty">Sit down to chat with the table. Only seated players can read and send messages.</p>
      ) : (
        <>
          <ol
            className="chat-lines"
            ref={list}
            role="log"
            aria-label="Messages"
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              if (nearBottom.current) setBelow(false);
            }}
          >
            {shown.length === 0 && <li className="chat-sys">No messages yet. Say hello.</li>}
            {shown.map((l) =>
              l.kind === 'system' ? (
                <li key={`s${l.id}`} className="chat-sys">
                  {l.text}
                </li>
              ) : (
                <li key={l.cid ?? `m${l.id}`} className={`chat-line ${l.from === me || l.state ? 'mine' : ''}`}>
                  <span className="chat-meta">
                    <span className="chat-name">{l.from === me || l.state ? 'You' : l.name}</span>
                    <time dateTime={new Date(l.at).toISOString()}>{time(l.at)}</time>
                  </span>
                  <span className="chat-text">{l.text}</span>
                  {l.state === 'sending' && <span className="chat-state">Sending…</span>}
                  {l.state === 'failed' && (
                    <span className="chat-state bad" role="alert">
                      {l.error ?? 'Not delivered'}.{' '}
                      <button type="button" className="linklike" onClick={() => onSend(l.text, l.cid)}>
                        Try again
                      </button>
                    </span>
                  )}
                </li>
              ),
            )}
          </ol>
          {below && (
            <button type="button" className="chat-jump" onClick={toBottom}>
              New messages ↓
            </button>
          )}
          {picker && (
            <div className="chat-emoji" role="group" aria-label="Emoji">
              {EMOJI.map((em) => (
                <button key={em} type="button" onClick={() => insert(em)} aria-label={`Insert ${em}`}>
                  {em}
                </button>
              ))}
            </div>
          )}
          <form className="chat-form" onSubmit={send}>
            <button type="button" className="chat-emoji-btn" aria-label="Emoji" aria-expanded={picker} onClick={() => setPicker((p) => !p)}>
              🙂
            </button>
            <label className="sr-only" htmlFor={`${id}-input`}>
              Message
            </label>
            <input
              id={`${id}-input`}
              ref={input}
              className="chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the table"
              autoComplete="off"
              enterKeyHint="send"
              aria-invalid={tooLong}
              aria-describedby={len > CHAT_MAX_CHARS - 50 ? `${id}-count` : undefined}
            />
            <button type="submit" className="btn small primary" disabled={!len || tooLong}>
              Send
            </button>
          </form>
          {len > CHAT_MAX_CHARS - 50 && (
            <p id={`${id}-count`} className={`chat-count ${tooLong ? 'bad' : ''}`}>
              {tooLong ? `${len - CHAT_MAX_CHARS} characters over the limit` : `${CHAT_MAX_CHARS - len} characters left`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
