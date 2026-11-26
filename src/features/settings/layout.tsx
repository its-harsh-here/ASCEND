import { useId, useMemo, type ReactNode } from 'react';
import { ControlLabelContext, Panel } from '@/components/ui/primitives';

export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Panel id={id} className="scroll-mt-24 p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </Panel>
  );
}

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  const ctx = useMemo(() => ({ labelId: `${id}-label`, hintId: hint ? `${id}-hint` : undefined }), [id, !!hint]); // eslint-disable-line react-hooks/exhaustive-deps -- only presence of the hint matters
  return (
    <div className="flex flex-col gap-2 border-b border-line pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div id={ctx.labelId} className="text-sm font-semibold">{label}</div>
        {hint && <div id={ctx.hintId} className="text-xs text-fg-muted">{hint}</div>}
      </div>
      <div className="shrink-0">
        <ControlLabelContext.Provider value={ctx}>{children}</ControlLabelContext.Provider>
      </div>
    </div>
  );
}

