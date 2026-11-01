// The home page's first-visit question ("Where would you like to start?"). Once answered or skipped
// it is remembered in this browser and not asked again; it is never asked of anyone who has already
// played, read or solved something here, on this browser or (signed in) on another.

export type StartChoice = 'new' | 'rules' | 'game' | 'skip';
const KEY = 'felt-school:start-choice';
const CHOICES: StartChoice[] = ['new', 'rules', 'game', 'skip'];
/** if this browser keeps nothing (private mode), at least do not ask twice on one visit */
let memory: StartChoice | null = null;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const local = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export function loadStartChoice(store = local()): StartChoice | null {
  try {
    const v = store?.getItem(KEY) as StartChoice | null | undefined;
    if (v && CHOICES.includes(v)) return v;
  } catch {
    /* fall back to this visit's answer */
  }
  return memory;
}

export function saveStartChoice(c: StartChoice, store = local()) {
  memory = c;
  try {
    store?.setItem(KEY, c);
  } catch {
    /* remembered for this visit only */
  }
}

/** Ask only someone new: no answer yet, and nothing played, read or solved. */
export const shouldAskStart = (choice: StartChoice | null, activity: { hands: number; lessons: number; puzzles: number }) =>
  choice === null && activity.hands + activity.lessons + activity.puzzles === 0;
