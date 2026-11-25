/**
 * Critical path of remaining work: the dependency chain with the greatest total duration.
 * Only defined on a DAG; nodes in cycles are ignored. Returns ids from first to last.
 */
export function criticalPath(nodes: { id: string; hours: number; deps: string[] }[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, { total: number; prev: string | null }>();
  const visiting = new Set<string>();
  const solve = (id: string): { total: number; prev: string | null } => {
    const cached = memo.get(id);
    if (cached) return cached;
    const n = byId.get(id)!;
    if (visiting.has(id)) return { total: -Infinity, prev: null };
    visiting.add(id);
    let best = { total: n.hours, prev: null as string | null };
    for (const d of n.deps) {
      if (!byId.has(d)) continue;
      const r = solve(d);
      if (r.total + n.hours > best.total) best = { total: r.total + n.hours, prev: d };
    }
    visiting.delete(id);
    memo.set(id, best);
    return best;
  };
  let end: string | null = null;
  let max = -Infinity;
  for (const n of nodes) {
    const r = solve(n.id);
    if (r.total > max) {
      max = r.total;
      end = n.id;
    }
  }
  const chain: string[] = [];
  const seen = new Set<string>();
  while (end && !seen.has(end)) {
    seen.add(end);
    chain.unshift(end);
    end = memo.get(end)?.prev ?? null;
  }
  return chain.length > 1 ? chain : [];
}
