// Slurs are not allowed in names or table chat; swearing is. Slurs are found with the obscenity
// library (it handles leetspeak, look-alike letters and accents, and leaves innocent words alone),
// using only the slurs from its English list plus a few it lacks. Names with a slur are refused;
// in chat, the slur is starred out.
import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, pattern } from 'obscenity';

/** The slurs kept from the library's English list (it also lists swear words, which are allowed here). */
const LIBRARY_SLURS = new Set(['abeed', 'abo', 'africoon', 'arabush', 'boonga', 'chingchong', 'chink', 'dyke', 'fag', 'kike', 'negro', 'nigger', 'retard', 'spastic', 'tranny']);

const slurs = new DataSet<{ originalWord: string }>()
  .addAll(englishDataset)
  .removePhrasesIf((p) => !LIBRARY_SLURS.has(p.metadata?.originalWord ?? ''));
// slurs the library lacks; "|" marks a word edge, so "raccoon", "spice" and "Pakistan" are fine
for (const [word, patterns] of [
  ['nigga', [pattern`nigga`, pattern`nigguh`]],
  ['spic', [pattern`|spic|`, pattern`|spics|`]],
  ['wetback', [pattern`wetback`]],
  ['beaner', [pattern`|beaner|`, pattern`|beaners|`]],
  ['gook', [pattern`|gook|`, pattern`|gooks|`]],
  ['coon', [pattern`|coon|`, pattern`|coons|`]],
  ['raghead', [pattern`raghead`]],
  ['towelhead', [pattern`towelhead`]],
  ['paki', [pattern`|paki|`, pattern`|pakis|`]],
  ['kyke', [pattern`|kyke|`]],
] as const)
  slurs.addPhrase((p) => {
    for (const pt of patterns) p.addPattern(pt);
    return p.setMetadata({ originalWord: word });
  });

const matcher = new RegExpMatcher({ ...slurs.build(), ...englishRecommendedTransformers });

/**
 * Slurs the database itself refuses anywhere in an account name (supabase/migrations/
 * 20261101120000_display_names.sql), checked against the name's letters with leetspeak turned back
 * into letters. Only ones that are never part of an ordinary name. A test keeps the two lists the same.
 */
export const NAME_TERMS = ['nigger', 'nigga', 'faggot', 'tranny', 'retard', 'chingchong', 'wetback', 'raghead', 'towelhead', 'kike', 'spastic'];

// keep in step with public.name_letters() in the migration
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i' };

/** Just the letters, lower case, accents and leetspeak undone: "N.1.g" and "ñig" both read "nig". */
export function nameLetters(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$!|]/g, (ch) => LEET[ch])
    .replace(/[^a-z]/g, '');
}

/** A word that is a slur once its dots, dashes and digits-for-letters are undone. */
function wordIsSlur(token: string): boolean {
  const letters = nameLetters(token);
  return letters.length > 2 && matcher.hasMatch(letters);
}

/** Contains a slur: as written, word by word with punctuation undone, or by the database's list. */
export function hasSlur(text: string): boolean {
  if (matcher.hasMatch(text) || text.split(/\s+/).some(wordIsSlur)) return true;
  const letters = nameLetters(text);
  return NAME_TERMS.some((t) => letters.includes(t));
}

/** Why a name cannot be shown to other players, or null if it can. */
export function nameProblem(name: string): string | null {
  return hasSlur(name) ? 'That name is not allowed. Choose a different one.' : null;
}

/** Chat with any word that is a slur starred out ("f*****"), keeping everything else (swearing included) as written. */
export function censorChat(text: string): string {
  return text.replace(/\S+/g, (token) => {
    if (!matcher.hasMatch(token) && !wordIsSlur(token)) return token;
    const tail = token.match(/[.,!?;:)\]"'’]+$/)?.[0] ?? '';
    const word = [...token.slice(0, token.length - tail.length)];
    return word[0] + '*'.repeat(Math.max(1, word.length - 1)) + tail;
  });
}
