import type { XpEvent } from './types';

export interface SkillBranch {
  id: string;
  name: string;
  color: string; // css var token
  icon: string;
}

export interface SkillDef {
  id: string;
  name: string;
  branch: string;
  description: string;
  prerequisites: string[];
  icon: string;
  /** Tags / keywords that map manually created quests to this skill. */
  aliases: string[];
}

export const SKILL_BRANCHES: SkillBranch[] = [
  { id: 'software', name: 'Software Engineering', color: 'var(--c-violet)', icon: 'code' },
  { id: 'cloud', name: 'Cloud Engineering', color: 'var(--c-cyan)', icon: 'cloud' },
  { id: 'web', name: 'Web Development', color: 'var(--c-indigo)', icon: 'globe' },
  { id: 'security', name: 'Cybersecurity', color: 'var(--c-crimson)', icon: 'shield' },
  { id: 'data', name: 'Data & AI', color: 'var(--c-emerald)', icon: 'brain' },
  { id: 'research', name: 'Research', color: 'var(--c-gold)', icon: 'flask' },
  { id: 'career', name: 'Career', color: 'var(--c-violet)', icon: 'briefcase' },
  { id: 'mind-body', name: 'Mind & Body', color: 'var(--c-emerald)', icon: 'heart' },
];

const s = (
  id: string,
  name: string,
  branch: string,
  description: string,
  prerequisites: string[],
  icon: string,
  aliases: string[] = [],
): SkillDef => ({ id, name, branch, description, prerequisites, icon, aliases: [id, ...aliases] });

export const SKILLS: SkillDef[] = [
  // Software engineering
  s('programming', 'Programming Fundamentals', 'software', 'Variables, control flow, functions, debugging and clean code.', [], 'code', ['python', 'coding', 'programming', 'javascript']),
  s('git', 'Version Control', 'software', 'Git workflows, branching, rebasing and collaboration.', ['programming'], 'git-branch', ['github', 'vcs']),
  s('data-structures', 'Data Structures', 'software', 'Arrays, lists, trees, heaps, hash maps and graphs.', ['programming'], 'boxes', ['ds', 'datastructures']),
  s('algorithms', 'Algorithms', 'software', 'Sorting, searching, recursion, DP and graph algorithms.', ['data-structures'], 'workflow', ['dsa', 'leetcode', 'algo']),
  s('system-design', 'System Design', 'software', 'Scalability, caching, queues, databases and trade-offs.', ['algorithms', 'networking'], 'network', ['architecture', 'design']),
  s('open-source', 'Open Source', 'software', 'Contributing to and maintaining public projects.', ['git'], 'git-pull-request', ['oss', 'opensource']),
  // Cloud
  s('linux', 'Linux', 'cloud', 'Shell, filesystem, processes, permissions and scripting.', [], 'terminal', ['bash', 'shell']),
  s('networking', 'Networking', 'cloud', 'TCP/IP, DNS, HTTP, TLS, subnets and routing.', ['linux'], 'router', ['network', 'dns']),
  s('docker', 'Docker', 'cloud', 'Images, containers, volumes, networks and Compose.', ['linux'], 'container', ['containers']),
  s('kubernetes', 'Kubernetes', 'cloud', 'Pods, deployments, services, ingress and Helm.', ['docker', 'networking'], 'ship-wheel', ['k8s', 'kube']),
  s('aws', 'AWS', 'cloud', 'IAM, EC2, S3, VPC, Lambda and managed services.', ['networking'], 'cloud', ['cloud', 'amazon']),
  s('devops', 'CI/CD & IaC', 'cloud', 'Pipelines, Terraform and observability.', ['docker', 'git'], 'infinity', ['cicd', 'terraform', 'devops']),
  // Web
  s('frontend', 'Frontend', 'web', 'HTML, CSS, JavaScript, React and accessibility.', ['programming'], 'layout', ['react', 'css', 'html', 'ui']),
  s('backend', 'Backend & APIs', 'web', 'HTTP APIs, databases, auth and testing.', ['programming'], 'server', ['api', 'node', 'database', 'sql']),
  s('fullstack', 'Full-Stack Delivery', 'web', 'Shipping complete products end to end.', ['frontend', 'backend'], 'layers', ['fullstack', 'webdev']),
  // Security
  s('security-fundamentals', 'Security Fundamentals', 'security', 'CIA triad, threat modeling and cryptography basics.', ['networking'], 'lock', ['security', 'cyber']),
  s('appsec', 'Application Security', 'security', 'OWASP Top 10, secure coding and testing.', ['security-fundamentals'], 'bug', ['owasp', 'appsec']),
  s('offensive-security', 'Offensive Security', 'security', 'Recon, exploitation and CTF practice.', ['appsec'], 'crosshair', ['ctf', 'pentest']),
  // Data & AI
  s('math-for-ml', 'Math for ML', 'data', 'Linear algebra, probability and statistics.', [], 'sigma', ['math', 'statistics']),
  s('machine-learning', 'Machine Learning', 'data', 'Supervised/unsupervised learning and evaluation.', ['math-for-ml', 'programming'], 'brain', ['ml', 'ai']),
  s('deep-learning', 'Deep Learning', 'data', 'Neural networks, CNNs, transformers and training.', ['machine-learning'], 'cpu', ['dl', 'neural']),
  // Research
  s('literature-review', 'Literature Review', 'research', 'Finding, reading and synthesizing papers.', [], 'library', ['papers', 'reading-papers']),
  s('research-methodology', 'Research Methodology', 'research', 'Questions, hypotheses and study design.', ['literature-review'], 'compass', ['methodology']),
  s('experimentation', 'Experimentation', 'research', 'Building and running reproducible experiments.', ['research-methodology'], 'flask-conical', ['experiments']),
  s('evaluation', 'Evaluation', 'research', 'Metrics, baselines, ablations and statistics.', ['experimentation'], 'gauge', ['evaluation', 'benchmark']),
  s('paper-writing', 'Paper Writing', 'research', 'Structuring, writing and submitting papers.', ['evaluation'], 'pen-tool', ['writing', 'publication']),
  // Career
  s('interviewing', 'Interviewing', 'career', 'Coding, behavioral and system design interviews.', ['algorithms'], 'messages-square', ['interview', 'internship']),
  s('exam-prep', 'Exam Mastery', 'career', 'Structured study, practice tests and revision.', [], 'graduation-cap', ['exam', 'study']),
  s('project-delivery', 'Project Delivery', 'career', 'Scoping, executing and shipping projects.', [], 'rocket', ['project', 'portfolio']),
  // Mind & body
  s('reading', 'Reading', 'mind-body', 'Deliberate reading and note-taking.', [], 'book-open', ['books', 'read']),
  s('fitness', 'Fitness', 'mind-body', 'Strength, cardio, mobility and recovery.', [], 'dumbbell', ['gym', 'workout', 'health', 'run']),
];

