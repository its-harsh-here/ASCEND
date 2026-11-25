import { boss, f, m, q, side, type GoalTemplate } from './types';

export const security: GoalTemplate = {
  id: 'security',
  name: 'Cybersecurity Foundations',
  domain: 'security',
  summary: 'Security fundamentals, web application security and hands-on CTF practice.',
  icon: 'shield',
  keywords: ['cybersecurity', 'cyber security', 'security', 'ethical hacking', 'pentesting', 'penetration testing', 'ctf', 'owasp', 'infosec'],
  skillIds: ['security-fundamentals', 'appsec', 'offensive-security'],
  milestones: [
    m('fund', 'Fundamentals', [
      f('cia', 'Security principles and threat modeling', 1.5, 'easy', 'STRIDE threat model for a simple web app', 'CIA triad, attack surface, defense in depth.', { skills: ['security-fundamentals'] }),
      q('crypto', 'Applied cryptography basics', 2, 'medium', 'Notes and demos of hashing, symmetric/asymmetric encryption and signatures', 'Use crypto correctly, never roll your own.', { skills: ['security-fundamentals'] }),
      q('lab', 'Build a safe practice lab', 1.5, 'medium', 'Isolated VM lab with an intentionally vulnerable app (e.g. DVWA, Juice Shop)', 'Practice legally and safely.', { skills: ['security-fundamentals'] }),
    ]),
    m('appsec', 'Web application security', [
      q('owasp', 'OWASP Top 10 deep dive', 2.5, 'hard', 'One exploited and one fixed example for 5 categories in your lab', 'Injection, broken auth, XSS, SSRF and more.', { skills: ['appsec'] }),
      q('burp', 'Intercepting proxies', 1.5, 'medium', 'Captured and modified requests with a proxy in your lab', 'Understand what the browser really sends.', { skills: ['appsec'] }),
      q('secure-code', 'Secure code review', 2, 'hard', 'Review report of an open-source project section with findings', 'Find bugs before attackers do.', { skills: ['appsec'] }),
    ]),
    m('practice', 'Practice', [
      q('ctf', 'Beginner CTF challenges', 3, 'hard', '5 challenges solved with write-ups', 'Hands-on problem solving.', { skills: ['offensive-security'] }),
      side('linux-priv', 'Linux privilege escalation basics', 2, 'hard', 'Two lab machines rooted with documented steps', 'Misconfigurations and enumeration.', { skills: ['offensive-security'] }),
      boss('boss', 'Boss: Security assessment report', 3, 'boss', 'Professional report on your lab app: findings, severity, remediation', 'Communicate risk like a professional.', { skills: ['appsec'] }),
    ]),
  ],
};

export const ml: GoalTemplate = {
  id: 'ml',
  name: 'Machine Learning',
  domain: 'ml',
  summary: 'From math refreshers to training, evaluating and presenting ML models.',
  icon: 'brain',
  keywords: ['machine learning', 'ml', 'deep learning', 'artificial intelligence', 'neural networks', 'data science', 'pytorch', 'tensorflow', 'ai/ml', 'llms'],
  skillIds: ['math-for-ml', 'machine-learning', 'deep-learning'],
  requires: [{ template: 'programming', milestone: 'syntax' }],
  milestones: [
    m('math', 'Math and tooling', [
      f('linalg', 'Linear algebra refresher', 2, 'medium', 'Notebook implementing vectors, matrix ops and PCA intuition with NumPy', 'Vectors, matrices, dot products, eigenvectors.', { skills: ['math-for-ml'] }),
      f('prob', 'Probability and statistics refresher', 2, 'medium', 'Notebook on distributions, Bayes and hypothesis tests', 'The language of uncertainty.', { skills: ['math-for-ml'] }),
      q('pandas', 'Data wrangling with NumPy and pandas', 2, 'medium', 'Cleaned and explored a public dataset with 5 plots', 'Loading, cleaning, grouping, visualizing.', { skills: ['machine-learning'] }),
    ]),
    m('classic', 'Classical ML', [
      q('regression', 'Linear and logistic regression', 2.5, 'hard', 'Models implemented from scratch and with scikit-learn, compared', 'Loss functions and gradient descent.', { skills: ['machine-learning'] }),
      q('trees', 'Trees, ensembles and feature engineering', 2.5, 'hard', 'Random forest / gradient boosting on tabular data with feature importance', 'Strong baselines for tabular data.', { skills: ['machine-learning'] }),
      q('eval', 'Evaluation and validation', 2, 'medium', 'Cross-validation, confusion matrix, ROC/PR curves for one model', 'Avoid leakage; measure what matters.', { skills: ['machine-learning'] }),
    ]),
    m('deep', 'Deep learning', [
      q('nn', 'Neural networks from scratch', 3, 'hard', 'MLP with backprop implemented in NumPy', 'Understand the mechanics.', { skills: ['deep-learning'] }),
      q('pytorch', 'Training with PyTorch', 3, 'hard', 'CNN trained on an image dataset with training curves', 'Datasets, training loops, GPUs.', { skills: ['deep-learning'] }),
      side('transformers', 'Transformers and fine-tuning', 3, 'hard', 'Small pretrained model fine-tuned on a text task', 'Attention and transfer learning.', { skills: ['deep-learning'], level: 'advanced' }),
      boss('boss', 'Boss: End-to-end ML project', 4, 'boss', 'Repo with data pipeline, model, evaluation report and demo', 'From raw data to a presented result.', { skills: ['machine-learning'] }),
    ]),
  ],
};

