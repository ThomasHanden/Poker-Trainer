import type { LessonDrills } from '../types';

export const DISCIPLINE_D: Record<string, LessonDrills> = {
  'hand-review': {
    takeaways: [
      'Review decisions, not results.',
      'For each decision: information, ranges, options, EV comparison.',
      'Write down the assumptions your conclusion depends on.',
      'Turn each review into a short rule to practice.',
    ],
    problems: [
      { q: 'You lost a big all-in with a hand that was 70% to win. What is the first review question?', a: '“Given what I knew, was getting all-in the best option?” If yes, the loss was variance.' },
      { q: 'Name two kinds of hands worth reviewing.', a: 'Hands where you were unsure what to do, and hands with big pots. Also hands that fit a pattern you are working on.' },
    ],
  },
  'recurring-leaks': {
    takeaways: [
      'Leaks are repeated patterns, visible only across many hands.',
      'Use the Progress page to find weak concepts.',
      'Work on one leak at a time with focused practice.',
      'Measure improvement with unassisted scores.',
    ],
    problems: [
      { q: 'Your scores are low in “Facing a c-bet” and “Thin value”. Which should you fix first?', a: 'The one you face most often and where scores are lowest. Facing c-bets comes up in many hands, so it is often the better first target.' },
      { q: 'How do you know a leak is fixed?', a: 'Your unassisted scores in that concept stay higher over many attempts, not just one good session.' },
    ],
  },
  'results-oriented': {
    takeaways: [
      'Good decisions can lose; bad decisions can win.',
      'Separate “was it the right decision?” from “was I lucky?”.',
      'Do not use the opponent’s revealed cards as information you had.',
      'Track decision scores rather than session results.',
    ],
    problems: [
      { q: 'You call a shove getting 2:1 with 40% equity and lose. Good or bad call?', a: 'Good. You needed 33%; the call earned 0.4 × 3 − 1 = +0.2 of the call amount on average.' },
      { q: 'You make a call you knew was poor and win a big pot. How should you record it?', a: 'As a lucky mistake. The result does not change the decision quality.' },
    ],
  },
  tilt: {
    takeaways: [
      'Tilt is any emotion that worsens decisions: anger, fear, overconfidence.',
      'Learn your warning signs.',
      'Take breaks and set stop rules in advance.',
      'Check your scores after big losses to see your tilt pattern.',
    ],
    problems: [
      { q: 'After a bad beat you notice you are calling faster and more often. What should you do?', a: 'Take a short break before the next hand. Faster, looser calls are a common tilt sign.' },
      { q: 'Name a sensible stop rule.', a: 'Stop after losing a set number of buy-ins in a session, or after a fixed time, decided before you start.' },
    ],
  },
  bankroll: {
    takeaways: [
      'Keep poker money separate from living money.',
      'Measure your bankroll in buy-ins for your stake.',
      'Cash games: roughly 30–50 buy-ins; tournaments: 100 or more.',
      'Decide move-up and move-down points in advance.',
    ],
    problems: [
      { q: 'You play $1/$2 cash (100bb buy-in = $200) with $5,000. How many buy-ins?', a: '25 buy-ins — on the low side for many guidelines.' },
      { q: 'Your plan says move down at 20 buy-ins. You hit it after a downswing. What do you do?', a: 'Move down as planned. It protects the bankroll while variance evens out.' },
    ],
  },
  'study-routine': {
    takeaways: [
      'Mix theory, practice and review.',
      'Short, focused sessions on one concept work best.',
      'Use unassisted scores to measure progress.',
      'Revisit old concepts every few weeks.',
    ],
    problems: [
      { q: 'Plan a 30-minute session on bluff-catching.', a: '10 minutes reading “Bluff catching” and “Minimum defense frequency”, 15 minutes of river bluff-catch scenarios with help, 5 minutes of unassisted scenarios to check yourself.' },
      { q: 'Why separate assisted and unassisted scores?', a: 'Help raises scores. Unassisted scores show what you can do at a real table.' },
    ],
  },
};
