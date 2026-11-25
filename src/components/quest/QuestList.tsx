import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useQuestContext } from '@/hooks/data';
import { useQuestActions } from '@/hooks/useQuestActions';
import type { Quest } from '@/domain/types';
import { questXp } from '@/domain/xp';
import { useUI } from '@/store/ui';
import { QuestRow } from './QuestRow';

export function QuestList({
  quests,
  today,
  empty,
  showCampaign = true,
  compact,
  selectable,
  selected,
  onSelect,
  trailing,
}: {
  quests: Quest[];
  today: string;
  empty?: ReactNode;
  showCampaign?: boolean;
  compact?: boolean;
  selectable?: boolean;
  selected?: Set<string>;
  onSelect?: (id: string, v: boolean) => void;
  trailing?: (q: Quest) => ReactNode;
}) {
  const ctx = useQuestContext();
  const { complete, reopen } = useQuestActions();
  const openEditor = useUI((s) => s.openEditor);
  const selectQuest = useUI((s) => s.selectQuest);
  if (!ctx) return null;
  if (quests.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-0.5">
      <AnimatePresence initial={false}>
        {quests.map((q) => (
          <motion.div key={q.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <QuestRow
              quest={q}
              today={today}
              xp={questXp(q, ctx.settings)}
              campaignName={showCampaign && q.campaignId ? ctx.campaignName.get(q.campaignId) : undefined}
              subtasks={ctx.subtaskCounts.get(q.id)}
              blocked={ctx.blocked(q.id)}
              onOpen={() => {
                selectQuest(q.id);
                openEditor(q.id);
              }}
              onComplete={(origin) => void complete(q.id, origin)}
              onReopen={() => void reopen(q.id)}
              compact={compact}
              selectable={selectable}
              selected={selected?.has(q.id)}
              onSelect={(v) => onSelect?.(q.id, v)}
              trailing={trailing?.(q)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
