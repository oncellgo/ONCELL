import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SubHeader from '../components/SubHeader';
import BulletinLightbox from '../components/BulletinLightbox';
import { getSystemAdminHref } from '../lib/adminGuard';
import { getProfiles, getUsers } from '../lib/dataStore';
import { useIsMobile } from '../lib/useIsMobile';
import { useRequireLogin } from '../lib/useRequireLogin';
import { fetchPlaylistItemsWithFallback } from '../lib/youtube';

type Video = { videoId: string; title: string; publishedAt: string; dateKey: string };

type Props = {
  videos: Video[];
  todayISO: string;
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const keyFor = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 가장 최근의 지난 주일 — 오늘이 일요일이면 오늘, 그 외에는 직전 주일.
// 자료는 보통 목~토에 업로드되므로 주 초반 접속 시 '다음 주일'을 기본으로 두면
// 아직 없는 자료를 가리켜 빈 화면이 됨. 확정된 가장 최근 주일을 기본 선택.
const mostRecentSunday = (now: Date): Date => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow !== 0) d.setDate(d.getDate() - dow);
  return d;
};

const SundayWorshipPage = ({ videos, todayISO, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  useRequireLogin(profileId);
  const today = new Date(todayISO);
  const defaultSunday = mostRecentSunday(today);

  // 윈도우 오프셋 — 기본 0: 최근 4개 주일(가장 오른쪽이 가장 최근 주일). ‹ / › 로 1주씩 이동.
  const [windowOffset, setWindowOffset] = useState<number>(0);
  const recentSundays = useMemo(() => {
    const list: string[] = [];
    const base = new Date(defaultSunday);
    base.setDate(base.getDate() + windowOffset * 7);
    for (let i = 3; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i * 7);
      list.push(keyFor(d));
    }
    return list;
  }, [defaultSunday, windowOffset]);

  const [selectedKey, setSelectedKey] = useState<string>(keyFor(defaultSunday));

  const goPrevWeek = () => {
    setWindowOffset((w) => w - 1);
    // 선택된 주일도 1주 뒤로 이동 (윈도우 밖으로 나가지 않게)
    setSelectedKey((k) => {
      const d = new Date(k);
      d.setDate(d.getDate() - 7);
      return keyFor(d);
    });
  };
  const goNextWeek = () => {
    setWindowOffset((w) => w + 1);
    setSelectedKey((k) => {
      const d = new Date(k);
      d.setDate(d.getDate() + 7);
      return keyFor(d);
    });
  };

  // 선택된 주일의 영상 — SSR에서 이미 dateKey당 1개(2부 우선)로 정리됨
  const selectedVideo = useMemo(() => videos.find((v) => v.dateKey === selectedKey) || null, [videos, selectedKey]);

  // 주일 주보 (싱가폴한인교회 공지 게시판의 "YYYY년 M월 D일 주보" 게시글)
  // 서버에서 첨부 파일 목록과 misbaUrl 까지 함께 내려 주므로 추가 fetch 불필요.
  type BulletinFile = { n: number; name: string | null; mime: string };
  type SundayBulletin = {
    found: boolean;
    bulletinIdx?: string | null;
    bulletinTitle?: string | null;
    reference?: string | null;
    bibleText?: string | null;
    bibleTextEn?: string | null;
    files?: BulletinFile[];
    misbaUrl?: string | null;
    reason?: string;
  };
  const [bulletin, setBulletin] = useState<SundayBulletin | null>(null);
  const [bulletinLookupLoading, setBulletinLookupLoading] = useState(false);
  const [bulletinLookupError, setBulletinLookupError] = useState<string | null>(null);

  const bulletinFiles: BulletinFile[] = bulletin?.files || [];
  const bulletinFilesError: string | null = null;
  const bulletinFilesLoading = bulletinLookupLoading;
  const misbaUrl: string | null = bulletin?.misbaUrl || null;

  // 라이트박스 (주보 이미지 확대 뷰어)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 응답 캐시 (같은 세션 내 같은 주일 재선택 시 즉시 표시)
  const bulletinCacheRef = useRef(new Map<string, SundayBulletin>());

  useEffect(() => {
    let cancelled = false;
    const cache = bulletinCacheRef.current.get(selectedKey);
    if (cache) {
      setBulletin(cache); setBulletinLookupLoading(false); setBulletinLookupError(null);
      return;
    }
    setBulletinLookupLoading(true); setBulletinLookupError(null); setBulletin(null);
    fetch(`/api/sunday-bulletin?date=${selectedKey}`)
      .then((r) => r.json())
      .then((d: SundayBulletin) => {
        if (cancelled) return;
        bulletinCacheRef.current.set(selectedKey, d);
        setBulletin(d);
      })
      .catch(() => { if (!cancelled) setBulletinLookupError('주보 정보를 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setBulletinLookupLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKey]);

  // 현재 보고 있는 윈도우(최근 4개 주일)를 백그라운드 prefetch — 주일 전환이 즉시 반응.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const schedule: (cb: () => void) => number =
      (window as any).requestIdleCallback?.bind(window) || ((cb: () => void) => window.setTimeout(cb, 300));
    const cancel: (id: number) => void =
      (window as any).cancelIdleCallback?.bind(window) || window.clearTimeout;
    const id = schedule(() => {
      recentSundays.forEach((key) => {
        if (key === selectedKey) return;
        if (bulletinCacheRef.current.has(key)) return;
        fetch(`/api/sunday-bulletin?date=${key}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d) bulletinCacheRef.current.set(key, d); })
          .catch(() => {});
      });
    });
    return () => { try { cancel(id); } catch {} };
  }, [recentSundays, selectedKey]);

  const selected = new Date(selectedKey);
  const selectedLabel = `${selected.getFullYear()}.${pad(selected.getMonth() + 1)}.${pad(selected.getDate())} (주일)`;
  // 영상 제목에서 설교제목 + 설교자 추출
  // 예: '싱가폴한인교회 - 주일2부예배 - "왜 울고 있습니까?" - 고형석 목사 - 2026.04.05.'
  const { sermonTitle, preacher } = (() => {
    const t = selectedVideo?.title || '';
    if (!t) return { sermonTitle: '', preacher: '' };
    const titleMatch = t.match(/[“"']([^”"']+)[”"']/);
    const sermonTitle = titleMatch ? titleMatch[1].trim() : '';
    // 대시(-)로 분리 후 '목사/전도사/장로/교역자' 포함 세그먼트 찾기
    const segs = t.split(/\s*-\s*/).map((s) => s.trim());
    const preacher = segs.find((s) => /(목사|전도사|장로|교역자|사모)/.test(s)) || '';
    return { sermonTitle, preacher };
  })();
  const todayKey = keyFor(today);

  return (
    <>
      <Head>
        <title>KCIS | 주보</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref} />

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: isMobile ? '1rem' : '1.25rem' }}>
        <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: isMobile ? '0.75rem' : '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>{t('menu.bulletin')}</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>KoreanChurchInSingapore</span>
          </div>

          {/* 최근 4개 주일 — 주 이동 네비 없음 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: isMobile ? '0.3rem' : '0.4rem' }}>
            {recentSundays.map((key) => {
              const d = new Date(key);
              const isSelected = selectedKey === key;
              const isToday = key === todayKey;
              const weekOrd = Math.ceil(d.getDate() / 7);
              const weekLabel = ['첫째주','둘째주','셋째주','넷째주','다섯째주'][weekOrd - 1] || '주일';
              return (
                <button
                  key={key} type="button" onClick={() => setSelectedKey(key)}
                  aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 ${weekLabel}`}
                  aria-pressed={isSelected}
                  style={{
                    padding: isMobile ? '0.45rem 0.2rem' : '0.4rem 0.3rem',
                    border: isSelected ? '2px solid #20CD8D' : isToday ? '1.5px solid #D9F09E' : '1px solid var(--color-gray)',
                    borderRadius: 8,
                    background: isSelected ? '#F0FDF9' : isToday ? '#ECFCCB' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: isSelected ? '0 2px 6px rgba(32,205,141,0.2)' : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: '0.2rem',
                    minHeight: isMobile ? 56 : 52, minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: isMobile ? '0.78rem' : '0.84rem', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>
                    {d.getMonth() + 1}/{d.getDate()}
                  </span>
                  <span style={{ fontSize: isMobile ? '0.68rem' : '0.72rem', fontWeight: 700, color: '#DC2626', lineHeight: 1 }}>{weekLabel}</span>
                  {isToday && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#fff', background: '#20CD8D', padding: '0.08rem 0.4rem', borderRadius: 999, letterSpacing: '0.02em' }}>오늘</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 날짜 + 설교제목 + 설교자 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.5rem' : '0.4rem', padding: isMobile ? '0.75rem 0.9rem' : '0.85rem 1.1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            <span style={{ fontSize: isMobile ? '0.82rem' : '0.88rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{selectedLabel}</span>
            {sermonTitle && (
              <span style={{ fontSize: isMobile ? '1rem' : '1.08rem', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1.35 }}>"{sermonTitle}"</span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              {preacher && <span style={{ fontSize: isMobile ? '0.84rem' : '0.88rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>{preacher}</span>}
              {misbaUrl && (
                <a
                  href={misbaUrl}
                  target="_blank" rel="noopener noreferrer"
                  aria-label="미스바 파일 바로 열기"
                  style={{ padding: '0.45rem 0.85rem', borderRadius: 999, border: '1px solid #1E40AF', background: '#EFF6FF', color: '#1E40AF', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', minHeight: 40 }}
                >
                  <span>📘</span><span>{t('page.bulletin.misbaOpen')}</span>
                </a>
              )}
            </div>
          </div>

          {/* 주보 이미지 — 토글 없이 곧바로 표시. 클릭하면 라이트박스로 확대. */}
          {bulletin?.bulletinIdx && (
            bulletinFilesLoading ? (
              <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#F9FAFB', border: '1px dashed var(--color-gray)', fontSize: '0.88rem', color: 'var(--color-ink-2)' }}>주보를 불러오는 중…</div>
            ) : bulletinFilesError ? (
              <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#FEF2F2', border: '1px solid #FCA5A5', fontSize: '0.88rem', color: '#B91C1C' }}>{bulletinFilesError}</div>
            ) : bulletinFiles.length === 0 ? null : (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {bulletinFiles.map((f, imgIdx) => {
                  const src = `/api/bulletin-file?idx=${encodeURIComponent(bulletin.bulletinIdx!)}&n=${f.n}`;
                  if (f.mime.startsWith('image/')) {
                    return (
                      <button
                        key={f.n} type="button" onClick={() => setLightboxIndex(imgIdx)}
                        title="클릭하여 크게 보기"
                        style={{ position: 'relative', padding: 0, border: '1px solid var(--color-surface-border)', borderRadius: 12, background: '#fff', cursor: 'zoom-in', display: 'block', width: '100%' }}
                      >
                        <img
                          src={src} alt={f.name || `주보 ${f.n + 1}`}
                          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }}
                        />
                        <span style={{ position: 'absolute', right: 8, bottom: 8, padding: '0.25rem 0.55rem', borderRadius: 999, background: 'rgba(17,24,39,0.72)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          🔍 크게 보기
                        </span>
                      </button>
                    );
                  }
                  if (f.mime === 'application/pdf') {
                    return (
                      <iframe
                        key={f.n} src={src} title={f.name || `주보 ${f.n + 1}`}
                        style={{ width: '100%', height: isMobile ? 520 : 720, borderRadius: 12, border: '1px solid var(--color-surface-border)', background: '#fff' }}
                      />
                    );
                  }
                  return (
                    <a key={f.n} href={src} target="_blank" rel="noopener noreferrer"
                      style={{ padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid var(--color-surface-border)', background: '#fff', color: 'var(--color-ink)', fontSize: '0.88rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minHeight: 44 }}>
                      📎 {f.name || `첨부 ${f.n + 1}`} 다운로드
                    </a>
                  );
                })}
              </div>
            )
          )}

          {bulletinLookupLoading && (
            <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#F9FAFB', border: '1px dashed var(--color-gray)', fontSize: '0.88rem', color: 'var(--color-ink-2)' }}>주보를 확인하는 중…</div>
          )}
          {!bulletinLookupLoading && !bulletin?.found && (
            <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#F9FAFB', border: '1px dashed var(--color-gray)', fontSize: '0.88rem', color: 'var(--color-ink-2)' }}>{bulletinLookupError || '이 주일의 주보가 아직 등록되지 않았습니다.'}</div>
          )}
        </section>
      </main>

      {lightboxIndex !== null && bulletin?.bulletinIdx && (() => {
        const imgs = bulletinFiles
          .filter((f) => f.mime.startsWith('image/'))
          .map((f) => ({
            src: `/api/bulletin-file?idx=${encodeURIComponent(bulletin.bulletinIdx!)}&n=${f.n}`,
            alt: f.name || `주보 ${f.n + 1}`,
          }));
        if (imgs.length === 0) return null;
        return (
          <BulletinLightbox
            images={imgs}
            initialIndex={lightboxIndex}
            title={bulletin.bulletinTitle || '주보'}
            onClose={() => setLightboxIndex(null)}
          />
        );
      })()}
    </>
  );
};

// "주일예배 - 싱가폴한인교회" 플레이리스트 — 최근 주일1부/2부/3부예배 모음
// 채널 기본 업로드는 50개 제한에 새벽기도회 매일 업로드로 주일예배가 밀려나므로 전용 플레이리스트를 사용
const SUNDAY_SERVICE_PLAYLIST_ID = 'PLSCiGfh6aK3T0eD4sx5mGkSlg1MZ-Egcn';

const fetchSundayServicePlaylist = async (): Promise<Array<{ videoId: string; title: string; dateKey: string | null }>> => {
  const { items } = await fetchPlaylistItemsWithFallback(SUNDAY_SERVICE_PLAYLIST_ID, 50);
  return items.map((v) => {
    const dm = v.title.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?/);
    const dateKey = dm ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}` : null;
    return { videoId: v.videoId, title: v.title, dateKey };
  });
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  // 주일예배 플레이리스트 RSS — 최근 주일 1부/2부 예배 영상 묶음
  const playlist = await fetchSundayServicePlaylist();
  // '주일1부예배' 또는 '주일2부예배'만 필터 (3부·특송·봉헌 제외)
  const isSundayService = (t: string) => /주일\s*[12]\s*부\s*예배/.test(t);
  const is2bu = (t: string) => /주일\s*2\s*부\s*예배/.test(t);
  // 제목에서 추출한 날짜가 일요일인 것만 유지
  const filtered = playlist.filter((v) => {
    if (!v.dateKey) return false;
    if (!isSundayService(v.title)) return false;
    return new Date(v.dateKey + 'T00:00:00').getDay() === 0;
  });
  // 같은 dateKey에 1부/2부 모두 있으면 2부 우선
  const byDate = new Map<string, Video>();
  for (const v of filtered) {
    const row: Video = { videoId: v.videoId, title: v.title, publishedAt: '', dateKey: v.dateKey! };
    const cur = byDate.get(row.dateKey);
    if (!cur) { byDate.set(row.dateKey, row); continue; }
    const vIs2 = is2bu(v.title);
    const curIs2 = is2bu(cur.title);
    if (vIs2 && !curIs2) byDate.set(row.dateKey, row);
  }
  const videos: Video[] = Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));

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
      videos,
      todayISO: new Date().toISOString(),
      profileId,
      displayName,
      nickname,
      email,
      systemAdminHref,
    },
  };
};

export default SundayWorshipPage;
