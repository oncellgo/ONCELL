import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getEvents, getProfiles, getUsers } from '../../../lib/dataStore';
import { expandOccurrences } from '../../../lib/recurrence';

/**
 * GET /api/admin/reservations?communityId=...
 * 시스템 관리자 전용. 모든 사용자의 장소 예약(type=reservation)을 반환.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const adminId = await requireSystemAdminApi(req, res);
  if (!adminId) return;

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
