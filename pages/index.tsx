import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import styles from '../styles/Home.module.css';
import TopNav from '../components/TopNav';
import RequiredInfoModal from '../components/RequiredInfoModal';
import { getSystemAdminHref } from '../lib/adminGuard';
import { getProfiles, getUsers } from '../lib/dataStore';
import { useIsMobile } from '../lib/useIsMobile';

type HomeProps = {
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const featureIcons = ['👥', '📅', '📖', '🌱', '🏛️', '🌏'];
const featureKeys = [1, 2, 3, 4, 5, 6] as const;

const Home = ({ profileId, displayName, nickname, email, systemAdminHref }: HomeProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const loggedIn = Boolean(profileId);

  const [effectiveProfileId, setEffectiveProfileId] = useState<string | null>(profileId);
  const [missingFields, setMissingFields] = useState<Array<'realName' | 'contact'>>([]);
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [showRequiredModal, setShowRequiredModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);

  const refreshStatus = async (pid: string) => {
    try {
      const res = await fetch(`/api/auth/missing-fields?profileId=${encodeURIComponent(pid)}`);
      if (res.ok) {
        const d = await res.json();
        setMissingFields(Array.isArray(d.missingFields) ? d.missingFields : []);
        setApprovalStatus(d.status || null);
        return d;
      }
    } catch {}
    return null;
  };

  useEffect(() => {
    let pid = profileId;
    if (!pid) {
      try { pid = window.localStorage.getItem('kcisProfileId'); } catch {}
    }
    if (!pid) return;
    setEffectiveProfileId(pid);
    refreshStatus(pid);
  }, [profileId]);

  const handleReservationClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!effectiveProfileId) {
      window.location.href = '/auth/login';
      return;
    }
    if (missingFields.length > 0) {
      setShowRequiredModal(true);
      return;
    }
    if (approvalStatus === 'pending') {
      setShowPendingModal(true);
      return;
    }
    router.push('/reservations/grid');
  };

  // 로그인 필요 메뉴(큐티·구역모임교안·문의)의 공통 가드
  const handleProtectedClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!effectiveProfileId) {
      window.location.href = '/auth/login';
      return;
    }
    router.push(href);
  };

  return (
    <>
      <Head>
        <title>ONCELL | 우리 공동체의 모든 기록</title>
        <meta
          name="description"
          content="ONCELL — 장소예약·큐티·성경통독·주일예배·구역모임 교안을 한 곳에서. 우리 공동체의 모든 기록."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Open Graph / KakaoTalk·Facebook·Slack 링크 미리보기 */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONCELL" />
        <meta property="og:title" content="ONCELL | 우리 공동체의 모든 기록" />
        <meta
          property="og:description"
          content="장소예약·큐티·성경통독·주일예배·구역모임 교안을 한 곳에서."
        />
        <meta property="og:url" content="https://oncell.org/" />
        <meta property="og:image" content="https://oncell.org/images/icon-512.png" />
        <meta property="og:image:alt" content="ONCELL 로고" />
        <meta property="og:locale" content="ko_KR" />
        {/* Twitter Card (Twitter/X 미리보기) */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="ONCELL | 우리 공동체의 모든 기록" />
        <meta name="twitter:description" content="장소예약·큐티·성경통독·주일예배·구역모임 교안을 한 곳에서." />
        <meta name="twitter:image" content="https://oncell.org/images/icon-512.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={styles.page}>
        <div style={{ padding: isMobile ? '0.5rem 0.5rem 0' : '0.75rem 0.75rem 0', maxWidth: 1040, margin: '0 auto', width: '100%' }}>
          <TopNav profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        </div>

        <main style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '1.25rem 1rem 2rem' : '3rem 1.5rem 4rem', color: '#fff' }}>

          {router.query.beta === '1' && (
            <div style={{ margin: '0 auto 1.5rem', maxWidth: 720, padding: '0.85rem 1rem', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', textAlign: 'center', fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>
              현재 베타 준비 중입니다. 아래에서 인터뷰 또는 대기 등록을 신청해주세요.
            </div>
          )}

          {/* HERO */}
          <section style={{ textAlign: 'center', padding: isMobile ? '1.5rem 0 2.5rem' : '3rem 0 4rem' }}>
            <div style={{ display: 'inline-block', padding: '0.4rem 0.95rem', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.78rem', fontWeight: 600, marginBottom: '1.5rem', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.92)' }}>
              매일 5분, 친구와 함께
            </div>
            <h1 style={{ fontSize: isMobile ? '1.7rem' : '2.6rem', fontWeight: 800, lineHeight: 1.3, margin: '0 0 1.1rem', color: '#fff', letterSpacing: '-0.02em' }}>
              매일 지인들과 함께하는<br />
              <span style={{ color: '#A5F3FC' }}>큐티셀·통독셀</span>로<br />
              우리의 영적세포를 깨워볼까요?<br />
              <span style={{ color: '#A5F3FC' }}>✓ ONCELL</span>로 함께 해요!
            </h1>
            <p style={{ fontSize: isMobile ? '0.98rem' : '1.12rem', color: 'rgba(255,255,255,0.78)', maxWidth: 620, margin: '0 auto 2rem', lineHeight: 1.75 }}>
              ONCELL은 카톡 단톡방이 못 담는 영적 셀입니다.<br />
              글도 댓글도 DM도 없이, 운동 앱이 매일 뛰게 했던 것처럼<br />
              당신을 매일 5분 묵상하게 합니다.
            </p>
          </section>

          {/* 4축 — 이렇게 작동해요 */}
          <section style={{ marginTop: isMobile ? '1.5rem' : '2.5rem' }}>
            <h2 style={{ fontSize: isMobile ? '1.15rem' : '1.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)', textAlign: 'center', margin: '0 0 1.5rem' }}>이렇게 작동해요</h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '0.9rem' }}>
              {[
                { ico: '📖', title: '비공개 묵상 노트', desc: '본인만 보이는 매일 한 줄 묵상. 체크 한 번으로 streak 누적.' },
                { ico: '✓', title: '셀 친구 인증', desc: '카톡으로 초대한 친구 3-5명과 매일 ✓ 공유. 글·댓글·DM 0.' },
                { ico: '🌍', title: '글로벌 익명 동행', desc: '"오늘 1,237명이 같은 본문 읽었어요" — 새벽에 혼자가 아닌 감각.' },
                { ico: '✨', title: '오늘의 묵상 10', desc: 'AI가 가린 익명 묵상 중 매일 큐레이션. 같은 본문자에게만, 24시간 휘발.' },
              ].map((it) => (
                <div key={it.title} style={{ padding: isMobile ? '1rem 1rem' : '1.25rem 1.35rem', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{it.ico}</div>
                  <div style={{ fontWeight: 700, color: '#fff', marginBottom: '0.35rem', fontSize: '1rem' }}>{it.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.88rem', lineHeight: 1.65 }}>{it.desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* 비교 — 왜 ONCELL인가 */}
          <section style={{ marginTop: isMobile ? '2.25rem' : '3rem' }}>
            <h2 style={{ fontSize: isMobile ? '1.15rem' : '1.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)', textAlign: 'center', margin: '0 0 1.5rem' }}>왜 ONCELL인가</h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '0.9rem' }}>
              {[
                { tag: '카톡 단톡방', miss: '묵상·기도제목이 식당 메뉴에 묻힘. 답해야 할 사회적 압력. 휘발.' },
                { tag: 'YouVersion', miss: '솔로 모드라 "혼자 아님" 신호가 없음. 친구가 오늘 했는지 모름.' },
                { tag: 'ONCELL', miss: '구조화된 영적 그릇 + 친구 ✓ 동행 + 콘텐츠 0의 안전. 매일 5분에 최적화.', highlight: true },
              ].map((it) => (
                <div key={it.tag} style={{ padding: isMobile ? '1rem' : '1.25rem 1.35rem', borderRadius: 16, background: it.highlight ? 'rgba(165,243,252,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${it.highlight ? 'rgba(165,243,252,0.32)' : 'rgba(255,255,255,0.1)'}` }}>
                  <div style={{ fontWeight: 700, color: it.highlight ? '#A5F3FC' : '#fff', fontSize: '0.95rem', marginBottom: '0.5rem' }}>{it.tag}</div>
                  <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.88rem', lineHeight: 1.65 }}>{it.miss}</div>
                </div>
              ))}
            </div>
          </section>

          {/* 안전 신호 */}
          <section style={{ marginTop: isMobile ? '2.25rem' : '3rem' }}>
            <h2 style={{ fontSize: isMobile ? '1.15rem' : '1.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)', textAlign: 'center', margin: '0 0 0.5rem' }}>우리가 만들지 않는 것</h2>
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.88rem', margin: '0 0 1.5rem' }}>안전을 위해 의도적으로 빼는 기능들</p>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '0.7rem' }}>
              {[
                { l: 'DM 없음', s: '사적 메시지 채널 0' },
                { l: '콘텐츠 노출 없음', s: '인증 신호만 공유' },
                { l: '친구 초대 기반', s: '모르는 사람 안 섞임' },
                { l: '24시간 휘발', s: '아카이브·랭킹 없음' },
              ].map((it) => (
                <div key={it.l} style={{ padding: '0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem', marginBottom: '0.25rem' }}>{it.l}</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.76rem', lineHeight: 1.5 }}>{it.s}</div>
                </div>
              ))}
            </div>
          </section>

          {/* 기능 라벨 — 비활성 (베타 준비 중) */}
          <section style={{ marginTop: isMobile ? '2.25rem' : '3rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', WebkitOverflowScrolling: 'touch', justifyContent: isMobile ? 'flex-start' : 'center' }}>
              {[
                t('landing.menuReservation'),
                t('landing.menuQT'),
                t('landing.menuReading'),
                t('landing.menuBulletin'),
                t('landing.menuCellTeaching'),
              ].map((label) => (
                <span key={label} style={{ flexShrink: 0, padding: '0.55rem 1rem', minHeight: 40, display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontWeight: 600 }}>
                  {label}
                </span>
              ))}
            </div>
          </section>

        </main>

        <footer style={{ margin: '1.5rem 0 0', padding: isMobile ? '1rem 0.75rem 2rem' : '1rem 1.25rem 1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ marginBottom: '0.35rem' }}>
            <a href="/privacy" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'underline', display: 'inline-block', minHeight: 24 }}>개인정보처리방침</a>
            <span style={{ margin: '0 0.5rem', color: 'rgba(255,255,255,0.3)' }}>|</span>
            <a href="/terms" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'underline', display: 'inline-block', minHeight: 24 }}>이용약관</a>
          </div>
          <div>21 Gangsa Road Singapore 678973</div>
          <div>TEL <a href="tel:+6564686694" style={{ color: 'rgba(255,255,255,0.6)', display: 'inline-block', minHeight: 28, lineHeight: '28px' }}>+65-6468-6694</a></div>
          <div><a href="mailto:koreanchurch@live.com" style={{ color: 'rgba(255,255,255,0.6)', display: 'inline-block', minHeight: 28, lineHeight: '28px' }}>koreanchurch@live.com</a></div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
            <span style={{
              padding: '0.3rem 0.75rem',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.45)',
              fontSize: '0.68rem',
              fontWeight: 500,
              letterSpacing: '0.02em',
            }}>
              © {new Date().getFullYear()} Steward+AI. All rights reserved.
            </span>
          </div>
        </footer>
      </div>

      {showRequiredModal && effectiveProfileId && (
        <RequiredInfoModal
          profileId={effectiveProfileId}
          missingFields={missingFields}
          message="실명과 연락처를 입력하시면 예약을 진행하실 수 있습니다."
          onComplete={async () => {
            setShowRequiredModal(false);
            const d = await refreshStatus(effectiveProfileId);
            if (d?.status === 'pending') setShowPendingModal(true);
            else if (d?.status === 'approved' || d?.status === null) router.push('/reservations/grid');
          }}
          onCancel={() => setShowRequiredModal(false)}
        />
      )}

      {showPendingModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="modal-card" style={{ width: '100%', maxWidth: 420, padding: isMobile ? '1.25rem' : '2rem', borderRadius: 16, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center', display: 'grid', gap: '0.85rem' }}>
            <div style={{ fontSize: isMobile ? '2rem' : '2.5rem' }}>⏳</div>
            <h2 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.2rem', color: '#3F6212' }}>승인 대기 중입니다</h2>
            <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem', lineHeight: 1.6 }}>
              가입 필수정보 입력이 완료되었습니다.<br />관리자의 가입 승인이 필요합니다.<br />승인이 완료되면 장소예약을 이용하실 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setShowPendingModal(false)}
              style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', minHeight: 44, borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const getServerSideProps: GetServerSideProps<HomeProps> = async (context) => {
  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const nickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const email = typeof context.query.email === 'string' ? context.query.email : null;

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
  return { props: { profileId, displayName, nickname, email, systemAdminHref } };
};

export default Home;
