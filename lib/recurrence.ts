export type RecurrenceRule = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;      // default 1
  byDay?: number[];       // 0=Sun..6=Sat (weekly filter)
  byWeek?: number[];      // 1..5 (monthly: nth occurrence of DOW)
  byMonth?: number[];     // 1..12 (yearly filter)
  until?: string;         // 'YYYY-MM-DD' — inclusive end
  count?: number;         // max occurrences cap
};

export type EventCategory = '일반예배' | '특별예배' | '행사' | '기념일';

export type EventRow = {
  id: string;
  communityId: string;
  title: string;
  startAt: string;        // ISO of anchor (first occurrence)
  endAt: string;          // ISO of anchor end
  location?: string;
  venueId?: string;
  description?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  scope?: 'community' | 'personal' | 'worship';
  shared?: boolean;
  type?: 'event' | 'reservation';
  category?: EventCategory;
  rule?: RecurrenceRule | null;
  overrides?: Record<string, { cancelled?: boolean; title?: string; location?: string; description?: string; startAt?: string; endAt?: string }>;
};

export type EventInstance = EventRow & {
  seriesId: string;
  occurrenceId: string;   // '{seriesId}:{dateKey}' — stable for overrides
  dateKey: string;        // YYYY-MM-DD of occurrence start
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const nthOfDowInMonth = (d: Date) => Math.ceil(d.getDate() / 7);

const advanceOne = (cur: Date, rule: RecurrenceRule) => {
  const freq = rule.freq;
  const interval = Math.max(1, rule.interval || 1);
  const hasFilter = Boolean((rule.byDay && rule.byDay.length) || (rule.byWeek && rule.byWeek.length) || (rule.byMonth && rule.byMonth.length));
  const next = new Date(cur);
  if (hasFilter) {
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (freq === 'daily') next.setDate(next.getDate() + interval);
  else if (freq === 'weekly') next.setDate(next.getDate() + 7 * interval);
  else if (freq === 'monthly') next.setMonth(next.getMonth() + interval);
  else if (freq === 'yearly') next.setFullYear(next.getFullYear() + interval);
  return next;
};

const matchesFilters = (d: Date, rule: RecurrenceRule) => {
  if (rule.byDay && rule.byDay.length > 0 && !rule.byDay.includes(d.getDay())) return false;
  if (rule.byWeek && rule.byWeek.length > 0 && !rule.byWeek.includes(nthOfDowInMonth(d))) return false;
  if (rule.byMonth && rule.byMonth.length > 0 && !rule.byMonth.includes(d.getMonth() + 1)) return false;
  return true;
};

/**
 * rule이 있는 이벤트의 특정 기간 내 occurrence 날짜 목록을 계산.
 * anchor startAt의 시각을 보존하며 날짜만 전진시킨다.
 */
export const expandOccurrences = (
  event: EventRow,
  range: { from: Date; to: Date },
): EventInstance[] => {
  const anchorStart = new Date(event.startAt);
  const anchorEnd = new Date(event.endAt);
  const durationMs = anchorEnd.getTime() - anchorStart.getTime();

  const baseInstance = (s: Date): EventInstance | null => {
    const k = dateKeyOf(s);
    const ov = event.overrides?.[k];
    if (ov?.cancelled) return null;
    const start = ov?.startAt ? new Date(ov.startAt) : s;
    const end = ov?.endAt ? new Date(ov.endAt) : new Date(start.getTime() + durationMs);
    const occurrenceId = `${event.id}:${k}`;
    return {
      ...event,
      id: occurrenceId,           // React key / UI 식별용: occurrence 단위로 유일
      seriesId: event.id,
      occurrenceId,
      dateKey: k,
      title: ov?.title ?? event.title,
      location: ov?.location ?? event.location,
      description: ov?.description ?? event.description,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    };
  };

  // No rule → single occurrence
  if (!event.rule) {
    if (anchorStart.getTime() > range.to.getTime()) return [];
    if (anchorEnd.getTime() < range.from.getTime()) return [];
    const inst = baseInstance(anchorStart);
    return inst ? [inst] : [];
  }

  const rule = event.rule;
  const untilTs = rule.until ? new Date(`${rule.until.slice(0, 10)}T23:59:59`).getTime() : null;
  const rangeFromTs = range.from.getTime();
  const rangeToTs = range.to.getTime();
  const hardCap = rule.count && rule.count > 0 ? Math.min(rule.count, 5000) : 5000;

  const out: EventInstance[] = [];
  let cursor = new Date(anchorStart);
  let produced = 0;
  let safety = 0;
  const safetyMax = 20000;

  while (produced < hardCap && safety < safetyMax) {
    if (untilTs !== null && cursor.getTime() > untilTs) break;
    if (cursor.getTime() > rangeToTs) break;
    if (matchesFilters(cursor, rule)) {
      const occEndTs = cursor.getTime() + durationMs;
      if (occEndTs >= rangeFromTs) {
        const inst = baseInstance(cursor);
        if (inst) out.push(inst);
      }
      produced++;
    }
    cursor = advanceOne(cursor, rule);
    safety++;
  }
  return out;
};

export const expandMany = (
  events: EventRow[],
  range: { from: Date; to: Date },
): EventInstance[] => {
  const out: EventInstance[] = [];
  for (const ev of events) out.push(...expandOccurrences(ev, range));
  return out;
};

/** RRULE 문자열로 직렬화 (ICS용). rule이 없으면 null 반환. */
export const ruleToRRule = (rule: RecurrenceRule): string => {
  const parts: string[] = [];
  const freqMap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' } as const;
  parts.push(`FREQ=${freqMap[rule.freq]}`);
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count && rule.count > 0) parts.push(`COUNT=${rule.count}`);
  if (rule.until) {
    const u = rule.until.slice(0, 10).replace(/-/g, '');
    parts.push(`UNTIL=${u}T235959Z`);
  }
  if (rule.byDay && rule.byDay.length > 0) {
    const dowMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    parts.push(`BYDAY=${rule.byDay.map((d) => dowMap[d]).join(',')}`);
  }
  if (rule.byMonth && rule.byMonth.length > 0) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  return parts.join(';');
};
