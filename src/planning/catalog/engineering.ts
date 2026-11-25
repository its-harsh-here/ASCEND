import { boss, f, m, q, side, type GoalTemplate } from './types';

export const programming: GoalTemplate = {
  id: 'programming',
  name: 'Programming Fundamentals (Python)',
  domain: 'software',
  summary: 'Build solid programming fundamentals in Python: syntax, data, functions, files and testing.',
  icon: 'code',
  keywords: ['learn python', 'python', 'learn programming', 'learn to code', 'programming fundamentals', 'coding basics'],
  skillIds: ['programming'],
  milestones: [
    m('syntax', 'Language basics', [
      f('setup', 'Set up your environment', 1, 'easy', 'Python, editor and virtualenv working; hello world committed', 'Install Python, VS Code, and learn to run scripts.'),
      f('types', 'Variables, types and control flow', 2, 'easy', '15 small exercises solved (conditionals, loops)', 'Numbers, strings, booleans, if/for/while.'),
      q('collections', 'Lists, dicts, sets and tuples', 2, 'medium', 'Word-frequency counter for a text file', 'Choose the right built-in collection.'),
      q('functions', 'Functions and modules', 2, 'medium', 'Module of 5 reusable functions with docstrings', 'Parameters, return values, scope, imports.'),
    ]),
    m('practice', 'Writing real programs', [
      q('files', 'Files, errors and exceptions', 1.5, 'medium', 'CSV parser that handles bad rows gracefully', 'Context managers, try/except, custom errors.'),
      q('oop', 'Object-oriented programming', 2.5, 'hard', 'Small inventory system using classes and composition', 'Classes, methods, inheritance, dataclasses.'),
      q('testing', 'Testing with pytest', 1.5, 'medium', 'Test suite with ≥ 10 tests for your modules', 'Assertions, fixtures, test-driven thinking.'),
      side('libs', 'Explore the standard library', 1, 'easy', 'Script using pathlib, json, datetime and argparse', 'Batteries included.'),
      boss('boss', 'Boss: Build a CLI application', 4, 'boss', 'Published repo with a CLI tool, README and tests', 'Ship a useful command-line program end to end.'),
    ]),
  ],
};

export const git: GoalTemplate = {
  id: 'git',
  name: 'Git & Collaboration',
  domain: 'software',
  summary: 'Use Git confidently: branching, history editing, conflict resolution and pull requests.',
  icon: 'git-branch',
  keywords: ['git', 'version control', 'github workflow'],
  skillIds: ['git'],
  milestones: [
    m('core', 'Everyday Git', [
      f('basics', 'Commits, staging and history', 1, 'easy', 'Repository with 10 meaningful commits', 'init, add, commit, log, diff, restore.'),
      q('branch', 'Branching and merging', 1.5, 'medium', 'Feature-branch workflow with a resolved merge conflict', 'Branches, merges, fast-forward vs three-way.'),
      q('rebase', 'Rebase, cherry-pick and bisect', 1.5, 'hard', 'Cleaned-up history via interactive rebase; a bug found with bisect', 'Rewrite local history safely.'),
      boss('boss', 'Boss: Collaborate through pull requests', 1.5, 'boss', 'PR with review feedback addressed and merged', 'Remotes, forks, reviews and etiquette.'),
    ]),
  ],
};

