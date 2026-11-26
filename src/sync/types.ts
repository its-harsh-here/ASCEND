/** Shapes shared by the outbox, the engine and the server contract (supabase/migrations/*_sync.sql). */

export interface OutboxEntry {
  seq?: number;
  mutationId: string;
  table: string;
  key: string;
  op: 'upsert' | 'delete';
  /** Changed fields with their new values (null = field removed). Full record for inserts. */
  fields: Record<string, unknown>;
  /** The same fields' values before this change, as this device last knew them. */
  base: Record<string, unknown>;
  restore?: boolean;
  createdAt: string;
}

export interface SyncStateRow {
  key: string;
  value: unknown;
}

export interface SyncConflict {
  id: string;
  table: string;
  recordId: string;
  field: string | null;
  kind: 'text' | 'value' | 'locked' | 'deleted';
  mine: unknown;
  theirs: unknown;
  createdAt: string;
}

export interface QuestCompletionEvent {
  eventId: string;
  questId: string;
  kind: 'complete' | 'reopen';
  occurredAt: string;
}

export interface CloudCacheRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface PushResult {
  mutation_id: string;
  status: 'applied' | 'partial' | 'conflict' | 'rejected';
  noop?: boolean;
  reason?: string;
  conflicts?: { field?: string; kind: SyncConflict['kind']; mine: unknown; theirs?: unknown }[];
  /** The server's current copy, returned when it kept any of its own values. */
  row?: { data: Record<string, unknown>; deleted: boolean; seq: number };
}

export interface PulledRow {
  table: string;
  id: string;
  data: Record<string, unknown>;
  rev: number;
  seq: number;
  deleted: boolean;
}

export interface PullPage {
  rows: PulledRow[];
  next_seq: number;
  has_more: boolean;
}
