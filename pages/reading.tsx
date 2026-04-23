import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SubHeader from '../components/SubHeader';
import BiblePassageCard from '../components/BiblePassageCard';
import { getSystemAdminHref } from '../lib/adminGuard';
import { getProfiles, getUsers } from '../lib/dataStore';
import { useIsMobile } from '../lib/useIsMobile';
import { useRequireLogin } from '../lib/useRequireLogin';
import { planForDate, formatRange, dateKey as keyFor } from '../lib/readingPlan';

type Props = {
  todayISO: string;
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const ReadingPage = ({ todayISO, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const router = useRouter();
  // SSR 프롭에 profileId 가 없으면 localStorage에서 복구 — MenuBar 링크가 authQs 없이 이동했을 때도 동작.
  const [effProfileId, setEffProfileId] = useState<string | null>(profileId);
  useEffect(() => {
    if (profileId) { setEffProfileId(profileId); return; }
    try {
      const p = window.localStorage.getItem('kcisProfileId');
      if (p) setEffProfileId(p);
    } catch {}
  }, [profileId]);
  useRequireLogin(effProfileId);
  const today = new Date(todayISO);
  const todayDow = today.getDay();

  // 주일(일요일) 기준 주 시작
  const weekStart = useMemo(() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(today.getDate() - todayDow);
    return d;
  }, [todayISO]);

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDow, setSelectedDow] = useState<number>(todayDow);

  // ?date=YYYY-MM-DD 쿼리 파라미터로 특정 날짜 직접 진입 (대시보드 요일 pill 에서 링크)
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.date;
    const dateStr = typeof q === 'string' ? q : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    const target = new Date(`${dateStr}T00:00:00`);
    if (isNaN(target.getTime())) return;
    // week offset: (target 주 시작) - (현재 weekStart) 의 일 차이 / 7
    const targetWeekStart = new Date(target);
    targetWeekStart.setHours(0, 0, 0, 0);
    targetWeekStart.setDate(target.getDate() - target.getDay());
    const diffDays = Math.round((targetWeekStart.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    setWeekOffset(Math.round(diffDays / 7));
    setSelectedDow(target.getDay());
  }, [router.isReady, router.query.date, weekStart]);

  const dateForDow = (dow: number): Date => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + dow + weekOffset * 7);
    return d;
  };

  const selectedDate = dateForDow(selectedDow);
  const selectedKey = keyFor(selectedDate);
  const todayKey = keyFor(today);
  const reading = useMemo(() => planForDate(selectedDate), [selectedKey]);

  // 선택된 날짜의 각 범위별 성경 본문 (한글·KJV 양쪽 동시 로드)
  const [passageTexts, setPassageTexts] = useState<Record<string, { ko: string; en: string }>>({});
  const [passageLoading, setPassageLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPassageLoading(true);
    setPassageTexts({});
    Promise.all(reading.map(async (r) => {
      const ref = r.startCh === r.endCh ? `${r.book} ${r.startCh}장` : `${r.book} ${r.startCh}-${r.endCh}장`;
      try {
        const res = await fetch(`/api/bible-text?ref=${encodeURIComponent(ref)}&lang=both`);
        if (!res.ok) return [ref, { ko: '', en: '' }] as const;
        const d = await res.json();
        return [ref, { ko: d?.ko?.text || '', en: d?.en?.text || '' }] as const;
      } catch { return [ref, { ko: '', en: '' }] as const; }
    })).then((pairs) => {
      if (cancelled) return;
      const map: Record<string, { ko: string; en: string }> = {};
      for (const [k, v] of pairs) map[k] = v;
      setPassageTexts(map);
    }).finally(() => { if (!cancelled) setPassageLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKey]);

  // 완료 기록 — 현재 주 범위로 조회
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const loadCompletions = async () => {
    if (!effProfileId) return;
    try {
      const from = keyFor(dateForDow(0));
      const to = keyFor(dateForDow(6));
      const r = await fetch(`/api/completions?profileId=${encodeURIComponent(effProfileId)}&type=reading&from=${from}&to=${to}`);
      if (!r.ok) return;
      const d = await r.json();
      setCompletedSet(new Set(Array.isArray(d?.dates) ? d.dates : []));
    } catch {}
  };
  useEffect(() => { loadCompletions(); /* eslint-disable-next-line */ }, [effProfileId, weekOffset]);

  const isCompleted = completedSet.has(selectedKey);
  const canToggle = true; // 과거·오늘·미래 모두 완료 처리 가능 (catch-up 허용)

  const toggleComplete = async () => {
    if (!effProfileId) { setToggleError('로그인이 필요합니다.'); return; }
    if (busy) return;
    setBusy(true); setToggleError(null);
    try {
      if (isCompleted) {
        const r = await fetch(`/api/completions?profileId=${encodeURIComponent(effProfileId)}&type=reading&date=${selectedKey}`, { method: 'DELETE' });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setToggleError(d?.error || `삭제 실패 (${r.status})`);
          return;
        }
        setCompletedSet((prev) => { const n = new Set(prev); n.delete(selectedKey); return n; });
      } else {
        const r = await fetch('/api/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: effProfileId, type: 'reading', date: selectedKey, allowPast: true }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setToggleError(d?.error || `저장 실패 (${r.status})`);
          return;
        }
        setCompletedSet((prev) => new Set(prev).add(selectedKey));
      }
    } catch (e: any) {
      setToggleError(e?.message || '네트워크 오류');
    } finally {
      setBusy(false);
    }
  };

  const goPrev = () => {
    if (selectedDow > 0) setSelectedDow(selectedDow - 1);
    else { setWeekOffset(weekOffset - 1); setSelectedDow(6); }
  };
  const goNext = () => {
    if (selectedDow < 6) setSelectedDow(selectedDow + 1);
    else { setWeekOffset(weekOffset + 1); setSelectedDow(0); }
  };

  return (
    <>
      <Head>
        <title>KCIS | 성경통독</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref} />

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: isMobile ? '1rem' : '1.25rem' }}>
        <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: isMobile ? '0.75rem' : '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>{t('menu.reading')}</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>1년 1독 · 약 3장/일</span>
          </div>

          {/* 7일 캘린더 — QT와 동일한 디자인 */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: isMobile ? '0.2rem' : '0.3rem' }}>
            <button
              type="button" onClick={goPrev} aria-label="이전 날짜"
              style={{ padding: isMobile ? '0 0.4rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer', fontSize: isMobile ? '1.1rem' : '0.9rem', fontWeight: 800, flexShrink: 0, minWidth: 44, minHeight: 44 }}
            >‹</button>
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? '0.15rem' : '0.25rem' }}>
              {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                const d = dateForDow(dow);
                const k = keyFor(d);
                const isSelected = dow === selectedDow;
                const isToday = k === todayKey;
                const m = d.getMonth() + 1;
                const day = d.getDate();
                const ranges = planForDate(d);
                const planLabel = ranges.map(formatRange).join(' · ');
                const isDayCompleted = completedSet.has(k);
                const dowColor = dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink)';
                return (
                  <button
                    key={dow} type="button" onClick={() => setSelectedDow(dow)}
                    title={planLabel}
                    style={{
                      padding: isMobile ? '0.3rem 0.1rem' : '0.4rem 0.25rem',
                      border: isSelected ? '2px solid #20CD8D' : isDayCompleted ? '1.5px solid #20CD8D' : '1px solid var(--color-gray)',
                      borderRadius: 8,
                      background: isDayCompleted ? '#20CD8D' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: isSelected ? '0 2px 6px rgba(32,205,141,0.28)' : 'none',
                      display: 'grid', gap: isMobile ? '0.12rem' : '0.18rem',
                      minHeight: isMobile ? 60 : 72, minWidth: 0, position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.15rem', lineHeight: 1 }}>
                      <span style={{ fontSize: isMobile ? '0.72rem' : '0.85rem', fontWeight: 800, color: isDayCompleted ? '#fff' : dowColor, lineHeight: 1 }}>
                        {m}/{day}
                      </span>
                      <span style={{ fontSize: isMobile ? '0.58rem' : '0.66rem', fontWeight: 700, color: isDayCompleted ? 'rgba(255,255,255,0.9)' : dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : 'var(--color-ink-2)', lineHeight: 1 }}>
                        {DAY_LABELS[dow]}
                      </span>
                    </div>
                    {isDayCompleted ? (
                      <span style={{ fontSize: isMobile ? '0.56rem' : '0.62rem', fontWeight: 800, color: '#20CD8D', background: '#fff', padding: '0.05rem 0.35rem', borderRadius: 999, justifySelf: 'center' }}>✓ 완료</span>
                    ) : isToday ? (
                      <span style={{ fontSize: isMobile ? '0.55rem' : '0.6rem', fontWeight: 800, color: '#fff', background: '#20CD8D', padding: '0.05rem 0.35rem', borderRadius: 999, justifySelf: 'center' }}>오늘</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <button
              type="button" onClick={goNext} aria-label="다음 날짜"
              style={{ padding: isMobile ? '0 0.4rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer', fontSize: isMobile ? '1.1rem' : '0.9rem', fontWeight: 800, flexShrink: 0, minWidth: 44, minHeight: 44 }}
            >›</button>
          </div>

          {/* 선택된 날짜의 통독 범위 */}
          <div style={{ padding: isMobile ? '0.9rem' : '1.1rem', borderRadius: 12, background: '#ECFCCB', border: '1px solid #D9F09E', display: 'grid', gap: '0.7rem' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#65A30D', textTransform: 'uppercase' }}>
                  {selectedDate.getFullYear()}.{String(selectedDate.getMonth() + 1).padStart(2, '0')}.{String(selectedDate.getDate()).padStart(2, '0')} ({DAY_LABELS[selectedDate.getDay()]}) 통독
                </span>
                {isCompleted && (
                  <span style={{ padding: '0.15rem 0.55rem', borderRadius: 999, background: '#20CD8D', color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>✓ 완료</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'stretch' : 'flex-end', gap: '0.25rem', marginLeft: isMobile ? 0 : 'auto' }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isCompleted}
                  aria-label={isCompleted ? '통독 완료됨 — 취소' : '통독 전 — 완료 처리'}
                  onClick={toggleComplete}
                  disabled={busy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isMobile ? 'center' : 'flex-start',
                    gap: '0.45rem',
                    padding: isMobile ? '0.65rem 1rem' : '0.3rem 0.7rem 0.3rem 0.4rem',
                    borderRadius: 999,
                    border: `1px solid ${isCompleted ? '#20CD8D' : 'var(--color-gray)'}`,
                    background: isCompleted ? '#20CD8D' : '#fff',
                    color: isCompleted ? '#fff' : 'var(--color-ink-2)',
                    cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.7 : 1,
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                    transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                    minHeight: 48,
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      width: 30,
                      height: 18,
                      borderRadius: 999,
                      background: isCompleted ? 'rgba(255,255,255,0.28)' : '#E5E7EB',
                      flexShrink: 0,
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: isCompleted ? 14 : 2,
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: '#fff',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                        transition: 'left 0.18s ease',
                      }}
                    />
                  </span>
                  <span>{busy ? '처리 중…' : isCompleted ? '✓ 통독 완료' : '통독 전'}</span>
                </button>
                {!isCompleted && !toggleError && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', fontWeight: 600, textAlign: isMobile ? 'center' : 'right' }}>통독 후 토글하세요</span>
                )}
                {toggleError && (
                  <span style={{ fontSize: '0.7rem', color: '#B91C1C', fontWeight: 700 }}>⚠ {toggleError}</span>
                )}
              </div>
            </div>
            {reading.length === 0 && (
              <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>이 날짜에 할당된 통독 분량이 없습니다.</p>
            )}
          </div>

          {/* 말씀 본문 카드 — design.md §2.3 Bible passage rule 준수 (BiblePassageCard 사용) */}
          {reading.length > 0 && (
            passageLoading ? (
              <div style={{ padding: '0.9rem 1rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', fontSize: '0.88rem', color: 'var(--color-ink-2)' }}>본문을 불러오는 중…</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {reading.map((r, i) => {
                  const ref = r.startCh === r.endCh ? `${r.book} ${r.startCh}장` : `${r.book} ${r.startCh}-${r.endCh}장`;
                  const texts = passageTexts[ref];
                  const noText = !texts || (!texts.ko && !texts.en);
                  if (noText) return (
                    <div key={i} style={{ padding: '0.9rem 1rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', display: 'grid', gap: '0.4rem' }}>
                      <strong style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--color-ink)' }}>{ref}</strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>본문을 찾을 수 없습니다.</span>
                    </div>
                  );
                  return <BiblePassageCard key={i} reference={ref} koText={texts.ko || null} enText={texts.en || null} source="KCIS 통독 일정표 · 본문: 개역한글/KJV 공공영역" />;
                })}
              </div>
            )
          )}

          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-ink-2)', lineHeight: 1.6 }}>
            1월 1일부터 12월 31일까지 1년 1회 완독할 수 있도록 하루 평균 약 3장씩 분배됩니다.
          </p>
        </section>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
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
      todayISO: new Date().toISOString(),
      profileId, displayName, nickname, email, systemAdminHref,
    },
  };
};

export default ReadingPage;
