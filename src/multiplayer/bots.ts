// Bots that fill open seats at public live tables while someone is playing. They play the practice
// opponents' styles (src/opponents) and decide from a copy of the hand with everything a player in
// their seat could not see taken out: the deck, the result and everyone else's cards.

import { legalActions, type HandState, type PlayerAction } from '../engine/rules';
import { policyDistribution, publicView, sampleAction, type PublicView } from '../opponents/policy';
import { PROFILES, type ProfileId } from '../opponents/profiles';

/** Styles bots play, one bot per style at a table. */
export const BOT_STYLES: ProfileId[] = ['tag', 'nit', 'station', 'lag', 'overfolder'];
/** Bot ids start with this; player ids are hex hashes, so the two can never collide. */
export const BOT_PREFIX = 'bot-';
export const isBotId = (id: string) => id.startsWith(BOT_PREFIX);
/** Short style name shown with the Bot label, e.g. "TAG". */
export const botStyleName = (style: ProfileId) => PROFILES[style].short;
/** Bots buy in for 100 big blinds; their chips are made for the table and never reach anyone's bank. */
export const BOT_BUY_IN_BB = 100;

/** How long a bot thinks before acting, in ms; the first decision of a hand also waits for the deal. */
export const BOT_THINK_MS = { min: 1000, max: 3000, afterDeal: 1800 };

export type BotPolicy = (view: PublicView, style: ProfileId, u: number) => PlayerAction;

/** What the bot to act may see. A deep copy, so nothing it does can reach the real hand. */
export function botView(h: HandState): PublicView {
  return structuredClone(publicView(h, h.toAct));
}

/** The practice opponents' policy: a weighted choice among legal actions, picked with u in [0, 1). */
export const practicePolicy: BotPolicy = (view, style, u) => {
  try {
    return sampleAction(policyDistribution(view, PROFILES[style]), u).action;
  } catch {
    // the policy has no answer for this spot: take the free option
    return legalActions(view.state)?.canCheck ? { type: 'check' } : { type: 'fold' };
  }
};
