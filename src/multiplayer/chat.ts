// Table chat: plain-text messages between the people seated at a live table. The table server
// (party/server.ts) decides who may read and send; this keeps the messages, checks them and limits
// how fast each player can post. Slurs are starred out (moderation.ts); swearing is allowed.
// Messages live in memory with the table: the last CHAT_HISTORY, none older than
// CHAT_RETENTION_MS, and they are gone when the table restarts. Bots never chat.

import { censorChat } from './moderation';

/** Longest message, in characters as people count them (an emoji is one, however it is encoded). */
export const CHAT_MAX_CHARS = 300;
/** Hard limit on the encoded length, so a message of long emoji sequences stays small. */
export const CHAT_MAX_UNITS = 1200;
export const CHAT_HISTORY = 50;
export const CHAT_RETENTION_MS = 60 * 60_000;
/** Each player may send this many messages in any window of this length. */
export const CHAT_RATE = { count: 5, perMs: 10_000 };

export interface ChatMessage {
  /** order on this table */
  id: number;
  kind: 'player' | 'system';
  /** sender's player id and table name (player messages only) */
  from?: string;
  name?: string;
  text: string;
  at: number;
  /** the sender's own id for the message, so their browser can match it to what it sent */
  cid?: string;
}

export type ChatClientMessage = { type: 'chat'; cid: string; text: string };

export type ChatServerMessage =
  /** everything kept so far: sent when someone gains access to the chat (sits down, reconnects) */
  | { type: 'chat-history'; messages: ChatMessage[] }
  | { type: 'chat'; message: ChatMessage }
  /** a message of yours that was not posted, and why */
  | { type: 'chat-error'; cid: string; message: string }
  /** you no longer have access (you stood up) */
  | { type: 'chat-closed' };

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

/** Characters as people count them: a flag, a skin-toned or family emoji is one. */
export function chatLength(s: string): number {
  if (!segmenter) return Array.from(s).length;
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

// control characters and invisible direction overrides (which can make text read backwards);
// joiners and variation selectors stay, since emoji are built from them
const STRIP = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩؜]/g;

/** A message as it will be shown, or why it cannot be sent. Text only: it is never treated as HTML. */
export function cleanChatText(raw: unknown): { text: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Type a message' };
  const text = raw.replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { error: 'Type a message' };
  if (text.length > CHAT_MAX_UNITS || chatLength(text) > CHAT_MAX_CHARS) return { error: `Messages can be up to ${CHAT_MAX_CHARS} characters` };
  return { text };
}

const CID = /^[A-Za-z0-9-]{8,64}$/;

export class ChatRoom {
  private messages: ChatMessage[] = [];
  private nextId = 1;
  /** when each player's recent messages were posted, for the rate limit */
  private posted = new Map<string, number[]>();

  constructor(private clock: () => number = Date.now) {}

  history(): ChatMessage[] {
    const oldest = this.clock() - CHAT_RETENTION_MS;
    this.messages = this.messages.filter((m) => m.at >= oldest);
    return [...this.messages];
  }

  /**
   * Post a player's message. The sender's id and name come from the server, never the browser.
   * Sending the same cid again (a retry) returns the message already posted instead of a second copy.
   */
  post(from: string, name: string, rawText: unknown, cid: unknown): { message: ChatMessage; repeat: boolean } | { error: string } {
    if (typeof cid !== 'string' || !CID.test(cid)) return { error: 'Bad message' };
    const earlier = this.history().find((m) => m.from === from && m.cid === cid);
    if (earlier) return { message: earlier, repeat: true };
    const now = this.clock();
    const recent = (this.posted.get(from) ?? []).filter((t) => t > now - CHAT_RATE.perMs);
    if (recent.length >= CHAT_RATE.count) return { error: 'You are sending messages too quickly. Wait a few seconds.' };
    const clean = cleanChatText(rawText);
    if ('error' in clean) return clean;
    this.posted.set(from, [...recent, now]);
    return { message: this.add({ kind: 'player', from, name, text: censorChat(clean.text), cid }), repeat: false };
  }

  /** A notice from the table, such as someone sitting down; shown apart from what people say. */
  notice(text: string): ChatMessage {
    return this.add({ kind: 'system', text });
  }

  private add(m: Omit<ChatMessage, 'id' | 'at'>): ChatMessage {
    const message: ChatMessage = { ...m, id: this.nextId++, at: this.clock() };
    this.messages = [...this.history(), message].slice(-CHAT_HISTORY);
    return message;
  }
}
