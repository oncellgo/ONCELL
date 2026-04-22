import type { NextApiRequest, NextApiResponse } from 'next';
import { expandOccurrences, EventRow, RecurrenceRule } from '../../lib/recurrence';
import { getEvents, setEvents, getCommunities, getSettings, getVenues } from '../../lib/dataStore';

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

      // 범위: 기본은 현재 월 ±2개월. 클라이언트가 과도한 범위를 요청해도 서버에서 상한(약 13개월) 적용.
      // 스케일 방어: 수년 범위 요청으로 occurrence 수만/수천건이 한 응답에 실리는 것을 막는다.
      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const defaultTo = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59);
      const requestedFrom = parseDateArg(req.query.from, defaultFrom);
      const requestedTo = parseDateArg(req.query.to, defaultTo);
      const MAX_RANGE_MS = 1000 * 60 * 60 * 24 * 400; // ≈ 13개월
      const from = requestedFrom;
      const to = requestedTo.getTime() - requestedFrom.getTime() > MAX_RANGE_MS
        ? new Date(requestedFrom.getTime() + MAX_RANGE_MS)
        : requestedTo;
      const MAX_EVENTS = 5000; // 응답 상한

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

      // 장소 표시 일관성 보장: venueId 가 있으면 현재 venue 데이터로 location 을 재합성한다.
      // 저장된 location 문자열이 오래되거나 venue 이름이 변경되어도 항상 최신 이름으로 노출 → '엉뚱한 장소' 표시 방지.
      try {
        const venuesArr = (await getVenues()) as Array<{ id: string; floor: string; name: string; code?: string }>;
        const venueById = new Map<string, { floor: string; name: string; code?: string }>();
        for (const v of venuesArr || []) {
          if (v?.id) venueById.set(v.id, { floor: v.floor, name: v.name, code: v.code });
        }
        for (const inst of instances) {
          if (inst.venueId) {
            const v = venueById.get(inst.venueId);
            if (v) {
              inst.location = `${v.floor} ${v.name}${v.code ? `(${v.code})` : ''}`;
            }
          }
        }
      } catch { /* venue fetch 실패 시 저장된 location 그대로 둠 */ }

      const truncated = instances.length > MAX_EVENTS;
      const payload = truncated ? instances.slice(0, MAX_EVENTS) : instances;
      return res.status(200).json({ events: payload, truncated, total: instances.length });
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

      // 장소 정합성 보장: venueId 가 주어졌으면 현재 venue 데이터로 location 을 서버에서 재합성.
      // 클라이언트에서 venueId 와 location 문자열이 일치하지 않게 보낼 여지를 원천 차단.
      let resolvedLocation: string | undefined = typeof location === 'string' ? location : undefined;
      if (venueId) {
        try {
          const venuesArr = (await getVenues()) as Array<{ id: string; floor: string; name: string; code?: string }>;
          const v = (venuesArr || []).find((x) => x.id === venueId);
          if (v) resolvedLocation = `${v.floor} ${v.name}${v.code ? `(${v.code})` : ''}`;
        } catch { /* venue fetch 실패 → 클라이언트가 보낸 값 사용 */ }
      }

      const events = await readEvents();

      // 예약의 경우: 충돌 감지 + per-user 한도 확인
      if (resolvedType === 'reservation') {
        const newStart = new Date(startAt).getTime();
        const newEnd = new Date(endAt).getTime();
        if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newEnd <= newStart) {
          return res.status(400).json({ error: '시간이 올바르지 않습니다.' });
        }

        // 과거 시간 예약 방지 — 관리자 포함 전원
        const nowMs = Date.now();
        if (newStart < nowMs) {
          return res.status(400).json({ error: '지난 시간은 예약할 수 없습니다.' });
        }

        // 예약 가능 기간 제한 (관리자는 예외)
        if (!isAdmin) {
          try {
            const s = await getSettings();
            const bwRaw = Number(s?.reservationBookingWindowMonths);
            const windowMonths = (bwRaw === 2 || bwRaw === 3 || bwRaw === 6) ? bwRaw : 1;
            const limitDate = new Date();
            limitDate.setMonth(limitDate.getMonth() + windowMonths);
            limitDate.setHours(23, 59, 59, 999);
            if (newStart > limitDate.getTime()) {
              return res.status(400).json({ error: `현재 날짜부터 ${windowMonths}개월 이내 날짜만 예약할 수 있습니다.` });
            }
          } catch { /* 설정 조회 실패 시 차단 안 함 */ }
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

        // per-user 예약 한도 (현재 시각 이후만 카운트). 관리자는 한도 무제한.
        if (!isAdmin) {
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
      }

      const rule = sanitizeRule(recurrence);
      const row: EventRow = {
        id: `event-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        communityId,
        title: String(title).trim(),
        startAt,
        endAt,
        location: resolvedLocation ? String(resolvedLocation).trim() : undefined,
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

      // 이미 지난 예약은 수정 불가 (reservation + rule 없는 단일 건 기준). 관리자도 소급 수정 금지.
      if ((row.type || 'event') === 'reservation' && !row.rule) {
        const endMs = new Date(row.endAt).getTime();
        if (Number.isFinite(endMs) && endMs < Date.now()) {
          return res.status(400).json({ error: '이미 지난 예약은 수정할 수 없습니다.' });
        }
      }

      // 예약(reservation) 타입: 시간/장소 변경 시 충돌 검증.
      // 같은 장소에서 같은 시간대에 이미 다른 예약/일정이 있으면 409.
      if ((row.type || 'event') === 'reservation' && fields && (fields.startAt || fields.endAt || fields.venueId || fields.location)) {
        const newStartAt: string | undefined = fields.startAt || row.startAt;
        const newEndAt: string | undefined = fields.endAt || row.endAt;
        const newVenueId: string | undefined = fields.venueId || row.venueId;
        const newLocation: string | undefined = fields.location || row.location;
        if (newStartAt && newEndAt) {
          const newStart = new Date(newStartAt).getTime();
          const newEnd = new Date(newEndAt).getTime();
          if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newEnd <= newStart) {
            return res.status(400).json({ error: '시간이 올바르지 않습니다.' });
          }
          // 과거 시간으로 변경 금지
          if (newStart < Date.now()) {
            return res.status(400).json({ error: '지난 시간으로는 예약을 옮길 수 없습니다.' });
          }
          // 예약 가능 기간 초과 금지 (관리자 제외)
          if (!isAdmin) {
            try {
              const s = await getSettings();
              const bwRaw = Number(s?.reservationBookingWindowMonths);
              const windowMonths = (bwRaw === 2 || bwRaw === 3 || bwRaw === 6) ? bwRaw : 1;
              const limitDate = new Date();
              limitDate.setMonth(limitDate.getMonth() + windowMonths);
              limitDate.setHours(23, 59, 59, 999);
              if (newStart > limitDate.getTime()) {
                return res.status(400).json({ error: `현재 날짜부터 ${windowMonths}개월 이내 날짜만 예약할 수 있습니다.` });
              }
            } catch { /* ignore */ }
          }
          const from = new Date(newStart - 1); const to = new Date(newEnd + 1);
          const conflictTarget = events.filter((e) =>
            e.id !== seriesId && (
              (e.venueId && newVenueId && e.venueId === newVenueId) ||
              (!e.venueId && e.location && newLocation && e.location === newLocation)
            ),
          );
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
        }
      }

      // 장소 정합성: fields.venueId 가 주어지면 현재 venue 데이터로 location 을 재합성.
      const fieldsSanitized: any = { ...(fields || {}) };
      if (fieldsSanitized.venueId) {
        try {
          const venuesArr = (await getVenues()) as Array<{ id: string; floor: string; name: string; code?: string }>;
          const v = (venuesArr || []).find((x) => x.id === fieldsSanitized.venueId);
          if (v) fieldsSanitized.location = `${v.floor} ${v.name}${v.code ? `(${v.code})` : ''}`;
        } catch { /* fallback: keep fields.location as-is */ }
      }

      // 예약(reservation) 타입은 단일 occurrence — overrides 우회하고 base row 직접 업데이트.
      // overrides 는 expandOccurrences 에서 venueId 를 propagate 하지 않아 GET 재합성이 구 venueId 로 역전됨.
      if ((row.type || 'event') === 'reservation' && !row.rule) {
        if (typeof fieldsSanitized.title === 'string') row.title = fieldsSanitized.title;
        if (typeof fieldsSanitized.description === 'string') row.description = fieldsSanitized.description;
        if (typeof fieldsSanitized.startAt === 'string') row.startAt = fieldsSanitized.startAt;
        if (typeof fieldsSanitized.endAt === 'string') row.endAt = fieldsSanitized.endAt;
        if (typeof fieldsSanitized.venueId === 'string') row.venueId = fieldsSanitized.venueId;
        if (typeof fieldsSanitized.location === 'string') row.location = fieldsSanitized.location;
        await setEvents(events);
        return res.status(200).json({ event: row });
      }

      // 일반/반복 이벤트: overrides 경로
      const overrides = row.overrides || {};
      overrides[occurrenceDate] = { ...(overrides[occurrenceDate] || {}), ...fieldsSanitized };
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
