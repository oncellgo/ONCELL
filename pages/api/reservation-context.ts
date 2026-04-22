import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getVenues,
  getVenueBlocks,
  getVenueBlockGroups,
  getSettings,
  getEvents,
  getProfiles,
  getSystemAdmins,
} from '../../lib/dataStore';
import { expandOccurrences, EventRow as RawEventRow } from '../../lib/recurrence';

/**
 * ReservationSlotPicker (components/ReservationSlotPicker.tsx) 가 클라이언트에서 편집 모달 등
 * SSR 경로가 아닌 곳에서 필요한 데이터를 한 번에 받기 위한 공용 엔드포인트.
 *
 * 응답:
 *   - venues: 모든 장소
 *   - blocks: 이벤트 occurrence + adhoc 블럭 (지정 기간 펼친 상태)
 *   - groups: 반복 block group
 *   - settings: slot/availability/reservation limit
 *   - isAdmin: 현재 사용자(profileId/email)의 관리자 여부
 *
 * 기존 pages/reservations/grid.tsx getServerSideProps 의 데이터 로딩 로직을 재사용.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : null;
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : null;

  try {
    const [venuesArr, blocksArr, groupsArr, settingsObj, eventsArr, profilesArr, adminsObj] = await Promise.all([
      getVenues().catch(() => [] as any[]),
      getVenueBlocks().catch(() => [] as any[]),
      getVenueBlockGroups().catch(() => [] as any[]),
      getSettings().catch(() => ({} as any)),
      getEvents().catch(() => [] as any[]),
      getProfiles().catch(() => [] as any[]),
      getSystemAdmins().catch(() => ({ profileIds: [] as string[] })),
    ]);

    const venues = venuesArr as any[];
    const adhocBlocks = blocksArr as any[];
    const groups = groupsArr as any[];
    const allEvents = eventsArr as RawEventRow[];

    const profileMap = new Map<string, { realName?: string; contact?: string }>();
    for (const p of (profilesArr as any[])) {
      if (p?.profileId) profileMap.set(p.profileId, { realName: p.realName, contact: p.contact });
    }

    const adminIds: string[] = Array.isArray((adminsObj as any)?.profileIds) ? (adminsObj as any).profileIds : [];
    const adminEmails: string[] = Array.isArray((adminsObj as any)?.emails) ? ((adminsObj as any).emails as string[]).map((e) => String(e).trim().toLowerCase()) : [];
    const isAdmin = (profileId && adminIds.includes(profileId)) || (!!email && adminEmails.includes(email));

    // 현재 날짜 기준 ±1개월 / +3개월 펼침 (grid.tsx SSR 와 동일)
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59);
    const occurrences = allEvents.flatMap((e) => expandOccurrences(e, { from, to }));

    const eventBlocks: any[] = [];
    for (const occ of occurrences) {
      let vid = occ.venueId;
      if (!vid && occ.location) {
        const v = venues.find((x) => occ.location!.includes(`(${x.code})`) || occ.location === `${x.floor} ${x.name}(${x.code})`);
        if (v) vid = v.id;
      }
      if (!vid) continue;
      const occType = (occ as any).type || 'event';
      const kind: 'event' | 'reservation' = occType === 'reservation' ? 'reservation' : 'event';
      const isOwner = !!profileId && occ.createdBy === profileId;
      const canSeeReserverContact = kind === 'reservation' && (isOwner || !!isAdmin);
      const reserver = kind === 'reservation' ? profileMap.get(occ.createdBy) : undefined;
      const reserverName = kind === 'reservation' ? (reserver?.realName || occ.createdByName || '') : '';
      const reserverContact = canSeeReserverContact ? (reserver?.contact || '') : '';
      const block: any = {
        id: `occ-${occ.occurrenceId}`,
        venueId: vid,
        startAt: occ.startAt,
        endAt: occ.endAt,
        reason: occ.title,
        kind,
      };
      if (kind === 'reservation' && isOwner) block.mine = true;
      if (reserverName) block.reserverName = reserverName;
      if (reserverContact) block.reserverContact = reserverContact;
      // 편집 시 자기 예약을 제외하기 위한 참고 식별자
      block.seriesId = (occ as any).seriesId || occ.id;
      block.dateKey = (occ as any).dateKey || null;
      eventBlocks.push(block);
    }
    const adhocTyped = adhocBlocks.map((b) => ({ ...b, kind: b.kind || 'block' }));
    const blocks = [...adhocTyped, ...eventBlocks];

    const s = (settingsObj || {}) as any;
    const slotMin = s.venueSlotMin === 60 ? 60 : 30;
    const availableStart = typeof s.venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(s.venueAvailableStart) ? s.venueAvailableStart : '06:00';
    const availableEnd = typeof s.venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(s.venueAvailableEnd) ? s.venueAvailableEnd : '22:00';
    const reservationLimitMode: 'unlimited' | 'perUser' = (s.reservationLimitMode === 'perUser' && !isAdmin) ? 'perUser' : 'unlimited';
    const reservationLimitPerUser = Math.max(1, Math.min(10, Number(s.reservationLimitPerUser) || 3));

    return res.status(200).json({
      venues,
      blocks,
      groups,
      slotMin,
      availableStart,
      availableEnd,
      reservationLimitMode,
      reservationLimitPerUser,
      isAdmin: !!isAdmin,
    });
  } catch (error) {
    console.error('[reservation-context] failed:', error);
    return res.status(500).json({ error: 'Failed to load reservation context.' });
  }
};

export default handler;