export const dsa: GoalTemplate = {
  id: 'dsa',
  name: 'Data Structures & Algorithms',
  domain: 'dsa',
  summary: 'Pattern-based DSA practice from arrays to dynamic programming, with spaced revision.',
  icon: 'workflow',
  keywords: ['dsa', 'data structures', 'algorithms', 'leetcode', 'competitive programming', 'problem solving', 'neetcode', 'coding problems'],
  skillIds: ['data-structures', 'algorithms'],
  milestones: [
    m('linear', 'Linear structures', [
      f('complexity', 'Big-O and complexity analysis', 1.5, 'easy', 'Complexity of 10 snippets analyzed', 'Time/space complexity, amortized analysis.', { skills: ['algorithms'] }),
      q('arrays', 'Arrays and strings', 2.5, 'medium', '8 problems solved (easy→medium), notes on patterns', 'Prefix sums, in-place updates, string building.', { skills: ['data-structures'] }),
      q('hashing', 'Hash maps and sets', 2, 'medium', '6 problems solved (two-sum family, grouping, counting)', 'Trade memory for time.', { skills: ['data-structures'] }),
      q('two-pointers', 'Two pointers and sliding window', 2.5, 'hard', '8 problems solved with the pattern identified for each', 'Shrinking/expanding windows, sorted-array tricks.', { skills: ['algorithms'] }),
      q('stack', 'Stacks and queues', 2, 'medium', '6 problems solved incl. monotonic stack', 'Parentheses, next greater element, BFS queues.', { skills: ['data-structures'] }),
      q('linked', 'Linked lists', 2, 'medium', '6 problems solved (reverse, merge, cycle detection)', 'Pointer manipulation and fast/slow pointers.', { skills: ['data-structures'] }),
      boss('boss1', 'Boss: Timed mock — linear structures', 1.5, 'boss', '3 medium problems in 90 minutes, post-mortem written', 'Simulate interview pressure.', { skills: ['algorithms'] }),
    ]),
    m('search-trees', 'Searching and trees', [
      q('binary-search', 'Binary search and its variants', 2, 'hard', '6 problems solved incl. search on answer space', 'Invariants, lower/upper bound.', { skills: ['algorithms'] }),
      q('trees', 'Binary trees and traversals', 2.5, 'medium', '8 problems solved (DFS/BFS, depth, paths)', 'Recursion on trees.', { skills: ['data-structures'] }),
      q('bst', 'Binary search trees', 2, 'medium', '5 problems solved (validate, kth smallest, LCA)', 'Ordered structure properties.', { skills: ['data-structures'] }),
      q('heaps', 'Heaps and priority queues', 2, 'hard', '5 problems solved (top-k, merge k lists, median)', 'When to reach for a heap.', { skills: ['data-structures'] }),
      side('tries', 'Tries', 1.5, 'medium', 'Implement a trie and solve 2 problems', 'Prefix search structures.', { skills: ['data-structures'] }),
    ]),
    m('advanced', 'Graphs and dynamic programming', [
      q('graphs', 'Graph traversal: BFS and DFS', 2.5, 'hard', '6 problems solved (islands, clone graph, shortest path on grid)', 'Adjacency lists, visited sets.', { skills: ['algorithms'] }),
      q('topo', 'Topological sort and union-find', 2, 'hard', '4 problems solved (course schedule, redundant connection)', 'Dependencies and connectivity.', { skills: ['algorithms'] }),
      q('backtracking', 'Recursion and backtracking', 2.5, 'hard', '6 problems solved (subsets, permutations, N-Queens)', 'Decision trees and pruning.', { skills: ['algorithms'] }),
      q('dp1', 'Dynamic programming: 1-D', 3, 'hard', '6 problems solved (climbing stairs, house robber, coin change)', 'States, transitions, memoization vs tabulation.', { skills: ['algorithms'] }),
      q('dp2', 'Dynamic programming: 2-D', 3, 'hard', '5 problems solved (LCS, edit distance, grid paths)', 'Multi-dimensional state.', { skills: ['algorithms'], level: 'advanced' }),
      side('greedy', 'Greedy algorithms and intervals', 2, 'medium', '5 problems solved (merge intervals, jump game)', 'When local choices are globally optimal.', { skills: ['algorithms'] }),
      boss('boss2', 'Boss: Full mock interview set', 2, 'boss', '4 mixed problems in 2 hours with ≥ 3 solved; weak topics listed', 'Validate readiness across all patterns.', { skills: ['algorithms'] }),
    ]),
  ],
  recurring: [
    {
      title: 'Daily problem',
      description: 'Solve one problem from a topic you already covered (spaced repetition).',
      minutes: 30,
      frequency: 'daily',
      difficulty: 'easy',
    },
  ],
};

