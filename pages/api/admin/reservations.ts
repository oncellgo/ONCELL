import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getEvents, getProfiles, getUsers } from '../../../lib/dataStore';
import { expandOccurrences } from '../../../lib/recurrence';

/**
 * GET /api/admin/reservations?communityId=...
 * 시스템 관리자 전용. 모든 사용자의 장소 예약(type=reservation)을 반환.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const adminId = await requireSystemAdminApi(req, res);
  if (!adminId) return;

  // PATCH — 예약 1건 수정 (id로 식별, 필드 부분 업데이트)
  if (req.method === 'PATCH') {
    const { id, title, startAt, endAt, location, venueId } = (req.body || {}) as any;
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    try {
      const { setEvents, getEvents } = await import('../../../lib/dataStore');
      const events = await getEvents();
      // expandOccurrences가 만든 occurrenceId(seriesId:dateKey) 도 처리
      const seriesId = String(id).includes(':') ? String(id).split(':')[0] : String(id);
      const idx = events.findIndex((e: any) => e.id === seriesId);
      if (idx === -1) return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
      const row = events[idx];
      if (row.type !== 'reservation') return res.status(400).json({ error: '예약 항목만 수정할 수 있습니다.' });

      // 시간 변경 시 venueId 충돌 검사 (간단)
      const newStart = startAt ? new Date(startAt).getTime() : new Date(row.startAt).getTime();
      const newEnd = endAt ? new Date(endAt).getTime() : new Date(row.endAt).getTime();
      if (newEnd <= newStart) return res.status(400).json({ error: '종료 시각이 시작보다 빨라야 합니다.' });
      const targetVenue = venueId ?? row.venueId;
      if (targetVenue && (startAt || endAt || venueId)) {
        for (const ev of events) {
          if (ev.id === row.id) continue;
          if (ev.venueId !== targetVenue) continue;
          const s = new Date(ev.startAt).getTime();
          const t = new Date(ev.endAt).getTime();
          if (s < newEnd && t > newStart) {
            return res.status(409).json({ error: `이미 예약된 시간대입니다: ${ev.title}` });
          }
        }
      }

      events[idx] = {
        ...row,
        title: typeof title === 'string' && title.trim() ? title.trim() : row.title,
        startAt: startAt || row.startAt,
        endAt: endAt || row.endAt,
        location: location !== undefined ? location : row.location,
        venueId: venueId !== undefined ? venueId : row.venueId,
      };
      await setEvents(events);
      return res.status(200).json({ ok: true, event: events[idx] });
    } catch (error: any) {
      console.error('admin/reservations PATCH failed:', error?.message || error);
      return res.status(500).json({ error: '수정에 실패했습니다.' });
    }
  }

  // DELETE — 예약 1건 삭제
  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    try {
      const { setEvents, getEvents } = await import('../../../lib/dataStore');
      const events = await getEvents();
      const seriesId = id.includes(':') ? id.split(':')[0] : id;
      const filtered = events.filter((e: any) => e.id !== seriesId);
      if (filtered.length === events.length) return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
      await setEvents(filtered);
      return res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error('admin/reservations DELETE failed:', error?.message || error);
      return res.status(500).json({ error: '삭제에 실패했습니다.' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : '';
  if (!communityId) return res.status(400).json({ error: 'communityId is required.' });

  try {
    const [events, profiles, users] = await Promise.all([
      getEvents(),
      getProfiles(),
      getUsers(),
    ]);
    const reservations = events.filter((e: any) =>
      e.communityId === communityId && (e.type === 'reservation')
    );

    // 범위: 현재 시각 ±6개월
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 6, 0, 23, 59, 59);
    const expanded = reservations.flatMap((ev: any) => expandOccurrences(ev, { from, to }));

    // createdBy → 이름 조회 (profiles → users 순)
    const profileMap = new Map<string, any>();
    profiles.forEach((p: any) => profileMap.set(p.profileId, p));
    const userMap = new Map<string, any>();
    users.forEach((u: any) => userMap.set(u.providerProfileId, u));

    const enriched = expanded.map((e: any) => {
      const p = profileMap.get(e.createdBy);
      const u = userMap.get(e.createdBy);
      const name = e.createdByName || p?.realName || p?.nickname || u?.realName || u?.nickname || null;
      return {
        id: e.id,
        communityId: e.communityId,
        title: e.title,
        startAt: e.startAt,
        endAt: e.endAt,
        location: e.location ?? null,
        venueId: e.venueId ?? null,
        createdBy: e.createdBy,
        createdByName: name,
      };
    });

    enriched.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return res.status(200).json({ reservations: enriched });
  } catch (error: any) {
    console.error('admin/reservations failed:', error?.message || error);
    return res.status(500).json({ error: '예약 목록을 불러오지 못했습니다.' });
  }
};

export default handler;
