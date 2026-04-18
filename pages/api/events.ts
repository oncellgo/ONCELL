import type { NextApiRequest, NextApiResponse } from 'next';
import { expandOccurrences, EventRow, RecurrenceRule } from '../../lib/recurrence';
import { getEvents, setEvents, getCommunities, getSettings } from '../../lib/dataStore';

type Community = {
  id: string;
  name: string;
  adminProfileId?: string;
};

const readEvents = async (): Promise<EventRow[]> => {
  try {
    return (await getEvents()) as EventRow[];
  } catch {
    return [];
  }
};

const sanitizeRule = (raw: any): RecurrenceRule | null => {
  if (!raw || typeof raw !== 'object') return null;
  const freqRaw = raw.freq;
  const freqMap: Record<string, 'daily' | 'weekly' | 'monthly' | 'yearly'> = {
    daily: 'daily', day: 'daily',
    weekly: 'weekly', week: 'weekly',
    monthly: 'monthly', month: 'monthly',
    yearly: 'yearly', year: 'yearly',
  };
  const freq = freqMap[freqRaw];
  if (!freq) return null;
  const rule: RecurrenceRule = { freq };
  if (typeof raw.interval === 'number' && raw.interval > 0) rule.interval = raw.interval;
  if (Array.isArray(raw.byDay)) rule.byDay = raw.byDay.filter((n: any) => typeof n === 'number' && n >= 0 && n <= 6);
  if (Array.isArray(raw.byWeek)) rule.byWeek = raw.byWeek.filter((n: any) => typeof n === 'number' && n >= 1 && n <= 5);
  if (Array.isArray(raw.byMonth)) rule.byMonth = raw.byMonth.filter((n: any) => typeof n === 'number' && n >= 1 && n <= 12);
  if (typeof raw.until === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.until)) rule.until = raw.until.slice(0, 10);
  if (typeof raw.count === 'number' && raw.count > 0) rule.count = raw.count;
  return rule;
};