export const systemDesign: GoalTemplate = {
  id: 'system-design',
  name: 'System Design',
  domain: 'software',
  summary: 'Learn to design scalable systems and communicate trade-offs.',
  icon: 'network',
  keywords: ['system design', 'distributed systems', 'scalability', 'software architecture', 'high level design'],
  skillIds: ['system-design'],
  milestones: [
    m('blocks', 'Building blocks', [
      f('framework', 'A framework for design interviews', 1, 'easy', 'Personal template: requirements → estimates → API → data → scaling', 'Structure your thinking.'),
      q('scaling', 'Load balancing, caching and CDNs', 2, 'medium', 'Notes with diagrams of cache strategies and invalidation', 'Horizontal scaling patterns.'),
      q('data', 'Databases: SQL, NoSQL, replication, sharding', 2.5, 'hard', 'Comparison matrix and a sharding scheme for a sample app', 'Consistency, partitioning, indexing.'),
      q('async', 'Queues, streams and event-driven design', 2, 'hard', 'Design of a notification pipeline using a queue', 'Kafka/SQS semantics, idempotency, back-pressure.'),
    ]),
    m('cases', 'Case studies', [
      q('url', 'Design a URL shortener', 2, 'medium', 'Written design with capacity estimates and API', 'Classic warm-up problem.'),
      q('feed', 'Design a news feed / chat system', 2.5, 'hard', 'Written design covering fan-out and real-time delivery', 'Push vs pull, websockets.'),
      side('papers', 'Read a classic paper (Dynamo or GFS)', 2, 'medium', 'One-page summary of key ideas', 'Learn from real systems.'),
      boss('boss', 'Boss: Mock system design interview', 1.5, 'boss', '45-minute recorded/written mock with self-review', 'Practice under realistic conditions.'),
    ]),
  ],
};

export const frontend: GoalTemplate = {
  id: 'frontend',
  name: 'Frontend Development (React)',
  domain: 'web',
  summary: 'Modern frontend: semantic HTML, CSS layout, JavaScript, React and accessibility.',
  icon: 'layout',
  keywords: ['frontend', 'front-end', 'react', 'web development', 'web dev', 'javascript', 'typescript', 'html', 'css', 'nextjs', 'next.js'],
  skillIds: ['frontend'],
  milestones: [
    m('web', 'Web platform', [
      f('html', 'Semantic HTML and accessibility basics', 1.5, 'easy', 'Accessible landing page passing an automated a11y check', 'Landmarks, headings, forms, alt text.'),
      f('css', 'CSS layout: flexbox and grid', 2, 'medium', 'Responsive layout reproduced from a design', 'Box model, flexbox, grid, media queries.'),
      q('js', 'Modern JavaScript', 2.5, 'medium', '10 exercises on closures, promises, async/await and modules', 'The language underneath every framework.'),
      q('ts', 'TypeScript essentials', 2, 'medium', 'A small module fully typed with generics and unions', 'Types that catch bugs early.'),
    ]),
    m('react', 'React', [
      q('components', 'Components, props and state', 2, 'medium', 'Todo app with components and controlled inputs', 'Thinking in React.'),
      q('effects', 'Effects, data fetching and custom hooks', 2.5, 'hard', 'App fetching from a public API with loading/error states', 'Lifecycle, dependencies, cleanup.'),
      q('routing', 'Routing and state management', 2, 'hard', 'Multi-page app with routes and shared state', 'Router, context, stores.'),
      side('testing', 'Testing React components', 1.5, 'medium', '8 tests with React Testing Library', 'Test behavior, not implementation.'),
      side('perf', 'Performance and Lighthouse', 1.5, 'medium', 'Lighthouse report ≥ 90 performance after optimizations', 'Bundle size, memoization, lazy loading.'),
      boss('boss', 'Boss: Ship a deployed React app', 4, 'boss', 'Live URL + repository with README', 'Build, deploy, and share a polished project.'),
    ]),
  ],
};

export const backend: GoalTemplate = {
  id: 'backend',
  name: 'Backend Development & APIs',
  domain: 'web',
  summary: 'Design and build reliable HTTP APIs with databases, auth and tests.',
  icon: 'server',
  keywords: ['backend', 'back-end', 'rest api', 'apis', 'node.js', 'nodejs', 'express', 'django', 'flask', 'fastapi', 'spring boot', 'sql', 'databases', 'full stack', 'full-stack', 'fullstack'],
  skillIds: ['backend'],
  milestones: [
    m('api', 'HTTP APIs', [
      f('http', 'HTTP and REST principles', 1, 'easy', 'API design doc for a sample resource (routes, status codes)', 'Resources, verbs, idempotency.'),
      q('server', 'Build a REST API', 2.5, 'medium', 'CRUD API with validation and error handling', 'Routing, middleware, validation.'),
      q('sql', 'SQL and relational modeling', 2.5, 'hard', 'Schema with migrations and 10 queries incl. joins and aggregates', 'Normalization, indexes, transactions.'),
    ]),
    m('prod', 'Production readiness', [
      q('auth', 'Authentication and authorization', 2.5, 'hard', 'Login with hashed passwords and protected routes', 'Sessions vs tokens, OWASP basics.'),
      q('tests', 'API testing', 1.5, 'medium', 'Integration tests covering happy and failure paths', 'Test databases, fixtures.'),
      side('docs', 'OpenAPI documentation', 1, 'easy', 'Generated API docs page', 'Contracts others can rely on.'),
      boss('boss', 'Boss: Deploy a documented API', 3, 'boss', 'Deployed API with docs, tests and a README', 'Make it real.'),
    ]),
  ],
};

