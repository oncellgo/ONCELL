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
  menusEnabled: boolean;
};

const featureModes = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    title: '큐티셀',
    tag: '매일 묵상',
    desc: '매일 본문 + 묵상 노트. 매일성경·생명의삶·직접 입력 중 선택. 셀 친구의 ✓ 체크로 서로 동행 확인.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    title: '통독셀',
    tag: '성경통독',
    desc: '1년 1독·2독, 신약/구약/전체, 시작일 자유 설정. 친구가 오늘 몇 장 읽었는지 한눈에.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    title: '암송셀',
    tag: '말씀 암송',
    desc: '시스템 추천 또는 직접 구절 선택. 빈칸 채우기·음성 테스트로 함께 말씀을 새긴다.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    title: '기도 나눔셀',
    tag: '기도 동행',
    desc: '셀 멤버끼리만 보이는 기도제목과 응답 기록. 친구의 기도에 반응 한 탭으로 함께한다.',
  },
];

const safetyItems = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    label: 'DM 없음',
    sub: '사적 메시지 채널 없음',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    label: '셀 콘텐츠 비공개',
    sub: '관리자도 볼 수 없고 멤버만',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    label: '추측 불가 초대 URL',
    sub: '친구가 보낸 링크로만 가입 가능',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    label: '폐쇄 그룹 흡수 차단',
    sub: '모르는 공동체 자동 가입 없음',
  },
];

