import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import SubHeader from '../../components/SubHeader';
import ReservationSlotPicker from '../../components/ReservationSlotPicker';
import GridGuide from '../../components/GridGuide';
import { Venue, Block, BlockGroup } from '../../components/VenueGrid';
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
  reservationLimitMode: 'unlimited' | 'perUser';
  reservationLimitPerUser: number;
  bookingWindowMonths: 1 | 2 | 3 | 6;
  profileId: string | null;
  displayName: string | null;
  contact: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const ReservationGridPage = ({ venues, blocks, groups, slotMin, availableStart, availableEnd, reservationLimitMode, reservationLimitPerUser, bookingWindowMonths, profileId, displayName, contact, nickname, email, systemAdminHref }: Props) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const router = useRouter();
  useRequireLogin(profileId);

  // create 성공(사용자가 성공 모달에서 확인 누른 뒤) 후 대시보드로 이동
  const handleCreated = () => {
    const qs = new URLSearchParams();
    let effPid = profileId;
    if (!effPid) {
      try { effPid = window.localStorage.getItem('kcisProfileId'); } catch {}
    }
    if (effPid) qs.set('profileId', effPid);
    if (nickname) qs.set('nickname', nickname);
    if (email) qs.set('email', email);
    qs.set('focus', 'my-reservations');
    router.push(`/dashboard${qs.toString() ? `?${qs.toString()}` : ''}#my-reservations`);
  };

  return (
    <>
      <Head>
        <title>ONCELL | 장소예약</title>
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
        {/* 온보딩 가이드 — 처음 이용자용 배너 + 3단계 walkthrough. localStorage 로 dismissible. */}
        <GridGuide />
        <section
          style={{
            padding: isMobile ? '0.85rem 0.75rem' : '1.1rem 1.2rem',
            borderRadius: 16,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            boxShadow: 'var(--shadow-card)',
            display: 'grid',
            gap: isMobile ? '0.85rem' : '1rem',
          }}
        >
          <h1 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.3rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>{t('page.reservationGrid.title')}</h1>

          <ReservationSlotPicker
            mode="create"
            venues={venues}
            blocks={blocks}
            groups={groups}
            slotMin={slotMin}
            availableStart={availableStart}
            availableEnd={availableEnd}
            reservationLimitMode={reservationLimitMode}
            reservationLimitPerUser={reservationLimitPerUser}
            bookingWindowMonths={bookingWindowMonths}
            profileId={profileId}
            displayName={displayName}
            contact={contact}
            nickname={nickname}
            email={email}
            isAdmin={!!systemAdminHref}
            onSubmitted={handleCreated}
          />
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
    // 예약자 실명은 로그인 여부와 무관하게 항상 채움 (페이지는 useRequireLogin 으로 클라 가드됨).
    // 연락처는 관리자·본인 전용.
    const canSeeReserverContact = kind === 'reservation' && (isOwner || !!isAdmin);
    const reserver = kind === 'reservation' ? profileMap.get(occ.createdBy) : undefined;
    const reserverName = kind === 'reservation' ? (reserver?.realName || occ.createdByName || '') : '';
    const reserverContact = canSeeReserverContact ? (reserver?.contact || '') : '';
    const block: Block = {
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
    eventBlocks.push(block);
  }
  const adhocTyped: Block[] = adhocBlocks.map((b) => ({ ...b, kind: b.kind || 'block' }));
  const blocks: Block[] = [...adhocTyped, ...eventBlocks];
  const settings = (settingsObj || {}) as { venueSlotMin?: number; venueAvailableStart?: string; venueAvailableEnd?: string; reservationLimitMode?: string; reservationLimitPerUser?: number; reservationBookingWindowMonths?: number };
  const slotMin = settings.venueSlotMin === 60 ? 60 : 30;
  const availableStart = typeof settings.venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableStart) ? settings.venueAvailableStart : '06:00';
  const availableEnd = typeof settings.venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableEnd) ? settings.venueAvailableEnd : '22:00';
  // 관리자는 한도 무시하도록 서버에서 모드 자체를 unlimited 로 덮어 씀 (클라이언트 로직 단순화)
  const reservationLimitMode: 'unlimited' | 'perUser' = (settings.reservationLimitMode === 'perUser' && !isAdmin) ? 'perUser' : 'unlimited';
  const reservationLimitPerUser = Math.max(1, Math.min(10, Number(settings.reservationLimitPerUser) || 3));
  const bwRaw = Number(settings.reservationBookingWindowMonths);
  const bookingWindowMonths: 1 | 2 | 3 | 6 = (bwRaw === 2 || bwRaw === 3 || bwRaw === 6) ? bwRaw : 1;

  const profileId = queryProfileId;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;

  let displayName: string | null = nickname;
  let contact: string | null = null;
  if (profileId) {
    try {
      const p = (profilesArr as Array<any>).find((x) => x.profileId === profileId);
      displayName = p?.realName || nickname || null;
      contact = p?.contact || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });

  return { props: { venues, blocks, groups, slotMin, availableStart, availableEnd, reservationLimitMode, reservationLimitPerUser, bookingWindowMonths, profileId, displayName, contact, nickname, email, systemAdminHref } };
};

export default ReservationGridPage;
