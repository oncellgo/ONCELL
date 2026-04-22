import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import SubHeader from '../components/SubHeader';
import BiblePassageCard from '../components/BiblePassageCard';
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

// 현재 속한 주의 일요일 — 오늘이 일요일이면 오늘, 월~토이면 다음 주일.
// (월요일 이후부터 이미 그 주의 주보/구역예배지가 대상이 됨)
const mostRecentSunday = (now: Date): Date => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow !== 0) d.setDate(d.getDate() + (7 - dow));
  return d;
};

const CellTeachingPage = ({ videos, todayISO, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const isMobile = useIsMobile();
  useRequireLogin(profileId);
  const today = new Date(todayISO);
  const defaultSunday = mostRecentSunday(today);

  // 윈도우 오프셋 — 기본 0: 최근 4개 주일. ‹ / › 로 1주씩 이동.
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
    setSelectedKey((k) => { const d = new Date(k); d.setDate(d.getDate() - 7); return keyFor(d); });
  };
  const goNextWeek = () => {
    setWindowOffset((w) => w + 1);
    setSelectedKey((k) => { const d = new Date(k); d.setDate(d.getDate() + 7); return keyFor(d); });
  };

  // 선택된 주일의 영상 — SSR에서 이미 dateKey당 1개(2부 우선)로 정리됨
  const selectedVideo = useMemo(() => videos.find((v) => v.dateKey === selectedKey) || null, [videos, selectedKey]);

  // 구역예배지 (싱가폴한인교회 공지 게시판에서 매칭)
  type CellGuide = {
    found: boolean;
    title?: string;
    body?: string;
    attachmentName?: string | null;
    biblePassage?: string | null;
    normalizedRef?: string | null;
    sermonTitle?: string | null;
    idx?: string;
    bulletinIdx?: string | null;
    bulletinTitle?: string | null;
    pdfText?: string | null;
    bibleText?: string | null;
    bibleTextEn?: string | null;
    hymn?: { number: string; title: string | null } | null;
    questions?: string[];
    prayer?: Array<{ label: string; text: string }>;
  };
  const [guide, setGuide] = useState<CellGuide | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const guideCacheRef = useRef(new Map<string, CellGuide>());

  useEffect(() => {
    let cancelled = false;
    const cache = guideCacheRef.current.get(selectedKey);
    if (cache) { setGuide(cache); setGuideLoading(false); setGuideError(null); return; }
    setGuideLoading(true); setGuideError(null); setGuide(null);
    fetch(`/api/cell-worship?date=${selectedKey}`)
      .then((r) => r.json())
      .then((d: CellGuide) => { if (!cancelled) { guideCacheRef.current.set(selectedKey, d); setGuide(d); } })
      .catch(() => { if (!cancelled) setGuideError('구역예배지를 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setGuideLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKey]);

  // 백그라운드 prefetch — 현재 윈도우의 나머지 주일도 미리 가져와 전환 지연 최소화.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const schedule: (cb: () => void) => number =
      (window as any).requestIdleCallback?.bind(window) || ((cb: () => void) => window.setTimeout(cb, 300));
    const cancel: (id: number) => void =
      (window as any).cancelIdleCallback?.bind(window) || window.clearTimeout;
    const id = schedule(() => {
      recentSundays.forEach((key) => {
        if (key === selectedKey) return;
        if (guideCacheRef.current.has(key)) return;
        fetch(`/api/cell-worship?date=${key}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d) guideCacheRef.current.set(key, d); })
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
        <title>KCIS | 구역모임교안</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref} />

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: isMobile ? '1rem' : '1.25rem' }}>
        <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: isMobile ? '0.75rem' : '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>구역모임교안</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>KoreanChurchInSingapore</span>
          </div>

          {/* 최근 4개 주일 — 주 이동 네비 없음 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: isMobile ? '0.3rem' : '0.4rem' }}>
            {recentSundays.map((key) => {
              const d = new Date(key);
              const end = new Date(d); end.setDate(d.getDate() + 6);
              const rangeLabel = `${d.getMonth() + 1}/${d.getDate()}-${end.getMonth() + 1}/${end.getDate()}`;
              const isSelected = selectedKey === key;
              const isToday = key === todayKey;
              const weekOrd = Math.ceil(d.getDate() / 7);
              const weekLabel = ['첫째주','둘째주','셋째주','넷째주','다섯째주'][weekOrd - 1] || '주일';
              return (
                <button
                  key={key} type="button" onClick={() => setSelectedKey(key)}
                  aria-label={`${rangeLabel} ${weekLabel}`}
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
                  <span style={{ fontSize: isMobile ? '0.72rem' : '0.8rem', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {rangeLabel}
                  </span>
                  <span style={{ fontSize: isMobile ? '0.68rem' : '0.72rem', fontWeight: 700, color: '#DC2626', lineHeight: 1 }}>{weekLabel}</span>
                  {isToday && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#fff', background: '#20CD8D', padding: '0.08rem 0.4rem', borderRadius: 999, letterSpacing: '0.02em' }}>오늘</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 날짜 + 설교제목 + 성경구절 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.5rem' : '0.45rem', padding: isMobile ? '0.75rem 0.9rem' : '0.85rem 1.1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            {/* 날짜 + 유튜브 설교자 (보조 정보) */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? '0.82rem' : '0.88rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{selectedLabel}</span>
              {preacher && <span style={{ fontSize: isMobile ? '0.82rem' : '0.86rem', color: 'var(--color-ink-2)', fontWeight: 600 }}>{preacher}</span>}
            </div>
            {/* 구역예배지 설교제목 (강조) */}
            {guide?.found && guide.sermonTitle && (
              <div style={{ fontSize: isMobile ? '1rem' : '1.08rem', fontWeight: 800, color: '#3F6212', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
                {guide.sermonTitle}
              </div>
            )}
            {/* 유튜브 제목에서 추출한 설교제목 — 구역예배지 없을 때만 */}
            {(!guide?.found || !guide.sermonTitle) && sermonTitle && (
              <div style={{ fontSize: isMobile ? '1rem' : '1.08rem', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
                "{sermonTitle}"
              </div>
            )}
            {/* 성경참조 + PDF 버튼 */}
            {guide?.found && (guide.normalizedRef || guide.biblePassage) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: isMobile ? '0.86rem' : '0.9rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                  <span aria-hidden>📖</span>
                  <span>{guide.normalizedRef || guide.biblePassage}</span>
                </div>
                {guide.idx && (
                  <a
                    href={`/api/bulletin-file?idx=${encodeURIComponent(guide.idx)}&n=0`}
                    target="_blank" rel="noopener noreferrer"
                    aria-label="구역예배지 PDF 원문 열기"
                    style={{ padding: '0.45rem 0.9rem', borderRadius: 999, border: '1px solid #1E40AF', background: '#EFF6FF', color: '#1E40AF', fontSize: '0.84rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', minHeight: 40, whiteSpace: 'nowrap' }}
                  >
                    <span>📘</span><span>구역예배지 원문보기</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {guideLoading && (
            <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#F9FAFB', border: '1px dashed var(--color-gray)', fontSize: '0.88rem', color: 'var(--color-ink-2)' }}>구역예배지를 불러오는 중…</div>
          )}
          {!guideLoading && !guide?.found && (
            <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#F9FAFB', border: '1px dashed var(--color-gray)', fontSize: '0.88rem', color: 'var(--color-ink-2)' }}>{guideError || '이 주일의 구역예배지가 아직 등록되지 않았습니다.'}</div>
          )}

          {/* 카드 0: 찬송가 (말씀 카드와 동일한 스타일) */}
          {guide?.found && guide.hymn && (
            <section style={{ padding: isMobile ? '0.9rem' : '1.1rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#3F6212', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>♪</span><span>찬송가</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{guide.hymn.number}장{guide.hymn.title ? ` · ${guide.hymn.title}` : ''}</span>
              </h3>
            </section>
          )}

          {/* 말씀 본문 — design.md §2.3 Bible passage rule 준수 (BiblePassageCard) */}
          {guide?.found && (guide.bibleText || guide.bibleTextEn) && (
            <BiblePassageCard
              reference={guide.normalizedRef || guide.biblePassage || '말씀'}
              koText={guide.bibleText || null}
              enText={guide.bibleTextEn || null}
              source="koreanchurch.sg 구역예배지 PDF · 본문: 개역한글/KJV 공공영역"
            />
          )}

          {/* 카드 2: 내용 나눔 (질문) */}
          {guide?.found && guide.questions && guide.questions.length > 0 && (
            <section style={{ padding: isMobile ? '0.9rem' : '1.1rem', borderRadius: 16, background: '#fff', border: '1px solid #BFDBFE', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#1E40AF', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>💬</span><span>내용 나눔</span>
              </h3>
              <ol style={{ margin: 0, paddingLeft: '1.3rem', display: 'grid', gap: '0.65rem' }}>
                {guide.questions.map((q, i) => (
                  <li key={i} style={{ fontSize: '0.92rem', lineHeight: 1.75, color: 'var(--color-ink)' }}>
                    {q.replace(/^\d+\.\s*/, '')}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* 카드 3: 나눔 기도 */}
          {guide?.found && guide.prayer && guide.prayer.length > 0 && (
            <section style={{ padding: isMobile ? '0.9rem' : '1.1rem', borderRadius: 16, background: '#fff', border: '1px solid #FBBF24', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.7rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#92400E', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>🙏</span><span>나눔 기도</span>
              </h3>
              {guide.prayer.map((p, i) => (
                <div key={i} style={{ padding: '0.7rem 0.85rem', borderRadius: 8, background: '#FEF3C7', display: 'grid', gap: '0.35rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#92400E' }}>{p.label === '삶' ? '삶을 위한 기도' : p.label === '공동체' ? '공동체를 위한 기도' : p.label}</div>
                  <div style={{ fontSize: '0.92rem', lineHeight: 1.75, color: 'var(--color-ink)' }}>{p.text}</div>
                </div>
              ))}
            </section>
          )}
        </section>
      </main>
    </>
  );
};

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

export default CellTeachingPage;
