import { DEFAULT_PLAN, ENFORCE_CREDIT_LIMITS, getPlanLimits, PlanKey } from './plans';
import { getCommunities, setCommunities, getUsageLogs, setUsageLogs } from './dataStore';

export type UsageAction =
  | 'ai_translate'
  | 'pdf_export'
  | 'image_upload'
  | 'bulletin_publish'
  | 'notification_send';

export type UsageLog = {
  id: string;
  communityId: string;
  profileId?: string;
  action: UsageAction;
  cost: number;          // Units depend on action (chars, MB, count, etc.)
  balanceAfter?: number; // Remaining monthly allowance after this charge (if tracked)
  metadata?: Record<string, any>;
  at: string;            // ISO timestamp
};

type CommunityRecord = {
  id: string;
  name: string;
  plan?: PlanKey;
  aiCredits?: number;            // Remaining monthly AI char allowance
  purchasedCredits?: number;     // Persistent credits from top-up purchases
  lastQuotaResetAt?: string;     // ISO
  [key: string]: any;
};

const readCommunities = async (): Promise<CommunityRecord[]> => {
  try {
    const arr = await getCommunities();
    return Array.isArray(arr) ? (arr as CommunityRecord[]) : [];
  } catch {
    return [];
  }
};

const writeCommunities = async (list: CommunityRecord[]) => {
  await setCommunities(list);
};

const readUsageLogs = async (): Promise<UsageLog[]> => {
  try {
    const arr = await getUsageLogs();
    return Array.isArray(arr) ? (arr as UsageLog[]) : [];
  } catch {
    return [];
  }
};

const writeUsageLogs = async (logs: UsageLog[]) => {
  await setUsageLogs(logs);
};

const sameMonth = (a: string | undefined, b: Date): boolean => {
  if (!a) return false;
  const da = new Date(a);
  return da.getFullYear() === b.getFullYear() && da.getMonth() === b.getMonth();
};

/**
 * Ensures a community record has plan fields and monthly quota is up to date.
 * Mutates and persists if needed. Returns the (possibly refilled) record.
 */
export const ensurePlanFields = async (communityId: string): Promise<CommunityRecord | null> => {
  const communities = await readCommunities();
  const idx = communities.findIndex((c) => c.id === communityId);
  if (idx === -1) return null;
  const c = communities[idx];
  let mutated = false;

  if (!c.plan) {
    c.plan = DEFAULT_PLAN;
    mutated = true;
  }
  const limits = getPlanLimits(c.plan);
  const now = new Date();
  if (!c.lastQuotaResetAt || !sameMonth(c.lastQuotaResetAt, now)) {
    c.aiCredits = limits.monthlyAiChars;
    c.lastQuotaResetAt = now.toISOString();
    mutated = true;
  }
  if (typeof c.aiCredits !== 'number') {
    c.aiCredits = limits.monthlyAiChars;
    mutated = true;
  }
  if (typeof c.purchasedCredits !== 'number') {
    c.purchasedCredits = 0;
    mutated = true;
  }
  if (mutated) {
    communities[idx] = c;
    await writeCommunities(communities);
  }
  return c;
};

/**
 * Attempts to charge `cost` units from a community's allowance for `action`.
 * - Monthly allowance is consumed first, then purchased credits.
 * - Usage is always logged.
 * - If ENFORCE_CREDIT_LIMITS is false, insufficient balance does NOT block; it charges to negative.
 *
 * Returns { ok, balanceAfter, insufficient }.
 * `insufficient` is true if the charge would exceed allowance (even if ok due to non-enforcement).
 */
export const chargeCredits = async (params: {
  communityId: string;
  profileId?: string;
  action: UsageAction;
  cost: number;
  metadata?: Record<string, any>;
}): Promise<{ ok: boolean; balanceAfter: number; insufficient: boolean }> => {
  const { communityId, profileId, action, cost, metadata } = params;
  const community = await ensurePlanFields(communityId);
  if (!community) return { ok: false, balanceAfter: 0, insufficient: true };

  const available = (community.aiCredits || 0) + (community.purchasedCredits || 0);
  const insufficient = cost > available;

  if (insufficient && ENFORCE_CREDIT_LIMITS) {
    // Log a denied attempt so admins can see demand
    const log: UsageLog = {
      id: `usage-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      communityId,
      profileId,
      action,
      cost: 0,
      metadata: { ...(metadata || {}), denied: true, requestedCost: cost },
      at: new Date().toISOString(),
    };
    const logs = await readUsageLogs();
    logs.push(log);
    await writeUsageLogs(logs);
    return { ok: false, balanceAfter: available, insufficient: true };
  }

  // Deduct: monthly allowance first, overflow from purchased credits (even if negative)
  const communities = await readCommunities();
  const idx = communities.findIndex((c) => c.id === communityId);
  if (idx === -1) return { ok: false, balanceAfter: 0, insufficient: true };
  const rec = communities[idx];
  let remaining = cost;
  const monthly = rec.aiCredits || 0;
  if (monthly >= remaining) {
    rec.aiCredits = monthly - remaining;
    remaining = 0;
  } else {
    remaining -= monthly;
    rec.aiCredits = 0;
    rec.purchasedCredits = (rec.purchasedCredits || 0) - remaining;
    remaining = 0;
  }
  communities[idx] = rec;
  await writeCommunities(communities);

  const balanceAfter = (rec.aiCredits || 0) + (rec.purchasedCredits || 0);

  const log: UsageLog = {
    id: `usage-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    communityId,
    profileId,
    action,
    cost,
    balanceAfter,
    metadata,
    at: new Date().toISOString(),
  };
  const logs = await readUsageLogs();
  logs.push(log);
  await writeUsageLogs(logs);

  return { ok: true, balanceAfter, insufficient };
};

export const getCommunityUsage = async (communityId: string): Promise<UsageLog[]> => {
  const logs = await readUsageLogs();
  return logs.filter((l) => l.communityId === communityId).sort((a, b) => b.at.localeCompare(a.at));
};

export const getCommunityCreditState = async (communityId: string) => {
  const c = await ensurePlanFields(communityId);
  if (!c) return null;
  const limits = getPlanLimits(c.plan);
  return {
    plan: c.plan,
    monthlyQuota: limits.monthlyAiChars,
    monthlyRemaining: c.aiCredits || 0,
    purchasedCredits: c.purchasedCredits || 0,
    lastQuotaResetAt: c.lastQuotaResetAt,
    limits,
  };
};
