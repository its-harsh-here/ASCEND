import { db } from '@/db/schema';
import type { AchievementDef } from '@/domain/achievements';
import { reviewSchema, rewardSchema, timeBlockSchema, type Review, type Reward, type TimeBlock } from '@/domain/types';
import { activeCoins } from '@/domain/xp';
import { nowIso, uid } from '@/lib/utils';
import { logActivity } from './core';
import { evaluateAchievements } from './progression';

/* ───────────── Rewards ───────────── */

export async function coinBalance(): Promise<number> {
  const [events, redemptions] = await Promise.all([db.xpEvents.toArray(), db.redemptions.toArray()]);
  return activeCoins(events) - redemptions.reduce((s, r) => s + r.cost, 0);
}

export async function saveReward(input: Partial<Reward> & { title: string; cost: number }): Promise<Reward> {
  const existing = input.id ? await db.rewards.get(input.id) : undefined;
  const reward = rewardSchema.parse({ ...existing, ...input, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? nowIso() });
  await db.rewards.put(reward);
  return reward;
}

export async function archiveReward(id: string, archived = true): Promise<void> {
  await db.rewards.update(id, { archived });
}

export class InsufficientCoinsError extends Error {
  constructor(public needed: number, public balance: number) {
    super(`Not enough coins: need ${needed}, have ${balance}`);
  }
}

/** Redeem a self-defined real-life reward. Purely virtual bookkeeping — nothing is purchased. */
export async function redeemReward(id: string): Promise<AchievementDef[]> {
  await db.transaction('rw', db.rewards, db.redemptions, db.xpEvents, db.activity, async () => {
    const r = await db.rewards.get(id);
    if (!r) throw new Error('Reward not found');
    const balance = await coinBalance();
    if (balance < r.cost) throw new InsufficientCoinsError(r.cost, balance);
    await db.redemptions.add({ id: uid(), rewardId: id, title: r.title, cost: r.cost, redeemedAt: nowIso() });
    await logActivity('reward.redeemed', `Redeemed “${r.title}” for ${r.cost} coins`, id);
  });
  return evaluateAchievements();
}

/* ───────────── Time blocks ───────────── */

export async function saveTimeBlock(input: Partial<TimeBlock> & Pick<TimeBlock, 'title' | 'date' | 'start' | 'end'>): Promise<TimeBlock> {
  if (input.end <= input.start) throw new Error('End time must be after start time');
  const block = timeBlockSchema.parse({ ...input, id: input.id ?? uid() });
  await db.timeBlocks.put(block);
  return block;
}

export async function deleteTimeBlock(id: string): Promise<void> {
  await db.timeBlocks.delete(id);
}

/* ───────────── Reviews ───────────── */

export function reviewId(kind: Review['kind'], periodKey: string): string {
  return `${kind}:${periodKey}`;
}

export async function saveReview(kind: Review['kind'], periodKey: string, patch: Partial<Review>): Promise<AchievementDef[]> {
  const id = reviewId(kind, periodKey);
  const existing = await db.reviews.get(id);
  const now = nowIso();
  await db.reviews.put(reviewSchema.parse({ ...existing, ...patch, id, kind, periodKey, createdAt: existing?.createdAt ?? now, updatedAt: now }));
  return existing ? [] : evaluateAchievements();
}
