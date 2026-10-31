import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAME_TERMS, censorChat, hasSlur, nameLetters, nameProblem } from '../src/multiplayer/moderation';
import { cleanChatText } from '../src/multiplayer/chat';

describe('names and chat: slurs are blocked, swearing is not', () => {
  it('swearing is allowed in names and chat, unchanged', () => {
    for (const t of ['what the fuck', 'shit river', 'damn', 'bitch please', 'f.u.c.k this', 'crap', 'You lucky bastard'])
      expect([hasSlur(t), censorChat(t)], t).toEqual([false, t]);
  });

  it('ordinary words that contain a slur’s letters are left alone', () => {
    for (const t of ['Cassandra', 'assassin', 'Scunthorpe', 'raccoon', 'spice', 'spicy', 'Pakistan', 'Dickens', 'Hancock', 'cocky call', 'Nigeria', 'Player 4821', 'Botond', 'GG, I was all-in! 👍'])
      expect([hasSlur(t), censorChat(t)], t).toEqual([false, t]);
    // the database's name list is stricter (it looks inside words), so this one is fine in chat only
    expect(censorChat('he did snigger')).toBe('he did snigger');
    expect(hasSlur('Snigger')).toBe(true);
  });

  it('slurs are caught however they are written', () => {
    for (const t of ['nigger', 'N1GGER', 'n.i.g.g.e.r', 'ñigger', 'faggot', 'f4ggot', 'tranny', 'kike', 'spic', 'wetback', 'chink'])
      expect(hasSlur(t), t).toBe(true);
    expect(nameProblem('n1gg3r')).toMatch(/not allowed/);
    expect(nameProblem('Ann')).toBeNull();
  });

  it('in chat only the slur is starred out', () => {
    expect(censorChat('shut up you f4ggot, fucking hell')).toBe('shut up you f*****, fucking hell');
    expect(censorChat('n.i.g.g.e.r')).toMatch(/^n\*+$/);
    expect(cleanChatText('nice hand 👍')).toEqual({ text: 'nice hand 👍' });
  });

  it('the database refuses the same slurs in account names, read the same way', () => {
    const sql = readFileSync('supabase/migrations/20261101120000_display_names.sql', 'utf8');
    const list = sql.match(/unnest\(array\[([^\]]+)\]\)/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(list).toEqual(NAME_TERMS);
    expect(nameLetters('N.1.G-g 3r!')).toBe('niggeri');
    expect(nameLetters('Ñïgg@')).toBe('nigga');
  });
});
