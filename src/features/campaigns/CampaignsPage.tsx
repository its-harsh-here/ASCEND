import { CalendarRange, Clock, Flag, Plus, Target } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { LinkButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Badge, EmptyState, PageHeader, ProgressBar, ProgressRing } from '@/components/ui/primitives';
import { campaignProgress } from '@/features/dashboard/CommandCenter';
import { useCampaigns, useQuests, useQuestlines, useToday } from '@/hooks/data';
import { diffDays, formatDateKey } from '@/lib/dates';
import { formatMinutes, orEmpty } from '@/lib/utils';
import { TEMPLATE_BY_ID } from '@/planning/catalog';
import { swatch, swatchAlpha } from '@/lib/colors';

const STATUS_TONE = { active: 'emerald', paused: 'gold', completed: 'accent', archived: 'neutral' } as const;

export default function CampaignsPage() {
  const campaigns = useCampaigns();
  const quests = orEmpty(useQuests());
  const lines = orEmpty(useQuestlines());
  const today = useToday();
  if (!campaigns) return null;
  const visible = campaigns.filter((c) => c.status !== 'archived');
  return (
    <div>
      <PageHeader
        eyebrow="Major goals"
        title="Campaigns"
        description="Each campaign turns a real-world goal into questlines, milestones and scheduled quests."
        actions={<LinkButton to="/campaigns/new" variant="primary" data-testid="new-campaign"><Plus /> New campaign</LinkButton>}
      />
      {visible.length === 0 ? (
        <div className="panel"><EmptyState icon={<Flag />} title="Your first campaign awaits" description="Describe a goal in plain language — the planner builds a realistic, editable roadmap." action={<LinkButton to="/campaigns/new" variant="primary"><Target /> Create campaign</LinkButton>} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c, i) => {
            const p = campaignProgress(c, quests);
            const total = diffDays(c.endDate, c.startDate) + 1;
            const elapsed = Math.min(total, Math.max(0, diffDays(today, c.startDate) + 1));
            const cLines = lines.filter((l) => l.campaignId === c.id);
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to={`/campaigns/${c.id}`} className="panel group relative block overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-line-strong" data-testid="campaign-card">
                  <div className="absolute inset-x-0 top-0 h-24 opacity-60" style={{ background: `radial-gradient(120% 100% at 0% 0%, ${swatchAlpha(c.color, 20)}, transparent 70%)` }} />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge tone={STATUS_TONE[c.status]} className="mb-2 capitalize">{c.status}</Badge>
                      <h2 className="truncate font-display text-lg font-semibold group-hover:text-accent">{c.name}</h2>
                      <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{c.objective || 'No objective written.'}</p>
                    </div>
                    <ProgressRing value={p.ratio} size={64} stroke={5} tone={swatch(c.color)}>
                      <span className="font-num text-sm font-bold">{Math.round(p.ratio * 100)}%</span>
                    </ProgressRing>
                  </div>
                  <div className="relative mt-4 flex flex-wrap gap-1.5">
                    {cLines.slice(0, 5).map((l) => (
                      <Badge key={l.id}>{l.templateId && <Icon name={TEMPLATE_BY_ID.get(l.templateId)?.icon ?? 'sparkles'} />}{l.title.split(/[(&]/)[0].trim()}</Badge>
                    ))}
                    {cLines.length > 5 && <Badge>+{cLines.length - 5}</Badge>}
                  </div>
                  <div className="relative mt-4 grid grid-cols-3 gap-2 text-xs text-fg-muted">
                    <span className="flex items-center gap-1"><Target className="size-3.5" />{p.done}/{p.total}</span>
                    <span className="flex items-center gap-1"><Clock className="size-3.5" />{formatMinutes(p.doneHours)} / {formatMinutes(p.hours)}</span>
                    <span className="flex items-center gap-1"><CalendarRange className="size-3.5" />{formatDateKey(c.endDate, 'MMM d')}</span>
                  </div>
                  <ProgressBar value={elapsed / total} height={3} tone="cyan" className="relative mt-3 opacity-70" label="Time elapsed" />
                  <div className="relative mt-1 text-[0.68rem] text-fg-dim">Day {elapsed} of {total}</div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