export const SKILL_BY_ID: Map<string, SkillDef> = new Map(SKILLS.map((sk) => [sk.id, sk]));

export const SKILL_RANKS = [
  { rank: 0, name: 'Untrained', xp: 0 },
  { rank: 1, name: 'Initiate', xp: 1 },
  { rank: 2, name: 'Practitioner', xp: 300 },
  { rank: 3, name: 'Adept', xp: 800 },
  { rank: 4, name: 'Expert', xp: 1800 },
  { rank: 5, name: 'Master', xp: 3500 },
];

export interface SkillProgress {
  skill: SkillDef;
  xp: number;
  rank: number;
  rankName: string;
  progressToNext: number;
  nextRankXp: number | null;
  unlocked: boolean;
  questsCompleted: number;
}

export function rankForXp(xp: number): { rank: number; name: string; progress: number; next: number | null } {
  let idx = 0;
  for (let i = 0; i < SKILL_RANKS.length; i++) if (xp >= SKILL_RANKS[i].xp) idx = i;
  const cur = SKILL_RANKS[idx];
  const nxt = SKILL_RANKS[idx + 1];
  if (!nxt) return { rank: cur.rank, name: cur.name, progress: 1, next: null };
  const floor = cur.xp;
  return { rank: cur.rank, name: cur.name, progress: (xp - floor) / (nxt.xp - floor), next: nxt.xp };
}

/** Skill XP is derived exclusively from recorded (non-revoked) XP events of completed quests and focus. */
export function computeSkillProgress(events: XpEvent[]): Map<string, SkillProgress> {
  const xp = new Map<string, number>();
  const count = new Map<string, number>();
  for (const e of events) {
    if (e.revoked) continue;
    for (const id of e.skillIds) {
      xp.set(id, (xp.get(id) ?? 0) + e.amount);
      if (e.kind === 'quest') count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  const out = new Map<string, SkillProgress>();
  for (const skill of SKILLS) {
    const total = xp.get(skill.id) ?? 0;
    const r = rankForXp(total);
    out.set(skill.id, {
      skill,
      xp: total,
      rank: r.rank,
      rankName: r.name,
      progressToNext: r.progress,
      nextRankXp: r.next,
      unlocked: false,
      questsCompleted: count.get(skill.id) ?? 0,
    });
  }
  for (const p of out.values()) {
    p.unlocked = p.xp > 0 || p.skill.prerequisites.every((pre) => (out.get(pre)?.rank ?? 0) >= 1);
  }
  return out;
}

/** Map free-form tags to skill ids. */
export function skillsForTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const t = tag.toLowerCase();
    for (const skill of SKILLS) if (skill.aliases.includes(t)) out.add(skill.id);
  }
  return [...out];
}
