import type { LessonExtra } from '../types';

export const DISCIPLINE_X: Record<string, LessonExtra> = {
  'hand-review': {
    terms: [
      ['Decision point', 'A moment in the hand where you chose an action.'],
      ['Key decision', 'The decision with the most money or the biggest EV difference at stake.'],
      ['Line', 'The sequence of actions you took through a hand.'],
      ['Assumption', 'A belief about ranges or tendencies that a conclusion depends on.'],
    ],
    deeper: [
      {
        heading: 'A review routine that works',
        body: [
          'For each decision: write down what you knew (positions, stacks, actions, board), what ranges were plausible, what options you had, and what each option was likely to achieve. Only then decide which was best.',
          'Do not start from the result. If you start with “I lost, what went wrong?”, you will find mistakes that were not there. Start from the information you had.',
        ],
      },
      {
        heading: 'Choosing which hands to review',
        body: [
          'Review hands where you were unsure, hands with big pots, and hands that repeat a pattern you want to improve (for example river bluff-catching). Skip routine preflop folds.',
          'The app’s Review page lets you filter by mistakes and by assisted or unassisted play. Reviewing a handful of your worst-graded decisions each week is a good habit.',
        ],
      },
    ],
    apply: [
      'Pick hands where you were unsure or the pot was big.',
      'For each decision, write what you knew before deciding.',
      'List ranges and options, then compare EVs.',
      'Note the assumptions your conclusion depends on.',
      'Turn what you learn into a short rule to practise.',
    ],
    examples: [
      {
        title: 'Reviewing a river fold',
        steps: [
          'You folded top pair to a big river bet and later wondered whether it was a mistake.',
          'What you knew: the opponent checked the flop and turn, then bet pot on a blank river. They are a tight player.',
          'Ranges: their line suggests mostly value. Price: you needed 33%.',
          'Conclusion: against this player, folding is reasonable. Against an aggressive player, calling might be better. The review records that assumption.',
        ],
      },
    ],
    quiz: [
      { q: 'Where should a hand review start?', options: ['The information you had at each decision', 'The result of the hand', 'What the opponent showed'], answer: 0, explain: 'Starting with results biases the review.' },
      { q: 'Which hands are most useful to review?', options: ['Hands where you were unsure or the pot was large', 'Routine preflop folds'], answer: 0, explain: 'They contain the most learning.' },
    ],
  },

  'recurring-leaks': {
    terms: [
      ['Leak', 'A repeated mistake that costs money over time.'],
      ['Spot type', 'A category of decision, such as facing a river bet or c-betting multiway.'],
      ['Deliberate practice', 'Focused practice on a specific weakness with feedback.'],
      ['Baseline score', 'Your typical score in a spot before working on it.'],
    ],
    deeper: [
      {
        heading: 'Finding leaks',
        body: [
          'Leaks show up as patterns across many hands, not in one hand. Look at your scores by concept and spot type in the Progress page. A concept where you regularly score “mistake” or “blunder” is a candidate.',
          'Common leaks at lower stakes: calling too much preflop out of position, c-betting too often on bad boards, folding too much to small bets, calling down too much against river aggression, and not value-betting thin enough.',
        ],
      },
      {
        heading: 'Fixing leaks',
        body: [
          'Pick one leak at a time. Read the lesson, then practise that spot until your unassisted score improves. Check again after a week to see whether the improvement held.',
          'Fixing one leak is usually worth more than learning a new advanced concept.',
        ],
      },
    ],
    apply: [
      'Look at your scores by concept in Progress.',
      'Choose the weakest concept with enough attempts to matter.',
      'Read the matching lesson, then practise the spot.',
      'Measure your unassisted score again after a week.',
    ],
    examples: [
      {
        title: 'A one-week leak plan',
        steps: [
          'Progress shows repeated low scores in “Facing a c-bet”.',
          'Day 1: read “Pot odds”, “Blind defence” and “Minimum defence frequency”.',
          'Days 2–5: ten guided c-bet-defence scenarios a day, then five in assessment mode.',
          'Day 7: compare your unassisted score with the start of the week.',
        ],
      },
    ],
    quiz: [
      { q: 'How should you work on leaks?', options: ['One at a time, with focused practice', 'All at once', 'By playing more hands randomly'], answer: 0, explain: 'Focused practice gives clearer progress.' },
      { q: 'Where can you see your weakest concepts in this app?', options: ['Progress page', 'Ranges page', 'Home page'], answer: 0, explain: 'Progress shows scores by concept.' },
    ],
  },

  'results-oriented': {
    terms: [
      ['Results-oriented thinking', 'Judging a decision by its outcome.'],
      ['Process-oriented thinking', 'Judging a decision by the information and reasoning behind it.'],
      ['Bad beat', 'Losing a hand where you were a big favourite.'],
      ['Hindsight bias', 'Believing after the fact that the outcome was predictable.'],
    ],
    deeper: [
      {
        heading: 'Why outcomes mislead',
        body: [
          'A decision can be good and still lose, or bad and still win. If you judge by outcomes, you will repeat bad decisions that happened to win and avoid good ones that happened to lose.',
          'Hindsight makes this worse. After seeing the opponent’s cards, a fold “obviously” would have been right. But you did not have that information when you decided.',
        ],
      },
      {
        heading: 'Separating decision and outcome',
        body: [
          'Ask two questions: “Given what I knew, was this the best option?” and “How lucky or unlucky was the result?”. Keep them separate.',
          'The app does this automatically: scores are based on the decision, not on who won the pot.',
        ],
      },
    ],
    apply: [
      'After a big hand, ask whether the decision was good given what you knew.',
      'Do not count the opponent’s revealed cards as information you had.',
      'Note lucky wins as well as unlucky losses.',
      'Track decision scores, not session results.',
    ],
    examples: [
      {
        title: 'A bad call that won',
        steps: [
          'You call a river pot-size bet with a weak hand, needing 33% equity, against a player who almost never bluffs. They turn out to be bluffing and you win.',
          'The decision was poor: against this player your equity was likely well below 33%.',
          'Results-oriented thinking would encourage you to call again. Process-oriented thinking flags it as a lucky mistake.',
        ],
      },
    ],
    quiz: [
      { q: 'You fold correctly and later learn you had the best hand. The fold was…', options: ['Still correct', 'A mistake'], answer: 0, explain: 'You did not know their hand when deciding.' },
      { q: 'Hindsight bias is…', options: ['Thinking the outcome was predictable after seeing it', 'Remembering hands well'], answer: 0, explain: 'It distorts reviews.' },
    ],
  },

  tilt: {
    terms: [
      ['Tilt', 'Playing worse because of emotion.'],
      ['Steaming', 'Playing too aggressively after losses.'],
      ['Winner’s tilt', 'Playing carelessly after wins.'],
      ['Stop-loss', 'A rule to stop playing after losing a set amount.'],
    ],
    deeper: [
      {
        heading: 'Forms of tilt',
        body: [
          'Tilt is not only anger. It includes playing too many hands to “win it back”, playing too few out of fear, calling too much because you feel the opponent is bluffing you, and getting careless when you are winning.',
          'Each form makes your decisions worse in a predictable way. Learning your own patterns is the first step to managing them.',
        ],
      },
      {
        heading: 'Managing tilt',
        body: [
          'Notice the signs: faster decisions, replaying hands in your head, frustration with specific players. When you notice them, take a short break.',
          'Rules decided in advance help, because you make them while calm: stop after losing a set number of buy-ins, take a break every hour, and stop when you notice you are rushing decisions.',
        ],
      },
    ],
    apply: [
      'Learn your warning signs (rushing, replaying hands, anger).',
      'Take a short break when you notice them.',
      'Set a stop-loss and a session length in advance.',
      'Compare your decision scores after big losses with your normal scores.',
    ],
    examples: [
      {
        title: 'Spotting tilt in your own data',
        steps: [
          'Your average score is 82 in normal sessions.',
          'In the ten scenarios after a big loss, it drops to 68, with more “mistake” grades in calling spots.',
          'That pattern suggests tilt affects your calling decisions. A rule like “take five minutes after any big loss” targets it.',
        ],
      },
    ],
    quiz: [
      { q: 'Which is a form of tilt?', options: ['Playing too many hands to win back losses', 'Taking a break'], answer: 0, explain: 'Chasing losses is a classic form.' },
      { q: 'Why decide stop-loss rules in advance?', options: ['You make them while calm', 'They are required by sites'], answer: 0, explain: 'Rules made in calm moments are more reliable.' },
    ],
  },

  bankroll: {
    terms: [
      ['Bankroll', 'Money set aside only for poker.'],
      ['Buy-in', 'The standard amount to sit at a table (often 100bb) or enter a tournament.'],
      ['Risk of ruin', 'The chance of losing your whole bankroll.'],
      ['Shot-taking', 'Trying a higher stake with a small part of your bankroll.'],
    ],
    deeper: [
      {
        heading: 'Why bankrolls are measured in buy-ins',
        body: [
          'Swings scale with stakes. A normal downswing of 20 buy-ins is the same in buy-ins at any level, but very different in money. Measuring your bankroll in buy-ins tells you how well it can absorb normal swings.',
          'Common guidelines: around 30–50 buy-ins for cash games, and 100 or more for tournaments, which have much higher variance. More conservative players use more.',
        ],
      },
      {
        heading: 'Moving up and down',
        body: [
          'A clear plan prevents emotional decisions. Decide in advance when you move up (for example, at 40 buy-ins for the next stake) and when you move down (for example, if you fall to 25 buy-ins).',
          'Moving down after a downswing is not failure. It protects the bankroll while variance evens out.',
        ],
      },
    ],
    apply: [
      'Keep poker money separate from living money.',
      'Count your bankroll in buy-ins for your current stake.',
      'Write down move-up and move-down points.',
      'Use more buy-ins for tournaments than for cash games.',
    ],
    examples: [
      {
        title: 'A simple bankroll plan',
        steps: [
          'Bankroll: $1,500. Stake: $0.25/$0.50 cash (buy-in $50) = 30 buy-ins.',
          'Move up to $0.50/$1 (buy-in $100) at $4,000 (40 buy-ins at the higher level).',
          'Move down to $0.10/$0.25 (buy-in $25) if the bankroll falls to $1,000 (20 buy-ins at the current level).',
        ],
      },
    ],
    quiz: [
      { q: 'With $2,000 and $100 buy-ins, how many buy-ins do you have?', options: ['2', '20', '200'], answer: 1, explain: '2,000 / 100 = 20.' },
      { q: 'Why do tournaments need more buy-ins?', options: ['Higher variance', 'Lower rake', 'Fewer players'], answer: 0, explain: 'Most of the prize goes to a few finishers.' },
    ],
  },

  'study-routine': {
    terms: [
      ['Deliberate practice', 'Focused practice on specific skills with feedback.'],
      ['Spaced repetition', 'Revisiting material at increasing intervals to remember it.'],
      ['Assisted / unassisted', 'Practice with or without hints and calculators.'],
      ['Study-to-play ratio', 'How much time you spend studying compared with playing.'],
    ],
    deeper: [
      {
        heading: 'A balanced week',
        body: [
          'Mix three kinds of work: theory (reading lessons), practice (scenarios on specific concepts) and review (looking back at your decisions). A common split is about a third each, with more practice once the theory is familiar.',
          'Short, focused sessions beat long unfocused ones. Thirty to forty-five minutes on one concept is more useful than two hours of random hands.',
        ],
      },
      {
        heading: 'Measuring progress',
        body: [
          'Use unassisted scores as your main measure. Help (hints, equity, pot odds) is useful while learning, but it inflates scores. The Progress page shows both, so you can see whether you can do it alone.',
          'Revisit old topics every few weeks. A quick set of scenarios on a concept you studied a month ago tells you whether the learning stuck.',
        ],
      },
    ],
    apply: [
      'Choose one concept per session.',
      'Read the lesson, practise with help, then practise without help.',
      'Review your lowest-scoring decisions at the end of the week.',
      'Revisit old concepts every few weeks.',
    ],
    examples: [
      {
        title: 'A four-week plan',
        steps: [
          'Week 1: preflop opening and blind defence (lessons + preflop scenarios).',
          'Week 2: c-betting and facing c-bets.',
          'Week 3: turn and river decisions — barrels, thin value, bluff-catching.',
          'Week 4: review all three weeks with unassisted scenarios and compare scores with week 1.',
        ],
      },
    ],
    quiz: [
      { q: 'Which score best measures real progress?', options: ['Unassisted', 'Assisted'], answer: 0, explain: 'It reflects what you can do alone.' },
      { q: 'What is spaced repetition?', options: ['Revisiting topics at increasing intervals', 'Studying one topic forever'], answer: 0, explain: 'It improves long-term memory.' },
    ],
  },
};
