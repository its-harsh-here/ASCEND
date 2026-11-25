import { CalendarClock, Clock, Flag, Folder, Hash, Layers, Swords, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Input, Kbd } from '@/components/ui/primitives';
import { parseQuickAdd, type QuickAddTokenType } from '@/domain/quickAdd';
import { skillsForTags } from '@/domain/skills';
import { CATEGORY_LABEL, DIFFICULTY_LABEL, PRIORITY_LABEL } from '@/domain/types';
import { useCampaigns, useSettings, useToday } from '@/hooks/data';
import { formatDateKey, relativeDayLabel } from '@/lib/dates';
import { formatMinutes, orEmpty } from '@/lib/utils';
import { createQuest } from '@/services/quests';
import { useUI } from '@/store/ui';

const TOKEN_ICON: Record<QuickAddTokenType, ReactNode> = {
  date: <CalendarClock />, due: <CalendarClock />, time: <Clock />, duration: <Clock />, tag: <Hash />,
  priority: <Flag />, difficulty: <Swords />, category: <Layers />, campaign: <Folder />,
};

export function QuickAddDialog() {
  const open = useUI((s) => s.quickAddOpen);
  const initial = useUI((s) => s.quickAddText);
  const close = useUI((s) => s.closeQuickAdd);
  const toast = useUI((s) => s.toast);
  const openEditor = useUI((s) => s.openEditor);
  const campaigns = orEmpty(useCampaigns());
  const settings = useSettings();
  const today = useToday();
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const campaign = useMemo(() => {
    if (!parsed.campaignHint) return campaigns.find((c) => c.id === settings?.defaultCampaignId);
    const h = parsed.campaignHint.toLowerCase();
    return campaigns.find((c) => c.name.toLowerCase().startsWith(h)) ?? campaigns.find((c) => c.name.toLowerCase().includes(h));
  }, [parsed.campaignHint, campaigns, settings?.defaultCampaignId]);

  const fields = [
    { label: 'Title', value: parsed.title || '—' },
    { label: 'Scheduled', value: parsed.scheduledDate ? `${relativeDayLabel(parsed.scheduledDate, today)} · ${formatDateKey(parsed.scheduledDate)}` : 'Today' },
    parsed.scheduledTime && { label: 'Time', value: parsed.scheduledTime },
    parsed.dueDate && { label: 'Deadline', value: formatDateKey(parsed.dueDate) },
    { label: 'Estimate', value: formatMinutes(parsed.estimatedMinutes ?? 30) },
    { label: 'Priority', value: PRIORITY_LABEL[parsed.priority ?? 'medium'] },
    { label: 'Difficulty', value: DIFFICULTY_LABEL[parsed.difficulty ?? 'easy'] },
    { label: 'Category', value: CATEGORY_LABEL[parsed.category ?? 'side'] },
    parsed.tags.length > 0 && { label: 'Tags', value: parsed.tags.map((t) => `#${t}`).join(' ') },
    { label: 'Campaign', value: parsed.campaignHint && !campaign ? `“${parsed.campaignHint}” not found` : campaign?.name ?? 'None' },
  ].filter(Boolean) as { label: string; value: string }[];

  const save = async (andEdit = false) => {
    if (!parsed.title) return;
    const q = await createQuest({
      title: parsed.title,
      scheduledDate: parsed.scheduledDate ?? today,
      scheduledTime: parsed.scheduledTime,
      dueDate: parsed.dueDate,
      estimatedMinutes: parsed.estimatedMinutes ?? 30,
      priority: parsed.priority ?? 'medium',
      difficulty: parsed.difficulty ?? 'easy',
      category: parsed.category ?? 'side',
      tags: parsed.tags,
      skillIds: skillsForTags(parsed.tags),
      campaignId: campaign?.id,
      origin: 'quickadd',
    });
    close();
    setText('');
    toast({ title: 'Quest added', description: q.title, tone: 'success', action: andEdit ? undefined : { label: 'Edit', run: () => openEditor(q.id) } });
    if (andEdit) openEditor(q.id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Quick add"
      description="Type naturally. Recognized tokens are highlighted and shown below before saving."
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1.5 text-xs text-fg-dim sm:flex">
            <Kbd>Enter</Kbd> save <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> save & edit
          </span>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!parsed.title} onClick={() => void save()} data-testid="quick-add-save">
            <Zap /> Add quest
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={text}
        aria-label="Quick add quest"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save(e.shiftKey);
          }
        }}
        placeholder="Finish Docker networking tomorrow 2h #cloud !high"
        className="h-12 text-base"
      />
      <div className="mt-3 flex min-h-7 flex-wrap gap-1.5">
        {parsed.tokens.map((t, i) => (
          <Badge key={i} tone="accent" className="h-7 px-2.5 text-xs">
            {TOKEN_ICON[t.type]}
            <span className="font-mono">{t.text}</span>
          </Badge>
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[12px] border border-line bg-bg-raised/60 p-4 text-sm sm:grid-cols-3" data-testid="quick-add-preview">
        {fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[0.68rem] font-semibold tracking-wider text-fg-dim uppercase">{f.label}</dt>
            <dd className="truncate font-medium">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-fg-dim">
        Syntax: <code>today</code> <code>tomorrow</code> <code>fri</code> <code>next week</code> <code>in 3 days</code> <code>dec 5</code> · <code>due fri</code> · <code>at 3pm</code> · <code>2h</code> <code>30m</code> · <code>#tag</code> · <code>!high</code> · <code>~hard</code> · <code>@boss</code> · <code>+campaign</code>
      </p>
    </Dialog>
  );
}