const parseDateArg = (v: unknown, fallback: Date): Date => {
  if (typeof v !== 'string') return fallback;
  const d = new Date(v);
  return isNaN(d.getTime()) ? fallback : d;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method === 'GET') {
      const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : '';
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
      const typeFilter = typeof req.query.type === 'string' ? req.query.type : '';
      if (!communityId) return res.status(400).json({ error: 'communityId is required.' });

      // 범위: 기본은 현재 월 ±2개월
      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const defaultTo = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59);
      const from = parseDateArg(req.query.from, defaultFrom);
      const to = parseDateArg(req.query.to, defaultTo);

      const all = (await readEvents()).filter((e) => e.communityId === communityId);
      const visible = all.filter((e) => {
        const rowType = e.type || 'event';
        if (typeFilter === 'event' && rowType !== 'event') return false;
        if (typeFilter === 'reservation' && rowType !== 'reservation') return false;
        if (!typeFilter && rowType === 'reservation') {
          return profileId && e.createdBy === profileId;
        }
        const scope = e.scope || 'community';
        if (scope === 'community' || scope === 'worship') return true;
        if (e.shared) return true;
        return profileId && e.createdBy === profileId;
      });

      // 기간 내 occurrence로 펼치기
      const instances = visible.flatMap((ev) => expandOccurrences(ev, { from, to }));
      instances.sort((a, b) => a.startAt.localeCompare(b.startAt));
      return res.status(200).json({ events: instances });
    }

    if (req.method === 'POST') {
      const { communityId, title, startAt, endAt, location, venueId, description, profileId, scope, shared, createdByName, recurrence, type, category } = req.body as any;
      if (!communityId || !title || !startAt || !endAt || !profileId) {
        return res.status(400).json({ error: '필수 값이 누락되었습니다.' });
      }
      const communities = (await getCommunities()) as Community[];
      const community = communities.find((c) => c.id === communityId);
      if (!community) return res.status(404).json({ error: '공동체를 찾을 수 없습니다.' });

      const isAdmin = community.adminProfileId === profileId;
      const resolvedType: 'event' | 'reservation' = type === 'reservation' ? 'reservation' : 'event';
      const resolvedScope: 'community' | 'personal' | 'worship' = scope === 'community' ? 'community' : scope === 'worship' ? 'worship' : 'personal';
      if (resolvedType === 'event' && (resolvedScope === 'community' || resolvedScope === 'worship') && !isAdmin) {
        return res.status(403).json({ error: '공동체/예배 일정은 관리자만 등록할 수 있습니다.' });
      }
      if (resolvedType === 'reservation' && !venueId && !(location || '').trim()) {
        return res.status(400).json({ error: '장소예약은 장소가 필요합니다.' });
      }

      const events = await readEvents();

      // 예약의 경우: 충돌 감지 + per-user 한도 확인
      if (resolvedType === 'reservation') {
        const newStart = new Date(startAt).getTime();
        const newEnd = new Date(endAt).getTime();
        if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newEnd <= newStart) {
          return res.status(400).json({ error: '시간이 올바르지 않습니다.' });
        }

        // 같은 venueId를 쓰는 모든 이벤트의 occurrence를 범위 내로 펼쳐 겹침 확인
        const from = new Date(newStart - 1); const to = new Date(newEnd + 1);
        const conflictTarget = events.filter((e) => (e.venueId && e.venueId === venueId) || (!e.venueId && e.location && location && e.location === location));
        for (const ev of conflictTarget) {
          const insts = expandOccurrences(ev, { from, to });
          for (const inst of insts) {
            const s = new Date(inst.startAt).getTime();
            const t = new Date(inst.endAt).getTime();
            if (s < newEnd && t > newStart) {
              return res.status(409).json({ error: `이미 예약된 시간대입니다: ${inst.title}` });
            }
          }
        }

        // per-user 예약 한도 (현재 시각 이후만 카운트)
        try {
          const settings = await getSettings();
          if (settings && settings.reservationLimitMode === 'perUser') {
            const limit = Math.max(1, Math.min(10, Number(settings.reservationLimitPerUser) || 3));
            const nowTs = Date.now();
            const mine = events.filter((e) => (e.type === 'reservation') && e.createdBy === profileId);
            let futureCount = 0;
            for (const ev of mine) {
              if (ev.rule) {
                const insts = expandOccurrences(ev, { from: new Date(nowTs), to: new Date(nowTs + 365 * 24 * 3600 * 1000) });
                futureCount += insts.length;
              } else if (new Date(ev.endAt).getTime() > nowTs) {
                futureCount++;
              }
            }
            if (futureCount >= limit) {
              return res.status(429).json({ error: `예약 가능 건수(${limit})를 초과했습니다. 지난 예약은 자동 제외됩니다.` });
            }
          }
        } catch {}
      }

      const rule = sanitizeRule(recurrence);
      const row: EventRow = {
        id: `event-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        communityId,
        title: String(title).trim(),
        startAt,
        endAt,
        location: location ? String(location).trim() : undefined,
        venueId: venueId ? String(venueId).trim() : undefined,
        description: description ? String(description).trim() : undefined,
        createdBy: profileId,
        createdByName: createdByName ? String(createdByName).trim() : undefined,
        createdAt: new Date().toISOString(),
        scope: resolvedScope,
        shared: resolvedScope === 'personal' ? Boolean(shared) : false,
        type: resolvedType,
        category: ((typeof category === 'string' && category.trim()) ? category.trim() : undefined) as any,
        rule: rule || undefined,
      };
      events.push(row);
      await setEvents(events);
      return res.status(200).json({ event: row });
    }

    if (req.method === 'PATCH') {
      // 특정 occurrence 수정: { seriesId, occurrenceDate, fields }
      const { seriesId, occurrenceDate, fields, profileId } = req.body as any;
      if (!seriesId || !occurrenceDate || !profileId) return res.status(400).json({ error: 'seriesId, occurrenceDate, profileId required' });
      const events = await readEvents();
      const idx = events.findIndex((e) => e.id === seriesId);
      if (idx === -1) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
      const row = events[idx];
      const isOwner = row.createdBy === profileId;
      const communities = (await getCommunities()) as Community[];
      const community = communities.find((c) => c.id === row.communityId);
      const isAdmin = community?.adminProfileId === profileId;
      if ((row.scope === 'community' || row.scope === 'worship') && !isAdmin) return res.status(403).json({ error: '권한 없음' });
      if (row.scope === 'personal' && !isOwner && !isAdmin) return res.status(403).json({ error: '권한 없음' });

      const overrides = row.overrides || {};
      overrides[occurrenceDate] = { ...(overrides[occurrenceDate] || {}), ...(fields || {}) };
      row.overrides = overrides;
      await setEvents(events);
      return res.status(200).json({ event: row });
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query.id === 'string' ? req.query.id : '';
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
      const occurrenceDate = typeof req.query.occurrenceDate === 'string' ? req.query.occurrenceDate : '';
      const deleteScope = typeof req.query.scope === 'string' ? req.query.scope : 'all';
      if (!id || !profileId) return res.status(400).json({ error: 'id, profileId가 필요합니다.' });

      const events = await readEvents();
      const idx = events.findIndex((e) => e.id === id);
      if (idx === -1) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });

      const row = events[idx];
      const communities = (await getCommunities()) as Community[];
      const community = communities.find((c) => c.id === row.communityId);
      const isAdmin = community?.adminProfileId === profileId;
      const isOwner = row.createdBy === profileId;
      const rowScope = row.scope || 'community';
      if ((rowScope === 'community' || rowScope === 'worship') && !isAdmin) {
        return res.status(403).json({ error: '공동체/예배 일정은 관리자만 삭제할 수 있습니다.' });
      }
      if (rowScope === 'personal' && !isOwner && !isAdmin) {
        return res.status(403).json({ error: '본인의 일정만 삭제할 수 있습니다.' });
      }

      // 단일 회차 삭제 → override로 cancelled: true
      if (deleteScope === 'one' && occurrenceDate) {
        const overrides = row.overrides || {};
        overrides[occurrenceDate] = { ...(overrides[occurrenceDate] || {}), cancelled: true };
        row.overrides = overrides;
        await setEvents(events);
        return res.status(200).json({ ok: true, removed: 1 });
      }

      // 시리즈 전체 삭제
      events.splice(idx, 1);
      await setEvents(events);
      return res.status(200).json({ ok: true, removed: 1 });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Events handler failed.' });
  }
};

export default handler;
