import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useMemo, useState } from 'react';
import SubHeader from '../../components/SubHeader';
import VenueGrid, { Venue, Block, BlockGroup, dateKey } from '../../components/VenueGrid';
import { getSystemAdminHref } from '../../lib/adminGuard';
import { useIsMobile } from '../../lib/useIsMobile';
import { useRequireLogin } from '../../lib/useRequireLogin';
import { expandOccurrences, EventRow as RawEventRow } from '../../lib/recurrence';
import {
  getVenues,
  getVenueBlocks,
  getVenueBlockGroups,
  getSettings,
  getEvents,
  getProfiles,
  getSystemAdmins,
} from '../../lib/dataStore';

type Props = {
  venues: Venue[];
  blocks: Block[];
  groups: BlockGroup[];
  slotMin: number;
  availableStart: string;
  availableEnd: string;
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const ReservationGridPage = ({ venues, blocks, groups, slotMin, availableStart, availableEnd, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const isMobile = useIsMobile();
  useRequireLogin(profileId);

  const [selectedDate, setSelectedDate] = useState<string>(dateKey(new Date()));
  const selDow = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    if (!y || !m || !d) return 0;
    return new Date(y, m - 1, d).getDay();
  }, [selectedDate]);
  const todayKey = dateKey(new Date());
  const isToday = selectedDate === todayKey;

  const shift = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    setSelectedDate(dateKey(dt));
  };

  const dowColor = selDow === 0 ? '#DC2626' : selDow === 6 ? '#2563EB' : 'var(--color-ink)';
  const dowBg = selDow === 0 ? '#FEE2E2' : selDow === 6 ? '#DBEAFE' : '#F3F4F6';

  return (
    <>
      <Head>
        <title>KCIS | 예약현황표</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader
        profileId={profileId}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref}
      />

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '1rem 0.5rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: isMobile ? '0.85rem' : '1rem' }}>
        <section
          style={{
            padding: isMobile ? '0.85rem 0.75rem' : '1.1rem 1.2rem',
            borderRadius: 16,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            boxShadow: 'var(--shadow-card)',
            display: 'grid',
            gap: isMobile ? '0.75rem' : '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.55rem' }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.3rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>📊 예약현황표</h1>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={() => shift(-1)}
                aria-label="이전 날짜"
                style={{ minWidth: 44, minHeight: 44, padding: '0 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}
              >‹</button>
              <button
                type="button"
                onClick={() => setSelectedDate(todayKey)}
                disabled={isToday}
                style={{ minHeight: 44, padding: '0 0.9rem', borderRadius: 10, border: isToday ? '1px solid var(--color-gray)' : '1px solid var(--color-primary)', background: isToday ? '#F9FAFB' : '#fff', color: isToday ? 'var(--color-ink-2)' : 'var(--color-primary-deep)', fontSize: '0.86rem', fontWeight: 800, cursor: isToday ? 'not-allowed' : 'pointer' }}
              >오늘</button>
              <button
                type="button"
                onClick={() => shift(1)}
                aria-label="다음 날짜"
                style={{ minWidth: 44, minHeight: 44, padding: '0 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}
              >›</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: isMobile ? '1.05rem' : '1.15rem', fontWeight: 800, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>{selectedDate}</span>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 999,
                background: dowBg, color: dowColor,
                fontSize: '0.88rem', fontWeight: 800,
              }}
            >{WEEK_LABELS[selDow]}</span>
            {isToday && (
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.65rem', borderRadius: 999, background: '#ECFDF5', border: '1px solid #20CD8D', color: 'var(--color-primary-deep)', fontSize: '0.78rem', fontWeight: 800 }}>오늘</span>
            )}
          </div>

          {/* 범례 */}
          <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.76rem', color: 'var(--color-ink-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: '#F7FEE7', border: '1px solid #D9F09E' }} /> 예약 가능
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: '#DC2626' }} /> 교회일정
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: '#9CA3AF' }} /> 예약됨
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: '#4B5563' }} /> 관리자 블럭
            </span>
          </div>

          <VenueGrid
            venues={venues}
            blocks={blocks}
            groups={groups}
            selectedDate={selectedDate}
            slotMin={slotMin}
            availableStart={availableStart}
            availableEnd={availableEnd}
          />

          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>
            {isMobile ? '📱 가로 스크롤로 장소를 넘기며 확인하세요.' : '가로는 장소, 세로는 시간대입니다. 새 예약은 상단 "장소예약" 메뉴에서 진행하세요.'}
          </p>
        </section>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const queryProfileId = typeof ctx.query.profileId === 'string' ? ctx.query.profileId : null;
  const [venuesArr, blocksArr, groupsArr, settingsObj, eventsArr, profilesArr, adminsObj] = await Promise.all([
    getVenues().catch(() => [] as any[]),
    getVenueBlocks().catch(() => [] as any[]),
    getVenueBlockGroups().catch(() => [] as any[]),
    getSettings().catch(() => ({} as any)),
    getEvents().catch(() => [] as any[]),
    getProfiles().catch(() => [] as any[]),
    getSystemAdmins().catch(() => ({ profileIds: [] as string[] })),
  ]);
  const venues = venuesArr as Venue[];
  const adhocBlocks = blocksArr as Block[];
  const groups = groupsArr as BlockGroup[];
  const allEvents = eventsArr as RawEventRow[];
  const profileMap = new Map<string, { realName?: string; contact?: string }>();
  for (const p of (profilesArr as any[])) {
    if (p?.profileId) profileMap.set(p.profileId, { realName: p.realName, contact: p.contact });
  }
  const adminIds: string[] = Array.isArray((adminsObj as any)?.profileIds) ? (adminsObj as any).profileIds : [];
  const adminEmails: string[] = Array.isArray((adminsObj as any)?.emails) ? ((adminsObj as any).emails as string[]).map((e) => String(e).trim().toLowerCase()) : [];
  const queryEmail = typeof ctx.query.email === 'string' ? ctx.query.email.trim().toLowerCase() : null;
  const isAdmin = (queryProfileId && adminIds.includes(queryProfileId)) || (!!queryEmail && adminEmails.includes(queryEmail));

  // ±2개월 범위만 펼쳐서 grid 블럭으로 변환
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59);
  const occurrences = allEvents.flatMap((e) => expandOccurrences(e, { from, to }));

  const eventBlocks: Block[] = [];
  for (const occ of occurrences) {
    let vid = occ.venueId;
    if (!vid && occ.location) {
      const v = venues.find((x) => occ.location!.includes(`(${x.code})`) || occ.location === `${x.floor} ${x.name}(${x.code})`);
      if (v) vid = v.id;
    }
    if (!vid) continue;
    const occType = (occ as any).type || 'event';
    const kind: 'event' | 'reservation' = occType === 'reservation' ? 'reservation' : 'event';
    const isOwner = !!queryProfileId && occ.createdBy === queryProfileId;
    const canSeeReserver = kind === 'reservation' && (isAdmin || isOwner);
    const reserver = canSeeReserver ? profileMap.get(occ.createdBy) : undefined;
    const reserverName = canSeeReserver ? (reserver?.realName || occ.createdByName || '') : '';
    const reserverContact = canSeeReserver ? (reserver?.contact || '') : '';
    const block: Block = {
      id: `occ-${occ.occurrenceId}`,
      venueId: vid,
      startAt: occ.startAt,
      endAt: occ.endAt,
      reason: occ.title,
      kind,
    };
    if (reserverName) block.reserverName = reserverName;
    if (reserverContact) block.reserverContact = reserverContact;
    eventBlocks.push(block);
  }
  const adhocTyped: Block[] = adhocBlocks.map((b) => ({ ...b, kind: b.kind || 'block' }));
  const blocks: Block[] = [...adhocTyped, ...eventBlocks];
  const settings = (settingsObj || {}) as { venueSlotMin?: number; venueAvailableStart?: string; venueAvailableEnd?: string };
  const slotMin = settings.venueSlotMin === 60 ? 60 : 30;
  const availableStart = typeof settings.venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableStart) ? settings.venueAvailableStart : '06:00';
  const availableEnd = typeof settings.venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableEnd) ? settings.venueAvailableEnd : '22:00';

  const profileId = queryProfileId;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;

  let displayName: string | null = nickname;
  if (profileId) {
    try {
      const p = (profilesArr as Array<any>).find((x) => x.profileId === profileId);
      displayName = p?.realName || nickname || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });

  return { props: { venues, blocks, groups, slotMin, availableStart, availableEnd, profileId, displayName, nickname, email, systemAdminHref } };
};

export default ReservationGridPage;
