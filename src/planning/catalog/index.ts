import { aws, devops, docker, kubernetes, linux, networking } from './cloud';
import { backend, dsa, frontend, git, interview, programming, project, systemDesign } from './engineering';
import { exam, fitness, reading } from './life';
import { ml, openSource, research, security } from './science';
import type { GoalTemplate, MilestoneBlueprint, TemplateParams } from './types';

export * from './types';

export const GOAL_TEMPLATES: GoalTemplate[] = [
  programming,
  git,
  dsa,
  systemDesign,
  frontend,
  backend,
  linux,
  networking,
  docker,
  kubernetes,
  aws,
  devops,
  security,
  ml,
  research,
  openSource,
  interview,
  project,
  exam,
  reading,
  fitness,
];

export const TEMPLATE_BY_ID: Map<string, GoalTemplate> = new Map(GOAL_TEMPLATES.map((t) => [t.id, t]));

export const DOMAIN_LABEL: Record<GoalTemplate['domain'], string> = {
  software: 'Software Engineering',
  dsa: 'Data Structures & Algorithms',
  web: 'Web Development',
  cloud: 'Cloud Computing',
  security: 'Cybersecurity',
  ml: 'Machine Learning',
  research: 'Research & Publications',
  'open-source': 'Open Source',
  career: 'Career',
  exam: 'Exam Preparation',
  reading: 'Reading',
  fitness: 'Fitness',
  general: 'Personal Projects',
};

export function resolveMilestones(t: GoalTemplate, params: TemplateParams = {}): MilestoneBlueprint[] {
  return typeof t.milestones === 'function'
    ? t.milestones({ quantity: params.quantity ?? t.defaultQuantity })
    : t.milestones;
}

export function templateHours(t: GoalTemplate, params: TemplateParams = {}): number {
  let h = 0;
  for (const ms of resolveMilestones(t, params)) for (const qb of ms.quests) h += qb.hours;
  return h;
}
