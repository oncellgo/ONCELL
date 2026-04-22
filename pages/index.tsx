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
        <title>KCIS|장소관리시스템</title>
        <meta
          name="description"
          content="싱가폴한인교회(KCIS) 관리 시스템 — 장소예약·큐티·성경통독·주일예배·구역모임 교안을 한 곳에서."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Open Graph / KakaoTalk·Facebook·Slack 링크 미리보기 */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="KCIS" />
        <meta property="og:title" content="KCIS|장소관리시스템" />
        <meta
          property="og:description"
          content="장소예약·큐티·성경통독·주일예배·구역모임 교안을 한 곳에서."
        />
        <meta property="og:url" content="https://kcis-ecru.vercel.app/" />
        <meta property="og:image" content="https://kcis-ecru.vercel.app/images/kcis%20logo.png" />
        <meta property="og:image:alt" content="KCIS 로고" />
        <meta property="og:locale" content="ko_KR" />
        {/* Twitter Card (Twitter/X 미리보기) */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="KCIS|장소관리시스템" />
        <meta name="twitter:description" content="장소예약·큐티·성경통독·주일예배·구역모임 교안을 한 곳에서." />
        <meta name="twitter:image" content="https://kcis-ecru.vercel.app/images/kcis%20logo.png" />
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

        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              {t('landing.eyebrow')}
            </span>
            <h1 className={styles.title}>
              {t('landing.tagline1')} {t('landing.tagline2')}<br />
              <span className={styles.titleAccent}>{t('landing.brand')}</span>
            </h1>
            <p className={styles.description}>
              {t('landing.description')}
            </p>

            <div className={styles.menuGrid}>
              <a className={styles.menuCard} style={{ gridColumn: '1 / -1' }} href="/reservations/grid" onClick={handleReservationClick}>
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z" />
                    <circle cx="12" cy="9" r="2.6" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>{t('landing.menuReservation')}</span>
              </a>
              <a className={styles.menuCard} href="/qt" onClick={handleProtectedClick('/qt')}>
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5z" />
                    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5A1.5 1.5 0 0 0 20 17.5z" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>{t('landing.menuQT')}</span>
              </a>
              <a className={styles.menuCard} href="/reading" onClick={handleProtectedClick('/reading')}>
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5V6a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2" />
                    <path d="M8 7h8M8 11h8M8 15h5" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>{t('landing.menuReading')}</span>
              </a>
              <a className={styles.menuCard} href="/sunday-worship" onClick={handleProtectedClick('/sunday-worship')}>
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5L12 15.8 7 18.2l1-5.5-4-3.9L9.5 8z" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>{t('landing.menuBulletin')}</span>
              </a>
              <a className={styles.menuCard} href="/cell-teaching" onClick={handleProtectedClick('/cell-teaching')}>
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>{t('landing.menuCellTeaching')}</span>
              </a>
            </div>

            <div className={styles.trustRow}>
              <div className={styles.trustItem}>
                <span className={styles.trustNumber}>{t('landing.trustLangs')}</span>
                <span className={styles.trustLabel}>{t('landing.trustLangsSub')}</span>
              </div>
              <div className={styles.trustItem}>
                <span className={styles.trustNumber}>{t('landing.trustMobile')}</span>
                <span className={styles.trustLabel}>{t('landing.trustMobileSub')}</span>
              </div>
              <div className={styles.trustItem}>
                <span className={styles.trustNumber}>{t('landing.trustSso')}</span>
                <span className={styles.trustLabel}>{t('landing.trustSsoSub')}</span>
              </div>
            </div>

          </div>

        </section>

        <footer style={{ margin: '1.5rem 0 0', padding: isMobile ? '1rem 0.75rem 2rem' : '1rem 1.25rem 1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-ink-2)', lineHeight: 1.8, borderTop: '1px solid var(--color-surface-border)' }}>
          <div style={{ marginBottom: '0.35rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>싱가폴한인교회</span>
            <span style={{ margin: '0 0.5rem', color: 'var(--color-gray)' }}>|</span>
            <a href="/privacy" style={{ color: 'var(--color-ink-2)', textDecoration: 'underline', display: 'inline-block', minHeight: 24 }}>개인정보처리방침</a>
          </div>
          <div>21 Gangsa Road Singapore 678973</div>
          <div>TEL <a href="tel:+6564686694" style={{ color: 'var(--color-ink-2)', display: 'inline-block', minHeight: 28, lineHeight: '28px' }}>+65-6468-6694</a></div>
          <div><a href="mailto:koreanchurch@live.com" style={{ color: 'var(--color-ink-2)', display: 'inline-block', minHeight: 28, lineHeight: '28px' }}>koreanchurch@live.com</a></div>
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