export const research: GoalTemplate = {
  id: 'research',
  name: 'Research Project & Paper',
  domain: 'research',
  summary: 'Run a research project from literature review to a written, submittable paper.',
  icon: 'flask',
  keywords: ['research', 'research project', 'research-worthy project', 'research paper', 'paper', 'publication', 'publish', 'thesis', 'literature review', 'research-worthy', 'arxiv'],
  skillIds: ['literature-review', 'research-methodology', 'experimentation', 'evaluation', 'paper-writing'],
  milestones: [
    m('lit', 'Literature review', [
      q('area', 'Choose a research area and seed papers', 1.5, 'medium', 'List of 10 seed papers with one-line relevance notes', 'Survey papers, citations, Google Scholar alerts.', { skills: ['literature-review'] }),
      q('read', 'Deep-read 5 key papers', 4, 'hard', 'Structured notes (problem, method, results, limitations) for 5 papers', 'Three-pass reading method.', { skills: ['literature-review'] }),
      q('gap', 'Identify a research gap', 2, 'hard', 'Related-work matrix and a written gap statement', 'Where is the open question?', { skills: ['literature-review'] }),
    ]),
    m('method', 'Methodology', [
      q('question', 'Formulate research questions and hypotheses', 1.5, 'medium', '2–3 precise research questions with hypotheses', 'Make it falsifiable.', { skills: ['research-methodology'] }),
      q('design', 'Design experiments and baselines', 2, 'hard', 'Experiment plan: datasets, baselines, metrics, ablations', 'Plan before you build.', { skills: ['research-methodology'] }),
    ]),
    m('exp', 'Experiments', [
      q('impl', 'Implement the method', 4, 'hard', 'Reproducible code with config files and seeds', 'Build the core contribution.', { skills: ['experimentation'] }),
      q('baselines', 'Reproduce baselines', 3, 'hard', 'Baseline results within reported ranges', 'Fair comparisons.', { skills: ['experimentation'] }),
      q('run', 'Run experiments and ablations', 3, 'hard', 'Results tables and plots for all planned experiments', 'Gather the evidence.', { skills: ['evaluation'] }),
      q('analysis', 'Analyze results', 2, 'hard', 'Analysis notes with statistical significance and failure cases', 'What do the results actually mean?', { skills: ['evaluation'] }),
    ]),
    m('write', 'Writing', [
      q('outline', 'Paper outline and figures', 2, 'medium', 'Section outline and final figures', 'Tell a clear story.', { skills: ['paper-writing'] }),
      q('draft', 'Write the full draft', 5, 'hard', 'Complete draft (abstract → conclusion)', 'Write, then rewrite.', { skills: ['paper-writing'] }),
      side('feedback', 'Get feedback from a mentor/peer', 1, 'easy', 'Feedback incorporated with a change log', 'Fresh eyes catch gaps.', { skills: ['paper-writing'] }),
      boss('boss', 'Boss: Submit or publish the paper', 2, 'boss', 'Submission to a venue, workshop or arXiv', 'Ship the research.', { skills: ['paper-writing'] }),
    ]),
  ],
};

export const openSource: GoalTemplate = {
  id: 'open-source',
  name: 'Open-Source Contribution',
  domain: 'open-source',
  summary: 'Find a project, understand its codebase and land meaningful merged contributions.',
  icon: 'git-pull-request',
  keywords: ['open source', 'open-source', 'opensource', 'oss', 'contribute', 'contributions', 'gsoc', 'hacktoberfest'],
  skillIds: ['open-source', 'git'],
  milestones: [
    m('find', 'Find your project', [
      f('etiquette', 'Learn open-source etiquette', 1, 'easy', 'Notes on CONTRIBUTING files, codes of conduct and licences', 'How communities work.', { skills: ['open-source'] }),
      q('choose', 'Shortlist 3 projects', 1.5, 'medium', 'Shortlist with activity, issue labels and stack fit', 'Look for "good first issue" and responsive maintainers.', { skills: ['open-source'] }),
      q('setup', 'Build the project locally', 2, 'medium', 'Project builds and tests pass locally', 'Dev environment and test suite.', { skills: ['open-source'] }),
    ]),
    m('contribute', 'Contribute', [
      q('docs-pr', 'First contribution: docs or tests', 1.5, 'medium', 'Pull request opened', 'Low-risk way to learn the workflow.', { skills: ['open-source', 'git'] }),
      q('issue', 'Claim and fix a good first issue', 3, 'hard', 'Pull request with tests opened', 'Communicate on the issue before coding.', { skills: ['open-source', 'git'] }),
      q('review', 'Address review feedback', 1.5, 'medium', 'Feedback addressed and PR merged', 'Iterate with maintainers.', { skills: ['open-source'] }),
      side('triage', 'Help triage issues', 1, 'easy', 'Reproduced/labelled 3 issues', 'Valuable non-code contribution.', { skills: ['open-source'] }),
      boss('boss', 'Boss: Land a substantial feature or fix', 4, 'boss', 'Merged non-trivial PR referenced in your portfolio', 'Make a meaningful dent.', { skills: ['open-source'] }),
    ]),
  ],
};
