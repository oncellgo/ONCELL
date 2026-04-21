import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import SubHeader from '../components/SubHeader';
import BulletinLightbox from '../components/BulletinLightbox';
import { getSystemAdminHref } from '../lib/adminGuard';
import { getProfiles, getUsers } from '../lib/dataStore';
import { useIsMobile } from '../lib/useIsMobile';
import { useRequireLogin } from '../lib/useRequireLogin';

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

// 현재 속한 주의 일요일 — 오늘이 일요일이면 오늘, 월~토이면 다음 주일.
// (월요일 이후부터 이미 그 주의 주보/구역예배지가 대상이 됨)
const mostRecentSunday = (now: Date): Date => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow !== 0) d.setDate(d.getDate() + (7 - dow));
  return d;
};

const SundayWorshipPage = ({ videos, todayISO, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
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
  type SundayBulletin = {
    found: boolean;
    bulletinIdx?: string | null;
    bulletinTitle?: string | null;
    reference?: string | null;
    bibleText?: string | null;
    bibleTextEn?: string | null;
    reason?: string;
  };
  const [bulletin, setBulletin] = useState<SundayBulletin | null>(null);
  const [bulletinLookupLoading, setBulletinLookupLoading] = useState(false);
  const [bulletinLookupError, setBulletinLookupError] = useState<string | null>(null);

  // 주보 이미지·파일
  const [bulletinFiles, setBulletinFiles] = useState<Array<{ n: number; name: string | null; mime: string }>>([]);
  const [bulletinFilesLoading, setBulletinFilesLoading] = useState(false);
  const [bulletinFilesError, setBulletinFilesError] = useState<string | null>(null);
  const [misbaUrl, setMisbaUrl] = useState<string | null>(null);

  // 라이트박스 (주보 이미지 확대 뷰어)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBulletinLookupLoading(true); setBulletinLookupError(null); setBulletin(null);
    setBulletinFiles([]); setBulletinFilesError(null);
    fetch(`/api/sunday-bulletin?date=${selectedKey}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setBulletin(d); })
      .catch(() => { if (!cancelled) setBulletinLookupError('주보 정보를 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setBulletinLookupLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKey]);

  // 주보가 확인되면 첨부 파일 목록도 자동으로 가져온다 (토글 없이 곧바로 노출).
  useEffect(() => {
    if (!bulletin?.bulletinIdx) return;
    let cancelled = false;
    setBulletinFilesLoading(true); setBulletinFilesError(null);
    fetch(`/api/bulletin-file?idx=${encodeURIComponent(bulletin.bulletinIdx)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setBulletinFiles(Array.isArray(d?.files) ? d.files : []); setMisbaUrl(typeof d?.misbaUrl === 'string' ? d.misbaUrl : null); } })
      .catch(() => { if (!cancelled) setBulletinFilesError('주보 첨부를 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setBulletinFilesLoading(false); });
    return () => { cancelled = true; };
  }, [bulletin?.bulletinIdx]);

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
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>주보</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>KoreanChurchInSingapore</span>
          </div>

          {/* 최근 4개 주일 — 주 이동 네비 없음 */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: isMobile ? '0.2rem' : '0.3rem' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: isMobile ? '0.15rem' : '0.25rem' }}>
              {recentSundays.map((key) => {
                const d = new Date(key);
                const isSelected = selectedKey === key;
                const isToday = key === todayKey;
                return (
                  <button
                    key={key} type="button" onClick={() => setSelectedKey(key)}
                    style={{
                      padding: isMobile ? '0.25rem 0.05rem' : '0.3rem 0.2rem',
                      border: isSelected ? '2px solid #20CD8D' : isToday ? '1.5px solid #D9F09E' : '1px solid var(--color-gray)',
                      borderRadius: 8,
                      background: isToday ? '#ECFCCB' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: isSelected ? '0 2px 6px rgba(32,205,141,0.2)' : 'none',
                      display: 'grid', gap: isMobile ? '0.1rem' : '0.15rem',
                      minHeight: isMobile ? 44 : 48, minWidth: 0, position: 'relative', overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: isMobile ? '0.05rem' : '0.2rem', lineHeight: 1 }}>
                      <span style={{ fontSize: isMobile ? '0.7rem' : '0.82rem', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>
                        {d.getMonth() + 1}/{d.getDate()}
                      </span>
                      <span style={{ fontSize: isMobile ? '0.58rem' : '0.64rem', fontWeight: 700, color: '#DC2626', lineHeight: 1 }}>{(() => { const o = Math.ceil(d.getDate() / 7); return ['첫째주','둘째주','셋째주','넷째주','다섯째주'][o - 1] || '주일'; })()}</span>
                    </div>
                    {isToday && (
                      <span style={{ fontSize: isMobile ? '0.55rem' : '0.6rem', fontWeight: 800, color: '#fff', background: '#20CD8D', padding: '0.05rem 0.35rem', borderRadius: 999, letterSpacing: '0.02em', justifySelf: 'center' }}>오늘</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 날짜 + 설교제목 + 성경구절 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: isMobile ? '0.7rem 0.85rem' : '0.85rem 1.1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? '0.88rem' : '0.98rem', fontWeight: 800, color: 'var(--color-ink)' }}>{selectedLabel}</span>
              {sermonTitle && <span style={{ fontSize: isMobile ? '0.88rem' : '0.98rem', fontWeight: 700, color: 'var(--color-ink)' }}>· "{sermonTitle}"</span>}
              {preacher && <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>/ {preacher}</span>}
              {misbaUrl && (
                <a
                  href={misbaUrl}
                  target="_blank" rel="noopener noreferrer"
                  title="미스바 파일 바로 열기"
                  style={{ marginLeft: 'auto', padding: '0.3rem 0.7rem', borderRadius: 999, border: '1px solid #1E40AF', background: '#EFF6FF', color: '#1E40AF', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <span>📘</span><span>미스바 보기</span>
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
                        style={{ width: '100%', height: isMobile ? 480 : 720, borderRadius: 12, border: '1px solid var(--color-surface-border)', background: '#fff' }}
                      />
                    );
                  }
                  return (
                    <a key={f.n} href={src} target="_blank" rel="noopener noreferrer"
                      style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-surface-border)', background: '#fff', color: 'var(--color-ink)', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>
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

const CHANNEL_HANDLE = 'KoreanChurchInSingapore';
let cachedChannelId: string | null = null;
let cachedChannelIdAt = 0;
const resolveChannelId = async (): Promise<string | null> => {
  const now = Date.now();
  if (cachedChannelId && now - cachedChannelIdAt < 24 * 60 * 60 * 1000) return cachedChannelId;
  try {
    const res = await fetch(`https://www.youtube.com/@${CHANNEL_HANDLE}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const m = html.match(/"channelId":"(UC[^"]+)"/) || html.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (m) { cachedChannelId = m[1]; cachedChannelIdAt = now; return cachedChannelId; }
  } catch {}
  return null;
};

let cachedVideos: Array<{ videoId: string; title: string; publishedAt: string }> = [];
let cachedVideosAt = 0;
const fetchChannelVideos = async (channelId: string) => {
  const now = Date.now();
  if (cachedVideos.length > 0 && now - cachedVideosAt < 30 * 60 * 1000) return cachedVideos;
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await res.text();
    const entries: Array<{ videoId: string; title: string; publishedAt: string }> = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;
    while ((match = entryRegex.exec(xml)) !== null) {
      const body = match[1];
      const videoId = (body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
      const title = (body.match(/<title>([^<]+)<\/title>/) || [])[1];
      const published = (body.match(/<published>([^<]+)<\/published>/) || [])[1];
      if (videoId && title && published) entries.push({ videoId, title, publishedAt: published });
    }
    cachedVideos = entries;
    cachedVideosAt = now;
    return entries;
  } catch { return []; }
};

// "주일예배 - 싱가폴한인교회" 플레이리스트 RSS — 최근 주일1부/2부/3부예배 모음
// 채널 기본 RSS는 15개 제한에 새벽기도회 매일 업로드로 주일예배가 밀려나므로 플레이리스트 RSS를 사용
const SUNDAY_SERVICE_PLAYLIST_ID = 'PLSCiGfh6aK3T0eD4sx5mGkSlg1MZ-Egcn';
let cachedPlaylistVideos: Array<{ videoId: string; title: string; dateKey: string | null }> = [];
let cachedPlaylistVideosAt = 0;

const fetchSundayServicePlaylist = async (): Promise<Array<{ videoId: string; title: string; dateKey: string | null }>> => {
  const now = Date.now();
  if (cachedPlaylistVideos.length > 0 && now - cachedPlaylistVideosAt < 30 * 60 * 1000) return cachedPlaylistVideos;
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${SUNDAY_SERVICE_PLAYLIST_ID}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await res.text();
    const out: Array<{ videoId: string; title: string; dateKey: string | null }> = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;
    while ((match = entryRegex.exec(xml)) !== null) {
      const body = match[1];
      const videoId = (body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
      const rawTitle = (body.match(/<title>([^<]+)<\/title>/) || [])[1];
      if (!videoId || !rawTitle) continue;
      // HTML entity 디코딩 (&quot; &amp; 등)
      const title = rawTitle
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      // 제목에서 날짜 추출: "... 2026.04.05." 패턴
      const dm = title.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?/);
      const dateKey = dm ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}` : null;
      out.push({ videoId, title, dateKey });
    }
    cachedPlaylistVideos = out;
    cachedPlaylistVideosAt = now;
    return out;
  } catch { return []; }
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
