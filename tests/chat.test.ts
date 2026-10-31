import { describe, it, expect } from 'vitest';
import { CHAT_HISTORY, CHAT_MAX_CHARS, CHAT_RATE, CHAT_RETENTION_MS, ChatRoom, chatLength, cleanChatText } from '../src/multiplayer/chat';
import { isTyping } from '../src/ui/components/ActionBar';

const room = () => {
  let now = 1_000_000;
  return { chat: new ChatRoom(() => now), advance: (ms: number) => (now += ms) };
};
let n = 0;
const cid = () => `cid-${String(++n).padStart(6, '0')}`;

describe('chat text', () => {
  it('keeps text and emoji, and counts an emoji as one character however it is built', () => {
    expect(cleanChatText('nice hand 👍')).toEqual({ text: 'nice hand 👍' });
    expect(chatLength('👨‍👩‍👧‍👦')).toBe(1); // family: seven code points
    expect(chatLength('🇬🇧')).toBe(1); // flag
    expect(chatLength('👍🏽')).toBe(1); // skin tone
    expect(cleanChatText('👨‍👩‍👧‍👦'.repeat(CHAT_MAX_CHARS / 4))).toEqual({ text: '👨‍👩‍👧‍👦'.repeat(CHAT_MAX_CHARS / 4) });
  });

  it('has a length limit and refuses empty messages', () => {
    expect(cleanChatText('a'.repeat(CHAT_MAX_CHARS))).toHaveProperty('text');
    expect(cleanChatText('a'.repeat(CHAT_MAX_CHARS + 1))).toHaveProperty('error');
    expect(cleanChatText('😀'.repeat(CHAT_MAX_CHARS + 1))).toHaveProperty('error');
    expect(cleanChatText('   ')).toEqual({ error: 'Type a message' });
    expect(cleanChatText(42)).toEqual({ error: 'Type a message' });
  });

  it('is plain text: markup stays as typed, and invisible control characters are removed', () => {
    expect(cleanChatText('<img src=x onerror=alert(1)>')).toEqual({ text: '<img src=x onerror=alert(1)>' });
    expect(cleanChatText('hi‮evil\u0000\nthere')).toEqual({ text: 'hi evil there' });
  });
});

describe('chat room', () => {
  it('posts under the name the server gives, in order, and keeps the latest messages only', () => {
    const { chat } = room();
    const r = chat.post('p1', 'Ann', 'hello 🙂', cid());
    expect(r).toMatchObject({ repeat: false, message: { id: 1, kind: 'player', from: 'p1', name: 'Ann', text: 'hello 🙂' } });
    for (let k = 0; k < CHAT_HISTORY + 10; k++) chat.notice(`notice ${k}`);
    const h = chat.history();
    expect(h).toHaveLength(CHAT_HISTORY);
    expect(h[h.length - 1].text).toBe(`notice ${CHAT_HISTORY + 9}`);
    expect(h.every((m, i) => i === 0 || m.id > h[i - 1].id)).toBe(true);
  });

  it('forgets messages older than the retention limit', () => {
    const { chat, advance } = room();
    chat.post('p1', 'Ann', 'old', cid());
    advance(CHAT_RETENTION_MS + 1);
    chat.post('p1', 'Ann', 'new', cid());
    expect(chat.history().map((m) => m.text)).toEqual(['new']);
  });

  it('a retry with the same id posts nothing new and returns the first copy', () => {
    const { chat } = room();
    const id = cid();
    const first = chat.post('p1', 'Ann', 'gg', id);
    const again = chat.post('p1', 'Ann', 'gg', id);
    expect(again).toEqual({ message: (first as { message: unknown }).message, repeat: true });
    expect(chat.history()).toHaveLength(1);
    // another player's message with the same id is their own message
    expect(chat.post('p2', 'Bob', 'gg', id)).toMatchObject({ repeat: false });
  });

  it('limits each player to five messages in ten seconds', () => {
    const { chat, advance } = room();
    for (let k = 0; k < CHAT_RATE.count; k++) expect(chat.post('p1', 'Ann', `m${k}`, cid())).toHaveProperty('message');
    expect(chat.post('p1', 'Ann', 'too many', cid())).toEqual({ error: expect.stringMatching(/too quickly/) });
    expect(chat.post('p2', 'Bob', 'not me', cid())).toHaveProperty('message'); // others are not affected
    advance(CHAT_RATE.perMs);
    expect(chat.post('p1', 'Ann', 'later', cid())).toHaveProperty('message');
  });

  it('refuses malformed message ids and bad text without using up the rate limit', () => {
    const { chat } = room();
    expect(chat.post('p1', 'Ann', 'hi', 'x')).toEqual({ error: 'Bad message' });
    expect(chat.post('p1', 'Ann', '', cid())).toEqual({ error: 'Type a message' });
    for (let k = 0; k < CHAT_RATE.count; k++) expect(chat.post('p1', 'Ann', `m${k}`, cid())).toHaveProperty('message');
  });
});

describe('typing in chat never triggers a poker action', () => {
  // stand-ins for DOM elements: the action shortcuts only look at these properties
  const el = (tagName: string, inChat = false, isContentEditable = false) => ({ tagName, isContentEditable, closest: (sel: string) => (inChat && sel === '[data-no-shortcuts]' ? {} : null) }) as unknown as EventTarget;
  it('ignores keys in text boxes and anywhere inside the chat panel', () => {
    expect(isTyping(el('INPUT'))).toBe(true);
    expect(isTyping(el('TEXTAREA'))).toBe(true);
    expect(isTyping(el('BUTTON', true))).toBe(true); // e.g. the emoji button has focus
    expect(isTyping(el('DIV', false, true))).toBe(true);
    expect(isTyping(el('BODY'))).toBe(false);
    expect(isTyping(el('BUTTON'))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
