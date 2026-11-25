import { Archive, ArchiveRestore, CheckCircle2, Flag, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { QuestList } from '@/components/quest/QuestList';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Input, PageHeader, Panel, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useCampaigns, useQuests, useToday } from '@/hooks/data';
import { formatDateKey } from '@/lib/dates';
import { deleteCampaign, setCampaignStatus } from '@/services/campaigns';
import { deleteQuests, restoreQuests } from '@/services/quests';
import { orEmpty } from '@/lib/utils';

export default function ArchivePage() {
  const quests = orEmpty(useQuests());
  const campaigns = orEmpty(useCampaigns());
  const today = useToday();
  const [q, setQ] = useState('');
  const match = (t: string) => t.toLowerCase().includes(q.toLowerCase());
  const archived = quests.filter((x) => x.archivedAt && match(x.title));
  const completed = useMemo(
    () => quests.filter((x) => x.status === 'done' && !x.archivedAt && match(x.title)).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quests, q],
  );
  const byMonth = completed.reduce<Record<string, typeof completed>>((acc, x) => ((acc[(x.completedAt ?? '').slice(0, 7)] ??= []).push(x), acc), {});
  const oldCampaigns = campaigns.filter((c) => c.status === 'archived' || c.status === 'completed');

  return (
    <div>
      <PageHeader eyebrow="History" title="Quest Archive" description="Completed history, archived quests and finished campaigns. Nothing here is lost until you delete it." />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-dim" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search history…" className="pl-9" aria-label="Search archive" />
      </div>
      <Tabs defaultValue="completed">
        <TabsList className="mb-4">
          <TabsTrigger value="completed"><CheckCircle2 /> Completed <Badge className="h-5">{completed.length}</Badge></TabsTrigger>
          <TabsTrigger value="archived"><Archive /> Archived <Badge className="h-5">{archived.length}</Badge></TabsTrigger>
          <TabsTrigger value="campaigns"><Flag /> Campaigns <Badge className="h-5">{oldCampaigns.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="completed">
          {completed.length === 0 && <Panel><EmptyState icon={<CheckCircle2 />} title="No completed quests yet" description="Your legend starts with the first quest." /></Panel>}
          {Object.entries(byMonth).map(([month, list]) => (
            <Panel key={month} className="mb-3 p-3">
              <h3 className="px-2 pt-1 pb-2 font-display text-sm font-semibold">{month ? formatDateKey(`${month}-01`, 'MMMM yyyy') : 'Unknown'} <span className="ml-1 font-num text-xs text-fg-dim">{list.length}</span></h3>
              <QuestList quests={list} today={today} compact />
            </Panel>
          ))}
        </TabsContent>
        <TabsContent value="archived">
          <Panel className="p-3">
            <QuestList
              quests={archived}
              today={today}
              empty={<EmptyState icon={<Archive />} title="Archive is empty" description="Archived quests are hidden from boards but kept for history." />}
              trailing={(x) => (
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Restore" onClick={() => void restoreQuests([x.id])}><ArchiveRestore /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete permanently" onClick={() => confirm('Delete permanently?') && void deleteQuests([x.id])}><Trash2 /></Button>
                </div>
              )}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="campaigns">
          <Panel className="p-3">
            {oldCampaigns.length === 0 && <EmptyState icon={<Flag />} title="No finished campaigns" description="Completed and archived campaigns appear here." />}
            {oldCampaigns.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2">
                <Flag className={c.status === 'completed' ? 'size-4 text-gold' : 'size-4 text-fg-dim'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="text-xs text-fg-muted">{c.startDate} → {c.endDate} · {c.status}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void setCampaignStatus(c.id, 'active')}><ArchiveRestore /> Reactivate</Button>
                <Button size="icon-sm" variant="ghost" aria-label="Delete campaign" onClick={() => confirm(`Delete “${c.name}” and its quests? XP already earned is kept.`) && void deleteCampaign(c.id, false)}><Trash2 /></Button>
              </div>
            ))}
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
