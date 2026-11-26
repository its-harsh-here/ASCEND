import { Command } from 'cmdk';
import {
  Archive, BarChart3, CalendarDays, CheckCircle2, Compass, Flag, GanttChart, KanbanSquare, LayoutDashboard, NotebookPen,
  Plus, Search, Settings, Sparkles, Sun, SunMoon, Swords, Target, Timer, Trophy, Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Kbd } from '@/components/ui/primitives';
import { isPending } from '@/domain/briefing';
import { useCampaigns, useQuests, useSettings } from '@/hooks/data';
import { useQuestActions } from '@/hooks/useQuestActions';
import { THEME_CYCLE, THEME_LABEL } from '@/lib/theme';
import { updateSettings } from '@/services/core';
import { useFocusTimer } from '@/store/focusTimer';
import { useUI } from '@/store/ui';

function Item({ icon, children, shortcut, onSelect, value }: { icon: ReactNode; children: ReactNode; shortcut?: string; onSelect: () => void; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm text-fg-muted data-[selected=true]:bg-surface-3 data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0"
    >
      <span className="text-accent">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </Command.Item>
  );
}

const group = 'px-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[0.65rem] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-fg-dim [&_[cmdk-group-heading]]:uppercase';

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const openEditor = useUI((s) => s.openEditor);
  const selectedQuestId = useUI((s) => s.selectedQuestId);
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();
  const quests = useQuests();
  const settings = useSettings();
  const campaigns = useCampaigns();
  const { complete } = useQuestActions();
  const setFocusQuest = useFocusTimer((s) => s.setQuest);
  const startFocus = useFocusTimer((s) => s.start);
  const [search, setSearch] = useState('');

  const selected = selectedQuestId ? quests?.find((q) => q.id === selectedQuestId) : undefined;
  const results = useMemo(() => {
    if (!quests || search.trim().length < 2) return [];
    const s = search.toLowerCase();
    return quests.filter((q) => !q.archivedAt && (q.title.toLowerCase().includes(s) || q.tags.some((t) => t.includes(s)))).slice(0, 12);
  }, [quests, search]);

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };
  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] px-3 pt-[12vh] backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setOpen(false)}>
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="panel panel-runes w-full max-w-xl overflow-hidden bg-surface!"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Command label="Command palette" loop onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search className="size-4 text-fg-dim" />
                <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder="Search quests or type a command…" className="h-13 flex-1 bg-transparent py-4 text-[0.95rem] outline-none placeholder:text-fg-dim" />
                <Kbd>Esc</Kbd>
              </div>
              <Command.List className="max-h-[min(60vh,460px)] overflow-y-auto p-1.5">
                <Command.Empty className="py-10 text-center text-sm text-fg-dim">
                  No results.{' '}
                  {search.trim() && (
                    <button className="text-accent underline" onClick={() => openQuickAdd(search)}>Create “{search}” as a quest</button>
                  )}
                </Command.Empty>
                {results.length > 0 && (
                  <Command.Group heading="Quests" className={group}>
                    {results.map((q) => (
                      <Item key={q.id} value={`quest ${q.title} ${q.id}`} icon={q.status === 'done' ? <CheckCircle2 /> : <Swords />} onSelect={() => run(() => openEditor(q.id))}>
                        {q.title}
                      </Item>
                    ))}
                  </Command.Group>
                )}
                <Command.Group heading="Actions" className={group}>
                  <Item icon={<Zap />} shortcut="Q" onSelect={() => openQuickAdd(search)}>Quick add quest</Item>
                  <Item icon={<Plus />} shortcut="N" onSelect={() => run(() => openEditor())}>Create quest (detailed)</Item>
                  <Item icon={<Flag />} onSelect={() => go('/campaigns/new')}>Create campaign</Item>
                  <Item icon={<Timer />} shortcut="F" onSelect={() => go('/focus')}>Start focus session</Item>
                  {selected && isPending(selected) && (
                    <>
                      <Item icon={<CheckCircle2 />} value={`complete selected ${selected.title}`} onSelect={() => run(() => void complete(selected.id))}>
                        Complete selected: {selected.title}
                      </Item>
                      <Item icon={<Timer />} value={`focus selected ${selected.title}`} onSelect={() => run(() => { setFocusQuest(selected.id); startFocus(); navigate('/focus'); })}>
                        Focus on selected: {selected.title}
                      </Item>
                    </>
                  )}
                  <Item icon={<NotebookPen />} onSelect={() => go('/reviews')}>Open daily review</Item>
                  {settings && (
                    <Item icon={<SunMoon />} value="theme toggle dark light system appearance" onSelect={() => run(() => void updateSettings({ theme: THEME_CYCLE[settings.theme] }))}>
                      Switch theme to {THEME_LABEL[THEME_CYCLE[settings.theme]]}
                    </Item>
                  )}
                </Command.Group>
                <Command.Group heading="Navigate" className={group}>
                  <Item icon={<LayoutDashboard />} shortcut="G D" onSelect={() => go('/')}>Command Center</Item>
                  <Item icon={<Sun />} shortcut="G T" onSelect={() => go('/today')}>Today’s quests</Item>
                  <Item icon={<Flag />} shortcut="G C" onSelect={() => go('/campaigns')}>Campaigns</Item>
                  <Item icon={<KanbanSquare />} shortcut="G B" onSelect={() => go('/board')}>Quest board</Item>
                  <Item icon={<GanttChart />} onSelect={() => go('/timeline')}>Timeline</Item>
                  <Item icon={<CalendarDays />} shortcut="G K" onSelect={() => go('/calendar')}>Calendar</Item>
                  <Item icon={<Sparkles />} shortcut="G S" onSelect={() => go('/skills')}>Skill tree</Item>
                  <Item icon={<Trophy />} onSelect={() => go('/achievements')}>Achievements & rewards</Item>
                  <Item icon={<BarChart3 />} shortcut="G A" onSelect={() => go('/analytics')}>Analytics</Item>
                  <Item icon={<Archive />} onSelect={() => go('/archive')}>Quest archive</Item>
                  <Item icon={<Settings />} onSelect={() => go('/settings')}>Settings</Item>
                </Command.Group>
                {campaigns && campaigns.length > 0 && (
                  <Command.Group heading="Campaigns" className={group}>
                    {campaigns.slice(0, 8).map((c) => (
                      <Item key={c.id} value={`campaign ${c.name} ${c.id}`} icon={<Target />} onSelect={() => go(`/campaigns/${c.id}`)}>{c.name}</Item>
                    ))}
                  </Command.Group>
                )}
                <Command.Group heading="Help" className={group}>
                  <Item icon={<Compass />} onSelect={() => run(() => toast({ title: 'Keyboard shortcuts', description: 'Ctrl/⌘+K palette · Q quick add · N new quest · F focus · G then D/T/C/B/K/S/A to navigate · [ toggle sidebar' }))}>
                    Keyboard shortcuts
                  </Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
