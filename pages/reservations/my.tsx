import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import SubHeader from '../../components/SubHeader';
import { getSystemAdminHref } from '../../lib/adminGuard';

type Reservation = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  venueId?: string;
  createdBy: string;
};

type Props = {
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return { mmdd: `${m}/${day}`, dow: labels[d.getDay()], hm: `${hh}:${mm}` };
};

const MyReservationsPage = ({ profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const [effectiveProfileId, setEffectiveProfileId] = useState<string | null>(profileId);
  const [items, setItems] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!effectiveProfileId) {
      try {
        const p = window.localStorage.getItem('kcisProfileId');
        if (p) setEffectiveProfileId(p);
      } catch {}
    }
  }, [effectiveProfileId]);

  useEffect(() => {
    if (!effectiveProfileId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/events?communityId=kcis&profileId=${encodeURIComponent(effectiveProfileId)}&type=reservation`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const mine = (d?.events || []) as Reservation[];
        setItems(mine);
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [effectiveProfileId]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...(items || [])].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return {
      upcoming: sorted.filter((x) => new Date(x.endAt).getTime() >= now),
      past: sorted.filter((x) => new Date(x.endAt).getTime() < now).reverse(),
    };
  }, [items]);

  return (
    <>
      <Head>
        <title>KCIS | 나의 예약현황</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader
        profileId={profileId}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref}
      />

      <main style={{ maxWidth: 840, margin: '0 auto', padding: '1.5rem 1rem 5rem', display: 'grid', gap: '1.25rem' }}>
        <section style={{ padding: '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>나의 예약현황</h2>
            <Link
              href={`/reservation${effectiveProfileId ? `?profileId=${encodeURIComponent(effectiveProfileId)}` : ''}`}
              style={{ padding: '0.5rem 1rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: '#fff', color: 'var(--color-primary)', fontWeight: 800, fontSize: '0.86rem', textDecoration: 'none' }}
            >
              + 새 예약하기
            </Link>
          </div>

          {!effectiveProfileId ? (
            <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem' }}>로그인 후 이용해 주세요.</p>
          ) : loading ? (
            <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem' }}>불러오는 중…</p>
          ) : (
            <>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.92rem', color: '#3F6212', fontWeight: 800 }}>다가오는 예약 ({upcoming.length})</h3>
                {upcoming.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>예정된 예약이 없습니다.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
                    {upcoming.map((r) => {
                      const s = fmtDateTime(r.startAt);
                      const e = fmtDateTime(r.endAt);
                      return (
                        <li
                          key={r.id + r.startAt}
                          style={{
                            padding: '0.85rem 1rem',
                            borderRadius: 12,
                            background: '#ECFCCB',
                            border: '1px solid #D9F09E',
                            display: 'grid',
                            gap: '0.35rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--color-ink)' }}>{s.mmdd} ({s.dow})</span>
                            <span style={{ fontSize: '0.92rem', color: 'var(--color-ink)', fontWeight: 700 }}>{s.hm}~{e.hm}</span>
                            <span style={{
                              marginLeft: 'auto',
                              padding: '0.2rem 0.6rem',
                              borderRadius: 999,
                              background: '#DC2626',
                              color: '#fff',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              letterSpacing: '0.02em',
                            }}>● 블록됨</span>
                          </div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--color-ink)' }}>{r.title}</div>
                          {r.location && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>📍 {r.location}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {past.length > 0 && (
                <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--color-ink-2)', fontWeight: 800 }}>지난 예약 ({past.length})</h3>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                    {past.slice(0, 10).map((r) => {
                      const s = fmtDateTime(r.startAt);
                      const e = fmtDateTime(r.endAt);
                      return (
                        <li
                          key={r.id + r.startAt}
                          style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: 10,
                            background: '#F9FAFB',
                            border: '1px solid var(--color-gray)',
                            color: 'var(--color-ink-2)',
                            fontSize: '0.85rem',
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{s.mmdd} ({s.dow})</span>
                          <span style={{ marginLeft: '0.5rem' }}>{s.hm}~{e.hm}</span>
                          <span style={{ marginLeft: '0.5rem' }}>· {r.title}</span>
                          {r.location && <span style={{ marginLeft: '0.5rem' }}>· {r.location}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const profileId = typeof ctx.query.profileId === 'string' ? ctx.query.profileId : null;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;
  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  return {
    props: {
      profileId,
      displayName: nickname,
      nickname,
      email,
      systemAdminHref,
    },
  };
};

export default MyReservationsPage;