const Home = ({ profileId, displayName, nickname, email, systemAdminHref, menusEnabled }: HomeProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [effectiveProfileId, setEffectiveProfileId] = useState<string | null>(profileId);
  const [missingFields, setMissingFields] = useState<Array<'realName' | 'contact'>>([]);
  const [showRequiredModal, setShowRequiredModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);

  const refreshStatus = async (pid: string) => {
    try {
      const res = await fetch(`/api/auth/missing-fields?profileId=${encodeURIComponent(pid)}`);
      if (res.ok) {
        const d = await res.json();
        setMissingFields(Array.isArray(d.missingFields) ? d.missingFields : []);
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

  // 로그인 필요 메뉴(큐티·통독)의 공통 가드
  const handleProtectedClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!effectiveProfileId) {
      window.location.href = '/auth/login';
      return;
    }
    router.push(href);
  };

  const authQs = effectiveProfileId
    ? new URLSearchParams({
        profileId: effectiveProfileId,
        ...(nickname ? { nickname } : {}),
        ...(email ? { email } : {}),
      }).toString()
    : '';
  const loginHref = '/auth/login';
  const dashboardHref = effectiveProfileId ? `/dashboard?${authQs}` : '/dashboard';

  return (
    <>
      <Head>
        <title>ONCELL | 친구와 함께하는 영적 습관</title>
        <meta
          name="description"
          content="ONCELL — 큐티·성경통독·기도나눔·암송을 친구와 함께. 혼자선 안 되는 영적 습관을, 셀로 함께."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONCELL" />
        <meta property="og:title" content="ONCELL | 친구와 함께하는 영적 습관" />
        <meta
          property="og:description"
          content="큐티·성경통독·기도나눔·암송을 친구와 함께. 혼자선 안 되는 영적 습관을, 셀로 함께."
        />
        <meta property="og:url" content="https://oncell.org/" />
        <meta property="og:image" content="https://oncell.org/images/icon-512.png" />
        <meta property="og:image:alt" content="ONCELL 로고" />
        <meta property="og:locale" content="ko_KR" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="ONCELL | 친구와 함께하는 영적 습관" />
        <meta name="twitter:description" content="큐티·성경통독·기도나눔·암송을 친구와 함께. 혼자선 안 되는 영적 습관을, 셀로 함께." />
        <meta name="twitter:image" content="https://oncell.org/images/icon-512.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={styles.page}>
        <TopNav profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />

        <main style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '0 0.75rem 3rem' : '0 1.5rem 5rem', color: '#fff' }}>

          {router.query.beta === '1' && (
            <div style={{ margin: '1rem auto 0', maxWidth: 720, padding: '0.75rem 1rem', borderRadius: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', fontSize: '0.88rem', color: 'rgba(255,255,255,0.82)' }}>
              현재 베타 준비 중입니다. 아래에서 인터뷰 또는 대기 등록을 신청해주세요.
            </div>
          )}

          {/* HERO */}
          <section style={{ textAlign: 'center', padding: isMobile ? '2.5rem 0 3rem' : '4.5rem 0 5rem' }}>
            {/* eyebrow badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.38rem 0.9rem',
              borderRadius: 999,
              background: 'rgba(165,243,252,0.1)',
              border: '1px solid rgba(165,243,252,0.25)',
              fontSize: '0.78rem', fontWeight: 700,
              marginBottom: isMobile ? '1.5rem' : '2rem',
              letterSpacing: '0.05em', color: '#A5F3FC',
              textTransform: 'uppercase',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A5F3FC', display: 'inline-block', flexShrink: 0 }} aria-hidden />
              영적 셀 플랫폼
            </div>

            {/* H1 */}
            <h1 style={{
              fontSize: isMobile ? '2rem' : '3.2rem',
              fontWeight: 800,
              lineHeight: 1.22,
              margin: '0 0 1.5rem',
              color: '#fff',
              letterSpacing: '-0.025em',
              wordBreak: 'keep-all',
            }}>
              혼자선 지치는 신앙생활,<br />
              <span style={{ color: '#A5F3FC' }}>친구와 함께라면 다릅니다</span>
            </h1>

            {/* 부제 */}
            <p style={{
              fontSize: isMobile ? '1rem' : '1.15rem',
              color: 'rgba(255,255,255,0.72)',
              maxWidth: 560,
              margin: '0 auto 0.85rem',
              lineHeight: 1.8,
              wordBreak: 'keep-all',
            }}>
              운동 앱이 매일 뛰게 만든 그 방식으로<br />
              큐티·성경통독·기도나눔·암송으로 우리의 영적세포를 깨워볼까요?<br />
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: isMobile ? '0.9rem' : '1rem' }}>
                <span className="kcis-brand" aria-label="ONCELL" style={{ fontSize: 'inherit' }}>
                  <span aria-hidden>O</span><span aria-hidden>N</span><span aria-hidden>C</span>
                  <span aria-hidden>E</span><span aria-hidden>L</span><span aria-hidden>L</span>
                </span>
                에서 함께 성장해요!
              </span>
            </p>

            {/* 소구문 */}
            <p style={{
              fontSize: isMobile ? '0.88rem' : '0.95rem',
              color: 'rgba(255,255,255,0.5)',
              margin: '0 auto 2.25rem',
              letterSpacing: '0.01em',
            }}>
              셀 친구 3~5명을 초대해, 매일 10분 영적 습관을 만들어보세요.
            </p>

            {/* CTA 버튼 */}
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: 'center',
            }}>
              {effectiveProfileId ? (
                <a
                  href={dashboardHref}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: 48,
                    padding: isMobile ? '0.8rem 1.75rem' : '0.9rem 2rem',
                    borderRadius: 999,
                    background: '#fff',
                    color: '#2D3850',
                    fontWeight: 800,
                    fontSize: isMobile ? '0.95rem' : '1rem',
                    textDecoration: 'none',
                    letterSpacing: '0.01em',
                    width: isMobile ? '100%' : 'auto',
                    maxWidth: isMobile ? 340 : 'none',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                  }}
                >
                  대시보드로 이동
                </a>
              ) : (
                <>
                  <a
                    href={loginHref}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minHeight: 48,
                      padding: isMobile ? '0.8rem 1.75rem' : '0.9rem 2rem',
                      borderRadius: 999,
                      background: '#fff',
                      color: '#2D3850',
                      fontWeight: 800,
                      fontSize: isMobile ? '0.95rem' : '1rem',
                      textDecoration: 'none',
                      letterSpacing: '0.01em',
                      width: isMobile ? '100%' : 'auto',
                      maxWidth: isMobile ? 340 : 'none',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                    }}
                  >
                    지금 무료로 시작하기
                  </a>
                  <a
                    href="#how-it-works"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minHeight: 48,
                      padding: isMobile ? '0.8rem 1.5rem' : '0.9rem 1.75rem',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.18)',
                      color: 'rgba(255,255,255,0.82)',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.95rem' : '1rem',
                      textDecoration: 'none',
                      width: isMobile ? '100%' : 'auto',
                      maxWidth: isMobile ? 340 : 'none',
                    }}
                  >
                    어떻게 작동하나요?
                  </a>
                </>
              )}
            </div>
          </section>

          {/* 감성 연결 한 줄 문구 */}
          <div style={{
            textAlign: 'center',
            margin: isMobile ? '0 0 2.5rem' : '0 0 4rem',
            padding: isMobile ? '1.25rem 1rem' : '1.75rem 2rem',
            borderRadius: 16,
            background: 'rgba(165,243,252,0.05)',
            border: '1px solid rgba(165,243,252,0.12)',
          }}>
            <p style={{
              fontSize: isMobile ? '1rem' : '1.2rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.88)',
              margin: 0,
              lineHeight: 1.7,
              wordBreak: 'keep-all',
            }}>
              "흩어진 우리, 그래도 오늘 함께 말씀 앞에 섰습니다"<br />
              <span style={{ fontSize: isMobile ? '0.85rem' : '0.95rem', fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>
                — 셀 친구의 ✓ 하나가 오늘도 일어나게 합니다
              </span>
            </p>
          </div>

          {/* 4가지 셀 모드 */}
          <section id="how-it-works" style={{ marginBottom: isMobile ? '3rem' : '4.5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: isMobile ? '1.75rem' : '2.5rem' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A5F3FC', margin: '0 0 0.6rem' }}>4가지 셀 모드</p>
              <h2 style={{ fontSize: isMobile ? '1.4rem' : '1.9rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                영적 습관, 이렇게 함께 만들어요
              </h2>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
              gap: isMobile ? '0.75rem' : '1rem',
            }}>
              {featureModes.map((m) => (
                <div
                  key={m.title}
                  style={{
                    padding: isMobile ? '1.25rem' : '1.5rem 1.75rem',
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'flex-start',
                    transition: 'border-color 0.2s ease',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(165,243,252,0.10)',
                    border: '1px solid rgba(165,243,252,0.18)',
                    color: '#A5F3FC',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {m.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#fff', fontSize: isMobile ? '0.98rem' : '1.05rem' }}>{m.title}</span>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700,
                        padding: '0.15rem 0.55rem', borderRadius: 999,
                        background: 'rgba(165,243,252,0.12)',
                        color: '#A5F3FC',
                        letterSpacing: '0.03em',
                      }}>{m.tag}</span>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.88rem', lineHeight: 1.7, margin: 0, wordBreak: 'keep-all' }}>{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 비교 섹션 */}
          <section style={{ marginBottom: isMobile ? '3rem' : '4.5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: isMobile ? '1.75rem' : '2.5rem' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A5F3FC', margin: '0 0 0.6rem' }}>왜 ONCELL인가</p>
              <h2 style={{ fontSize: isMobile ? '1.4rem' : '1.9rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                기존 방식과 무엇이 다른가요
              </h2>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: isMobile ? '0.75rem' : '1rem',
            }}>
              {[
                {
                  tag: '카톡 단톡방',
                  highlight: false,
                  pros: null,
                  cons: ['묵상·기도제목이 일상 대화에 묻힘', '답해야 할 사회적 압력', '검색·기록이 어려움'],
                },
                {
                  tag: '솔로 성경앱',
                  highlight: false,
                  pros: null,
                  cons: ['혼자만 진도를 쌓음', '친구가 오늘 했는지 알 수 없음', '끊겨도 알아주는 사람 없음'],
                },
                {
                  tag: 'ONCELL',
                  highlight: true,
                  pros: ['큐티·통독·암송을 한 셀에서', '셀 친구 ✓ 매일 동행 확인', '셀 콘텐츠는 멤버에게만 공개'],
                  cons: null,
                },
              ].map((it) => (
                <div
                  key={it.tag}
                  style={{
                    padding: isMobile ? '1.25rem' : '1.5rem',
                    borderRadius: 16,
                    background: it.highlight ? 'rgba(32,205,141,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${it.highlight ? 'rgba(32,205,141,0.28)' : 'rgba(255,255,255,0.09)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                    <span style={{
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      color: it.highlight ? '#20CD8D' : 'rgba(255,255,255,0.7)',
                    }}>{it.tag}</span>
                    {it.highlight && (
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 999,
                        background: 'rgba(32,205,141,0.2)', color: '#20CD8D', letterSpacing: '0.02em',
                      }}>추천</span>
                    )}
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.55rem' }}>
                    {(it.pros || it.cons || []).map((line: string, i: number) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.88rem', lineHeight: 1.55, color: it.highlight ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.55)', wordBreak: 'keep-all' }}>
                        <span style={{ color: it.highlight ? '#20CD8D' : 'rgba(255,255,255,0.28)', fontWeight: 700, flexShrink: 0, marginTop: '0.05em' }} aria-hidden>
                          {it.highlight ? '✓' : '—'}
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* 안전 신호 */}
          <section style={{ marginBottom: isMobile ? '3rem' : '4.5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: isMobile ? '1.5rem' : '2rem' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A5F3FC', margin: '0 0 0.6rem' }}>안전 설계</p>
              <h2 style={{ fontSize: isMobile ? '1.4rem' : '1.9rem', fontWeight: 800, color: '#fff', margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
                의도적으로 만들지 않는 것들
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.88rem', margin: 0 }}>
                안전한 영적 공동체를 위해 처음부터 뺀 기능들입니다
              </p>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
              gap: isMobile ? '0.65rem' : '0.85rem',
            }}>
              {safetyItems.map((it) => (
                <div
                  key={it.label}
                  style={{
                    padding: isMobile ? '1rem 0.9rem' : '1.25rem 1rem',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(255,255,255,0.55)',
                    flexShrink: 0,
                  }}>
                    {it.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem', marginBottom: '0.2rem' }}>{it.label}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.76rem', lineHeight: 1.5 }}>{it.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 하단 CTA */}
          <section style={{
            textAlign: 'center',
            padding: isMobile ? '2rem 1.25rem' : '3.5rem 2.5rem',
            borderRadius: 20,
            background: 'rgba(165,243,252,0.05)',
            border: '1px solid rgba(165,243,252,0.14)',
            marginBottom: isMobile ? '2rem' : '3rem',
          }}>
            <h2 style={{
              fontSize: isMobile ? '1.35rem' : '1.75rem',
              fontWeight: 800,
              color: '#fff',
              margin: '0 0 0.85rem',
              letterSpacing: '-0.02em',
              wordBreak: 'keep-all',
            }}>
              오늘, 셀 친구를 초대해보세요
            </h2>
            <p style={{
              fontSize: isMobile ? '0.92rem' : '1rem',
              color: 'rgba(255,255,255,0.62)',
              margin: '0 auto 2rem',
              maxWidth: 440,
              lineHeight: 1.75,
              wordBreak: 'keep-all',
            }}>
              3명이면 충분합니다. 매일 ✓ 하나가 쌓이면,<br />
              6개월 뒤 당신의 신앙생활이 달라집니다.
            </p>
            <div style={{
              display: 'flex', gap: '0.75rem', justifyContent: 'center',
              flexDirection: isMobile ? 'column' : 'row', alignItems: 'center',
            }}>
              {!effectiveProfileId && (
                <a
                  href={loginHref}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: 48,
                    padding: isMobile ? '0.8rem 1.75rem' : '0.9rem 2.25rem',
                    borderRadius: 999,
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: isMobile ? '0.95rem' : '1rem',
                    textDecoration: 'none',
                    letterSpacing: '0.01em',
                    width: isMobile ? '100%' : 'auto',
                    maxWidth: isMobile ? 340 : 'none',
                    boxShadow: '0 4px 24px rgba(32,205,141,0.28)',
                  }}
                >
                  시작하기 — 무료
                </a>
              )}
              {effectiveProfileId && (
                <a
                  href={dashboardHref}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: 48,
                    padding: isMobile ? '0.8rem 1.75rem' : '0.9rem 2.25rem',
                    borderRadius: 999,
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: isMobile ? '0.95rem' : '1rem',
                    textDecoration: 'none',
                    letterSpacing: '0.01em',
                    width: isMobile ? '100%' : 'auto',
                    maxWidth: isMobile ? 340 : 'none',
                    boxShadow: '0 4px 24px rgba(32,205,141,0.28)',
                  }}
                >
                  대시보드로 이동
                </a>
              )}
            </div>
          </section>

          {/* 기능 메뉴 칩 — localhost에서만 활성, prod 비활성 */}
          {menusEnabled && (
            <section style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', WebkitOverflowScrolling: 'touch', justifyContent: isMobile ? 'flex-start' : 'center' }}>
                {[
                  { href: '/qt', label: t('landing.menuQT'), onClick: handleProtectedClick('/qt') },
                  { href: '/reading', label: t('landing.menuReading'), onClick: handleProtectedClick('/reading') },
                ].map((m) => (
                  <a key={m.href} href={m.href} onClick={m.onClick} style={{ flexShrink: 0, padding: '0.55rem 1rem', minHeight: 40, display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.82)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
                    {m.label}
                  </a>
                ))}
              </div>
            </section>
          )}

        </main>

        <footer style={{ margin: '0', padding: isMobile ? '1.25rem 0.75rem 2.5rem' : '1.5rem 1.5rem 2rem', textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.9, borderTop: '1px solid rgba(255,255,255,0.09)' }}>
          <div style={{ marginBottom: '0.35rem' }}>
            <a href="/privacy" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'underline', textUnderlineOffset: 3, display: 'inline-block', minHeight: 24 }}>개인정보처리방침</a>
            <span style={{ margin: '0 0.6rem', color: 'rgba(255,255,255,0.2)' }}>|</span>
            <a href="/terms" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'underline', textUnderlineOffset: 3, display: 'inline-block', minHeight: 24 }}>이용약관</a>
          </div>
          <div style={{ marginTop: '0.85rem' }}>
            <span style={{
              display: 'inline-block',
              padding: '0.28rem 0.7rem',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.38)',
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
          message="실명과 연락처를 입력하시면 계속 진행하실 수 있습니다."
          onComplete={async () => {
            setShowRequiredModal(false);
            const d = await refreshStatus(effectiveProfileId);
            if (d?.status === 'pending') setShowPendingModal(true);
            else if (d?.status === 'approved' || d?.status === null) router.push('/dashboard');
          }}
          onCancel={() => setShowRequiredModal(false)}
        />
      )}

      {showPendingModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: 420, padding: isMobile ? '1.5rem' : '2rem', borderRadius: 20, background: 'rgba(30,40,60,0.95)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)', textAlign: 'center', display: 'grid', gap: '0.85rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(165,243,252,0.10)', border: '1px solid rgba(165,243,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A5F3FC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <h2 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.15rem', color: '#fff', fontWeight: 800 }}>승인 대기 중입니다</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', fontSize: '0.9rem', lineHeight: 1.65 }}>
              필수정보 입력이 완료되었습니다.<br />관리자의 가입 승인 후 이용하실 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setShowPendingModal(false)}
              style={{ marginTop: '0.25rem', padding: '0.75rem 1rem', minHeight: 44, borderRadius: 12, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}
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
  // Vercel 환경(prod·preview)에선 메뉴 비활성. 로컬 dev에선 정상 활성.
  const menusEnabled = !process.env.VERCEL;
  return { props: { profileId, displayName, nickname, email, systemAdminHref, menusEnabled } };
};

export default Home;
