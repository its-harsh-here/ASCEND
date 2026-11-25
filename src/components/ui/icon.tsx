import {
  Bolt, BookOpen, Boxes, Brain, Briefcase, Bug, Castle, Clock, Cloud, Code, Compass, Container, Cpu, Crosshair, Crown,
  Dumbbell, FlameKindling, Flag, Flame, FlaskConical, Footprints, Gauge, Gem, Gift, GitBranch, GitPullRequest, Globe,
  GraduationCap, Heart, Hourglass, Infinity as InfinityIcon, Layers, Layout, Library, Lock, Map, MessagesSquare, Mountain, Network,
  NotebookPen, Orbit, PenTool, Repeat, Rocket, Router, Scroll, ScrollText, Server, Shield, ShipWheel, Sigma, Skull, Sparkles,
  Sun, Swords, Terminal, Workflow, Zap, Coffee, Film, Gamepad2, Pizza, Bed, Music, Plane, ShoppingBag, Trophy, Star,
  type LucideIcon, type LucideProps,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  bolt: Bolt, 'book-open': BookOpen, boxes: Boxes, brain: Brain, briefcase: Briefcase, bug: Bug, castle: Castle, clock: Clock,
  cloud: Cloud, code: Code, compass: Compass, container: Container, cpu: Cpu, crosshair: Crosshair, crown: Crown,
  dumbbell: Dumbbell, 'flame-kindling': FlameKindling, flag: Flag, flame: Flame, flask: FlaskConical, 'flask-conical': FlaskConical,
  footprints: Footprints, gauge: Gauge, gem: Gem, gift: Gift, 'git-branch': GitBranch, 'git-pull-request': GitPullRequest,
  globe: Globe, 'graduation-cap': GraduationCap, heart: Heart, hourglass: Hourglass, infinity: InfinityIcon, layers: Layers,
  layout: Layout, library: Library, lock: Lock, map: Map, 'messages-square': MessagesSquare, mountain: Mountain,
  network: Network, 'notebook-pen': NotebookPen, orbit: Orbit, 'pen-tool': PenTool, repeat: Repeat, rocket: Rocket,
  router: Router, scroll: Scroll, 'scroll-text': ScrollText, server: Server, shield: Shield, 'ship-wheel': ShipWheel,
  sigma: Sigma, skull: Skull, sparkles: Sparkles, sun: Sun, swords: Swords, terminal: Terminal, workflow: Workflow, zap: Zap,
  coffee: Coffee, film: Film, gamepad: Gamepad2, pizza: Pizza, bed: Bed, music: Music, plane: Plane, 'shopping-bag': ShoppingBag,
  trophy: Trophy, star: Star,
};

export const REWARD_ICONS = ['gift', 'film', 'gamepad', 'pizza', 'coffee', 'bed', 'music', 'plane', 'shopping-bag', 'star'];

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] ?? Sparkles;
  return <C {...props} />;
}
