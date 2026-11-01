// Table chat on live tables: what the seated players say as message bubbles, a message box with
// an emoji picker, and muting people (kept in this browser only). Messages are shown as text, never as HTML.
import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAT_MAX_CHARS, chatLength } from '../../multiplayer/chat';
import type { ChatLine } from '../useLiveTable';
import { EmojiPicker } from './EmojiPicker';

/** Messages from the same person this close together share one name and time. */
const GROUP_MS = 3 * 60_000;
const NAME_HUES = [150, 25, 210, 280, 340, 45, 190, 0];
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

/** A steady colour for each player's name, so you can tell people apart at a glance. */
function nameHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return NAME_HUES[Math.abs(h) % NAME_HUES.length];
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200D\uFE0F\u20E3\s]|\p{Emoji_Modifier})+$/u;
/** One to three emoji and nothing else: drawn large, without a bubble. */
const bigEmoji = (text: string) => EMOJI_ONLY.test(text) && chatLength(text.replace(/\s/g, '')) <= 3;

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
            {shown.map((l, i) => {
              if (l.kind === 'system')
                return (
                  <li key={`s${l.id}`} className="chat-sys">
                    <span>{l.text}</span>
                  </li>
                );
              const mine = l.from === me || !!l.state;
              const prev = shown[i - 1];
              const next = shown[i + 1];
              const sameAs = (o?: ChatLine) => !!o && o.kind === 'player' && (o.from === me || !!o.state) === mine && (mine || o.from === l.from);
              const first = !sameAs(prev) || l.at - prev!.at > GROUP_MS;
              const last = !sameAs(next) || next!.at - l.at > GROUP_MS;
              const big = bigEmoji(l.text);
              return (
                <li
                  key={l.cid ?? `m${l.id}`}
                  className={`chat-line ${mine ? 'mine' : ''} ${first ? 'first' : ''} ${last ? 'last' : ''} ${l.state ?? ''}`}
                  style={mine ? undefined : ({ '--name-hue': nameHue(l.from ?? '') } as React.CSSProperties)}
                >
                  {first && (
                    <span className="chat-meta">
                      {!mine && <span className="chat-name">{l.name}</span>}
                      <time dateTime={new Date(l.at).toISOString()}>{time(l.at)}</time>
                    </span>
                  )}
                  <span className={big ? 'chat-text big' : 'chat-text'}>
                    {mine && <span className="sr-only">You: </span>}
                    {l.text}
                  </span>
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
              );
            })}
          </ol>
          {below && (
            <button type="button" className="chat-jump" onClick={toBottom}>
              New messages ↓
            </button>
          )}
          {picker && <EmojiPicker onPick={insert} />}
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
            <button type="submit" className="chat-send" aria-label="Send" disabled={!len || tooLong}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
