import { GetServerSideProps } from 'next';
import Head from 'next/head';
import SubHeader from '../components/SubHeader';
import ScheduleView, { Community, EventRow, WorshipService } from '../components/ScheduleView';
import { getSystemAdminHref } from '../lib/adminGuard';
import { expandOccurrences, EventRow as RawEventRow } from '../lib/recurrence';
import { getCommunities, getEvents, getWorshipServices, getProfiles, getUsers } from '../lib/dataStore';
import { useIsMobile } from '../lib/useIsMobile';

type Props = {
  communities: Community[];
  events: EventRow[];
  worshipServices: WorshipService[];
  defaultCommunityId: string;
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const SchedulePage = ({ communities, events, worshipServices, defaultCommunityId, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const isMobile = useIsMobile();
  return (
    <>
      <Head>
        <title>KCIS | 교회일정</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader
        profileId={profileId}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref}
        rightExtras={systemAdminHref ? (
          <a
            href={`/management?${new URLSearchParams({ ...(profileId ? { profileId } : {}), ...(nickname ? { nickname } : {}), ...(email ? { email } : {}), communityId: defaultCommunityId, isAdmin: '1', menu: '일정관리' }).toString()}`}
            style={{ padding: isMobile ? '0.4rem 0.6rem' : '0.45rem 0.8rem', borderRadius: 10, background: 'var(--color-primary)', color: '#fff', fontSize: isMobile ? '0.78rem' : '0.85rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            {isMobile ? '✏️ 편집' : '✏️ 일정 편집'}
          </a>
        ) : null}
      />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem' }}>
        <ScheduleView
          communities={communities}
          events={events}
          worshipServices={worshipServices}
          defaultCommunityId={defaultCommunityId}
        />
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const [communitiesArr, eventsArr, wsArr] = await Promise.all([
    getCommunities().catch(() => [] as any[]),
    getEvents().catch(() => [] as any[]),
    getWorshipServices().catch(() => [] as any[]),
  ]);
  const communitiesFull = communitiesArr as any[];
  const communities = communitiesFull.map((c) => ({ id: c.id, name: c.name, timezone: c.timezone }));
  const adminProfileIds = new Set<string>(
    communitiesFull.map((c) => c.adminProfileId).filter(Boolean) as string[],
  );
  const allEvents = eventsArr as RawEventRow[];
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 6, 0, 23, 59, 59);
  const expanded = allEvents
    .filter((e) => {
      if (((e.type) || 'event') !== 'event') return false;
      const scope = e.scope || 'community';
      // 공동체/예배 일정은 공개. 개인 일정이어도 shared=true이거나
      // 커뮤니티 관리자가 만든 교회 일정이면 공개.
      if (scope === 'community' || scope === 'worship') return true;
      if (e.shared) return true;
      if (e.createdBy && adminProfileIds.has(e.createdBy)) return true;
      return false;
    })
    .flatMap((e) => expandOccurrences(e, { from, to }));
  // Next.js는 undefined를 JSON 직렬화할 수 없으므로 null 또는 기본값으로 치환.
  const events = expanded.map((e: any) => ({
    id: e.id,
    communityId: e.communityId,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    location: e.location ?? null,
    description: e.description ?? null,
    createdByName: e.createdByName ?? null,
    scope: e.scope ?? null,
    shared: e.shared ?? false,
  })) as unknown as EventRow[];
  const worshipServices = wsArr as WorshipService[];

  const qId = typeof ctx.query.communityId === 'string' ? ctx.query.communityId : '';
  const defaultCommunityId = qId && communities.find((c) => c.id === qId) ? qId : (communities[0]?.id || '');

  const profileId = typeof ctx.query.profileId === 'string' ? ctx.query.profileId : null;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;

  let displayName: string | null = nickname;
  if (profileId) {
    try {
      const [profiles, users] = await Promise.all([
        getProfiles().catch(() => [] as any[]),
        getUsers().catch(() => [] as any[]),
      ]);
      const p = (profiles as Array<any>).find((x) => x.profileId === profileId);
      const u = (users as Array<any>).find((x) => x.providerProfileId === profileId);
      displayName = p?.realName || u?.realName || u?.nickname || nickname || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });

  return {
    props: {
      communities,
      events,
      worshipServices,
      defaultCommunityId,
      profileId,
      displayName,
      nickname,
      email,
      systemAdminHref,
    },
  };
};

export default SchedulePage;
