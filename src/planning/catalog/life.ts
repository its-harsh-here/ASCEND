import { boss, m, q, side, type GoalTemplate, type MilestoneBlueprint } from './types';

export const exam: GoalTemplate = {
  id: 'exam',
  name: 'Exam Preparation',
  domain: 'exam',
  summary: 'Syllabus mapping, unit-by-unit study cycles, practice papers and spaced revision.',
  icon: 'graduation-cap',
  keywords: ['exam', 'exams', 'midterm', 'finals', 'final exam', 'entrance exam', 'gate', 'gre', 'gmat', 'semester', 'certification exam', 'test prep', 'study for'],
  skillIds: ['exam-prep'],
  quantityLabel: 'Subjects / units',
  quantityPattern: /(\d+)\s*(?:subjects?|units?|chapters?|modules?|papers?)/i,
  defaultQuantity: 4,
  milestones: (params): MilestoneBlueprint[] => {
    const n = Math.max(1, Math.min(12, params.quantity ?? 4));
    const units: MilestoneBlueprint[] = [];
    for (let i = 1; i <= n; i++) {
      units.push(
        m(`unit${i}`, `Unit ${i}`, [
          q(`u${i}-learn`, `Unit ${i}: study core concepts`, 2.5, 'medium', 'Condensed notes and a concept map for the unit', 'Read, summarize, and connect ideas.'),
          q(`u${i}-practice`, `Unit ${i}: practice problems`, 2, 'hard', '20 practice questions attempted; mistakes logged', 'Active recall beats rereading.'),
          q(`u${i}-recall`, `Unit ${i}: flashcards and self-test`, 1, 'easy', 'Flashcard deck created and one self-test scored', 'Prepare for spaced repetition.'),
        ]),
      );
    }
    return [
      m('plan', 'Plan', [
        q('syllabus', 'Map the syllabus and past papers', 1.5, 'medium', 'Syllabus checklist with weightage and a list of past papers', 'Know exactly what will be tested.'),
        q('resources', 'Gather study resources', 1, 'easy', 'One primary resource per unit selected', 'Avoid resource hopping.'),
      ]),
      ...units,
      m('final', 'Final preparation', [
        q('mock1', 'Full-length mock exam #1', 3, 'hard', 'Timed mock with score and error analysis', 'Simulate exam conditions.'),
        q('weak', 'Targeted revision of weak areas', 3, 'hard', 'Error log reviewed; weak topics re-practised', 'Close the gaps.'),
        side('mock2', 'Full-length mock exam #2', 3, 'hard', 'Second mock with improved score', 'Measure improvement.'),
        boss('boss', 'Boss: Final revision sprint', 2, 'boss', 'Formula/summary sheet and a calm exam-day checklist', 'Consolidate and rest.'),
      ]),
    ];
  },
  recurring: [
    { title: 'Flashcard review', description: 'Review due flashcards across all units.', minutes: 20, frequency: 'daily', difficulty: 'trivial' },
  ],
};

export const reading: GoalTemplate = {
  id: 'reading',
  name: 'Deliberate Reading',
  domain: 'reading',
  summary: 'Read books deliberately with notes, summaries and applied takeaways.',
  icon: 'book-open',
  keywords: ['read', 'reading', 'books', 'book', 'novels'],
  skillIds: ['reading'],
  quantityLabel: 'Books',
  quantityPattern: /(\d+)\s*(?:books?|novels?)/i,
  defaultQuantity: 2,
  milestones: (params): MilestoneBlueprint[] => {
    const n = Math.max(1, Math.min(24, params.quantity ?? 2));
    const books: MilestoneBlueprint[] = [];
    for (let i = 1; i <= n; i++) {
      books.push(
        m(`book${i}`, `Book ${i}`, [
          q(`b${i}-p1`, `Book ${i}: read part 1`, 2.5, 'easy', 'First third read with highlights', 'Read actively — question the text.'),
          q(`b${i}-p2`, `Book ${i}: read part 2`, 2.5, 'easy', 'Second third read with notes', 'Capture ideas in your own words.'),
          q(`b${i}-p3`, `Book ${i}: read part 3`, 2.5, 'easy', 'Book finished', 'Finish strong.'),
          q(`b${i}-sum`, `Book ${i}: write a summary`, 1, 'medium', '300-word summary with 3 actionable takeaways', 'If you cannot summarize it, you did not understand it.'),
        ]),
      );
    }
    return [
      m('select', 'Select', [q('choose', 'Choose books and a note-taking system', 1, 'easy', 'Reading list and notes template', 'Pick deliberately.')]),
      ...books,
      m('reflect', 'Reflect', [boss('boss', 'Boss: Synthesis essay', 2, 'boss', 'Essay connecting ideas across the books', 'Turn reading into thinking.')]),
    ];
  },
};

export const fitness: GoalTemplate = {
  id: 'fitness',
  name: 'Physical Fitness',
  domain: 'fitness',
  summary: 'A progressive training block with recurring workouts, mobility and check-ins.',
  icon: 'dumbbell',
  keywords: ['fitness', 'physical fitness', 'workout', 'workouts', 'exercise', 'gym', 'get fit', 'lose weight', 'running', 'run a 5k', 'strength', 'health'],
  skillIds: ['fitness'],
  milestones: [
    m('baseline', 'Baseline', [
      q('assess', 'Baseline fitness assessment', 1, 'easy', 'Recorded push-ups, plank, 2 km time, resting heart rate', 'Measure where you start.'),
      q('plan', 'Design your training plan', 1, 'medium', 'Weekly split (strength, cardio, mobility) and progression rule', 'Progressive overload, recovery days.'),
    ]),
    m('build', 'Build', [
      q('form', 'Learn proper form for core lifts', 1.5, 'medium', 'Form checklist; videos of squat, hinge, push and pull reviewed', 'Safety and efficiency first.'),
      q('check1', 'Mid-block check-in', 0.5, 'easy', 'Re-test baseline metrics; adjust plan', 'Feedback loop.'),
      side('nutrition', 'Nutrition and sleep audit', 1, 'easy', 'Three-day food and sleep log with one improvement chosen', 'Recovery fuels progress.'),
      boss('boss', 'Boss: Final fitness test', 1, 'boss', 'Re-test all metrics and compare to baseline', 'Celebrate measured progress.'),
    ]),
  ],
  recurring: [
    { title: 'Workout session', description: 'Follow today’s session from your training plan.', minutes: 45, frequency: 'weekdays', weekdays: [1, 3, 5], difficulty: 'medium' },
    { title: 'Mobility & stretching', description: '10–15 minutes of mobility work.', minutes: 15, frequency: 'weekdays', weekdays: [2, 4, 6], difficulty: 'trivial' },
  ],
};