export const interview: GoalTemplate = {
  id: 'interview',
  name: 'Internship & Interview Readiness',
  domain: 'career',
  summary: 'Resume, portfolio, behavioral stories and mock interviews — get ready to apply.',
  icon: 'messages-square',
  keywords: ['interview', 'interviews', 'internship', 'job ready', 'job hunt', 'placement', 'placements', 'technical interviews', 'resume', 'job applications', 'internship ready'],
  skillIds: ['interviewing'],
  milestones: [
    m('materials', 'Application materials', [
      q('resume', 'Write an impact-focused resume', 2, 'medium', 'One-page resume reviewed by 2 people', 'Quantified bullet points, clean formatting.'),
      q('portfolio', 'Polish GitHub and portfolio', 2, 'medium', 'Pinned repos with READMEs, screenshots and live links', 'Make your work easy to evaluate.'),
      side('linkedin', 'Update LinkedIn profile', 1, 'easy', 'Headline, about section and featured projects updated', 'Be discoverable.'),
    ]),
    m('practice', 'Interview practice', [
      q('stories', 'Prepare behavioral stories (STAR)', 1.5, 'medium', '6 STAR stories written for common questions', 'Leadership, conflict, failure, impact.'),
      q('mock-tech', 'Technical mock interview', 1.5, 'hard', 'Mock completed with feedback notes', 'Practice explaining while coding.'),
      q('applications', 'Apply to target companies', 2, 'medium', 'Tracker with ≥ 15 tailored applications', 'Volume with quality.'),
      boss('boss', 'Boss: Full interview loop simulation', 2, 'boss', 'Behavioral + technical mock back-to-back with retrospective', 'Rehearse the real thing.'),
    ]),
  ],
};

export const project: GoalTemplate = {
  id: 'project',
  name: 'Build a Portfolio Project',
  domain: 'general',
  summary: 'Scope, build and ship a real project with a clear MVP and polished presentation.',
  icon: 'rocket',
  keywords: ['build a project', 'side project', 'portfolio project', 'personal project', 'build an app', 'capstone', 'hackathon', 'project'],
  skillIds: ['project-delivery'],
  milestones: [
    m('define', 'Define', [
      q('idea', 'Choose and validate the idea', 1.5, 'medium', 'One-paragraph problem statement and target user', 'Pick a problem worth solving.'),
      q('scope', 'Scope the MVP', 1.5, 'medium', 'Feature list split into MVP / later, with acceptance criteria', 'Ruthless prioritization.'),
      q('design', 'Architecture and UI sketch', 2, 'medium', 'Architecture diagram and low-fi wireframes', 'Decide the stack and data model.'),
    ]),
    m('build', 'Build', [
      q('skeleton', 'Walking skeleton', 2.5, 'hard', 'Repo with CI and a deployed hello-world end to end', 'Ship the thinnest slice first.'),
      q('core1', 'Core feature #1', 3, 'hard', 'Feature complete with tests', 'The heart of the MVP.'),
      q('core2', 'Core feature #2', 3, 'hard', 'Feature complete with tests', 'Second essential capability.'),
      q('polish', 'Polish, error states and accessibility', 2, 'medium', 'Checklist of edge cases handled', 'Quality users notice.'),
    ]),
    m('ship', 'Ship', [
      q('docs', 'Documentation and demo', 1.5, 'medium', 'README with screenshots, setup steps and a 2-minute demo video', 'Make it easy to understand.'),
      side('feedback', 'Collect feedback from 3 users', 1.5, 'easy', 'Feedback notes and prioritized fixes', 'Learn from real usage.'),
      boss('launch', 'Boss: Launch the MVP', 2, 'boss', 'Public URL and launch post', 'Put it in front of people.'),
    ]),
  ],
};
