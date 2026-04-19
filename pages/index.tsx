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
    router.push('/reservation');
  };

  return (
    <>
      <Head>
        <title>Steward+AI. — 교회 공동체 관리 플랫폼</title>
        <meta
          name="description"
          content="소모임·일정·양육·큐티·재정을 하나로. 교회 공동체를 위한 전문 AI 관리 플랫폼 Steward+AI."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
              <span style={{ whiteSpace: 'nowrap' }}>{t('landing.tagline1')}</span> <span style={{ whiteSpace: 'nowrap' }}>{t('landing.tagline2')}</span><br />
              <span className={styles.titleAccent}>{t('landing.brand')}</span>
            </h1>
            <p className={styles.description}>
              {t('landing.description')}
            </p>

            <div className={styles.menuGrid}>
              <a className={styles.menuCard} href="#">
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3h10l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                    <path d="M15 3v4h4" />
                    <path d="M8 12h8M8 16h6" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>주보</span>
              </a>
              <a className={styles.menuCard} href="#">
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>모임교안</span>
              </a>
              <a className={styles.menuCard} href="/reservation" onClick={handleReservationClick}>
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z" />
                    <circle cx="12" cy="9" r="2.6" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>장소예약</span>
              </a>
              <a className={styles.menuCard} href="/schedule">
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
                    <path d="M3.5 10h17" />
                    <path d="M8 3v4M16 3v4" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>교회일정</span>
              </a>
              <a className={styles.menuCard} href="/qt">
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5z" />
                    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5A1.5 1.5 0 0 0 20 17.5z" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>오늘의 큐티</span>
              </a>
              <a className={styles.menuCard} href="/bible">
                <span className={styles.menuIcon} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a2 2 0 0 1 2 2v14a1.5 1.5 0 0 1-1.5 1.5H6a2 2 0 0 1-2-2z" />
                    <path d="M8 3v15" />
                    <path d="M11 8h5M11 11h5M11 14h3" />
                  </svg>
                </span>
                <span className={styles.menuLabel}>오늘의 성경통독</span>
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

          <div className={styles.heroVisual}>
            <div className={styles.dashboardCard}>
              <div className={styles.dashboardHeader}>
                <span className={styles.dashboardTitle}>{t('landing.weeklyTitle')}</span>
                <span className={styles.dashboardBadge}>{t('landing.live')}</span>
              </div>
              <div className={styles.dashboardList}>
                <div className={styles.dashboardRow}>
                  <div className={styles.dashboardRowInner}>
                    <span className={styles.dashboardRowDot} style={{ background: '#20CD8D' }} />
                    <span className={styles.dashboardRowLabel}>{t('landing.sundayWorship')}</span>
                  </div>
                  <span className={styles.dashboardRowMeta}>{t('landing.sundayWorshipMeta')}</span>
                </div>
                <div className={styles.dashboardRow}>
                  <div className={styles.dashboardRowInner}>
                    <span className={styles.dashboardRowDot} style={{ background: '#2D4048' }} />
                    <span className={styles.dashboardRowLabel}>{t('landing.cellMeeting')}</span>
                  </div>
                  <span className={styles.dashboardRowMeta}>{t('landing.cellMeetingMeta')}</span>
                </div>
                <div className={styles.dashboardRow}>
                  <div className={styles.dashboardRowInner}>
                    <span className={styles.dashboardRowDot} style={{ background: '#20CD8D' }} />
                    <span className={styles.dashboardRowLabel}>{t('landing.discipleship')}</span>
                  </div>
                  <span className={styles.dashboardRowMeta}>{t('landing.discipleshipMeta')}</span>
                </div>
                <div className={styles.dashboardRow}>
                  <div className={styles.dashboardRowInner}>
                    <span className={styles.dashboardRowDot} style={{ background: '#182527' }} />
                    <span className={styles.dashboardRowLabel}>{t('landing.biblePlan')}</span>
                  </div>
                  <span className={styles.dashboardRowMeta}>{t('landing.bibleDay')}</span>
                </div>
              </div>
            </div>

            <div className={`${styles.floatCard} ${styles.floatCardTop}`}>
              <span className={styles.floatCardIcon} style={{ background: '#CCF4E5', color: '#20CD8D' }}>✓</span>
              {t('landing.attendance')}
            </div>
            <div className={`${styles.floatCard} ${styles.floatCardBottom}`}>
              <span className={styles.floatCardIcon} style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold-deep)' }}>📖</span>
              {t('landing.qtStreak')}
            </div>
          </div>
        </section>

        <section id="features" className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>{t('landing.featuresEyebrow')}</p>
            <h2 className={styles.sectionTitle}>{t('landing.featuresTitle')}</h2>
            <p className={styles.sectionDescription}>
              {t('landing.featuresDescription')}
            </p>
          </div>

          <div className={styles.features}>
            {featureKeys.map((n, i) => (
              <article key={n} className={styles.featureCard}>
                <span className={styles.featureIcon}>{featureIcons[i]}</span>
                <h3>{t(`landing.feat${n}Title`)}</h3>
                <p>{t(`landing.feat${n}Desc`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className={styles.ctaSection}>
          <div className={styles.ctaCard}>
            <h2 className={styles.ctaTitle}>{t('landing.ctaTitle')}</h2>
            <p className={styles.ctaDescription}>
              {t('landing.ctaDescription')}
            </p>
            <div className={styles.ctaActions}>
              {!loggedIn && (
                <a href="/auth/login" className={styles.ctaButton}>{t('landing.ctaFree')}</a>
              )}
              <a href="mailto:hello@stewardplusai.app" className={styles.ctaButtonGhost}>{t('landing.ctaInquiry')}</a>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>© {new Date().getFullYear()} Steward+AI. All rights reserved.</span>
          <div className={styles.footerLinks}>
            <a href="#">{t('landing.footerTerms')}</a>
            <a href="#">{t('landing.footerPrivacy')}</a>
            <a href="mailto:hello@stewardplusai.app">{t('landing.footerContact')}</a>
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
            else if (d?.status === 'approved' || d?.status === null) router.push('/reservation');
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
