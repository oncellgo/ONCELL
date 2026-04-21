import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
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
  const isMobile = useIsMobile();
  useRequireLogin(profileId);
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

  const dateForDow = (dow: number): Date => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + dow + weekOffset * 7);
    return d;
  };

  const selectedDate = dateForDow(selectedDow);
  const selectedKey = keyFor(selectedDate);
  const todayKey = keyFor(today);
  const reading = useMemo(() => planForDate(selectedDate), [selectedKey]);

  // 선택된 날짜의 각 범위별 성경 본문
  const [passageTexts, setPassageTexts] = useState<Record<string, string>>({});
  const [passageLoading, setPassageLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPassageLoading(true);
    setPassageTexts({});
    Promise.all(reading.map(async (r) => {
      const ref = r.startCh === r.endCh ? `${r.book} ${r.startCh}장` : `${r.book} ${r.startCh}-${r.endCh}장`;
      try {
        const res = await fetch(`/api/bible-text?ref=${encodeURIComponent(ref)}`);
        if (!res.ok) return [ref, ''] as const;
        const d = await res.json();
        return [ref, d?.found ? (d.text as string) : ''] as const;
      } catch { return [ref, ''] as const; }
    })).then((pairs) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const [k, v] of pairs) map[k] = v;
      setPassageTexts(map);
    }).finally(() => { if (!cancelled) setPassageLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKey]);

  // 완료 기록 — 현재 주 범위로 조회
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const loadCompletions = async () => {
    if (!profileId) return;
    try {
      const from = keyFor(dateForDow(0));
      const to = keyFor(dateForDow(6));
      const r = await fetch(`/api/completions?profileId=${encodeURIComponent(profileId)}&type=reading&from=${from}&to=${to}`);
      if (!r.ok) return;
      const d = await r.json();
      setCompletedSet(new Set(Array.isArray(d?.dates) ? d.dates : []));
    } catch {}
  };
  useEffect(() => { loadCompletions(); /* eslint-disable-next-line */ }, [profileId, weekOffset]);

  const isCompleted = completedSet.has(selectedKey);
  const canToggle = selectedKey === todayKey; // 오늘만 완료 가능

  const toggleComplete = async () => {
    if (!profileId || busy || !canToggle) return;
    setBusy(true);
    try {
      if (isCompleted) {
        await fetch(`/api/completions?profileId=${encodeURIComponent(profileId)}&type=reading&date=${selectedKey}`, { method: 'DELETE' });
        setCompletedSet((prev) => { const n = new Set(prev); n.delete(selectedKey); return n; });
      } else {
        const r = await fetch('/api/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, type: 'reading', date: selectedKey }),
        });
        if (r.ok) setCompletedSet((prev) => new Set(prev).add(selectedKey));
      }
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
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>성경통독</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>1년 1독 · 약 3장/일</span>
          </div>

          {/* 7일 캘린더 — QT와 동일한 디자인 */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: isMobile ? '0.2rem' : '0.3rem' }}>
            <button
              type="button" onClick={goPrev} aria-label="이전 날짜"
              style={{ padding: isMobile ? '0 0.35rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer', fontSize: isMobile ? '1.05rem' : '0.9rem', fontWeight: 800, flexShrink: 0, minWidth: isMobile ? 32 : 'auto' }}
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
                      border: isSelected ? '2px solid #20CD8D' : isDayCompleted ? '1.5px solid #20CD8D' : isToday ? '1.5px solid #D9F09E' : '1px solid var(--color-gray)',
                      borderRadius: 8,
                      background: isDayCompleted ? '#20CD8D' : isToday ? '#ECFCCB' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: isSelected ? '0 2px 6px rgba(32,205,141,0.28)' : 'none',
                      display: 'grid', gap: isMobile ? '0.12rem' : '0.18rem',
                      minHeight: isMobile ? 60 : 72, minWidth: 0, position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.3rem', lineHeight: 1 }}>
                      <span style={{ fontSize: isMobile ? '0.72rem' : '0.85rem', fontWeight: 800, color: isDayCompleted ? '#fff' : dowColor, lineHeight: 1 }}>
                        {m}/{day}
                      </span>
                      <span style={{ fontSize: isMobile ? '0.58rem' : '0.66rem', fontWeight: 700, color: isDayCompleted ? 'rgba(255,255,255,0.9)' : 'var(--color-ink-2)', lineHeight: 1 }}>
                        {DAY_LABELS[dow]}
                      </span>
                    </div>
                    {planLabel && (
                      <span style={{ fontSize: isMobile ? '0.55rem' : '0.62rem', fontWeight: 600, color: isDayCompleted ? '#F7FEE7' : '#3F6212', lineHeight: 1.2, padding: '0 2px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                        {planLabel}
                      </span>
                    )}
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
              style={{ padding: isMobile ? '0 0.35rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer', fontSize: isMobile ? '1.05rem' : '0.9rem', fontWeight: 800, flexShrink: 0, minWidth: isMobile ? 32 : 'auto' }}
            >›</button>
          </div>

          {/* 선택된 날짜의 통독 범위 */}
          <div style={{ padding: isMobile ? '0.9rem' : '1.1rem', borderRadius: 12, background: '#ECFCCB', border: '1px solid #D9F09E', display: 'grid', gap: '0.7rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#65A30D', textTransform: 'uppercase' }}>
                {selectedDate.getFullYear()}.{String(selectedDate.getMonth() + 1).padStart(2, '0')}.{String(selectedDate.getDate()).padStart(2, '0')} ({DAY_LABELS[selectedDate.getDay()]}) 통독
              </span>
              {isCompleted && (
                <span style={{ padding: '0.15rem 0.55rem', borderRadius: 999, background: '#20CD8D', color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>✓ 완료</span>
              )}
              <div style={{ marginLeft: 'auto', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                <button
                  type="button"
                  onClick={toggleComplete}
                  disabled={!canToggle || busy}
                  title={canToggle ? '' : '오늘 날짜만 완료 처리할 수 있습니다.'}
                  style={{
                    padding: '0.4rem 0.9rem', borderRadius: 999,
                    border: isCompleted ? '1px solid #20CD8D' : '1px solid var(--color-primary)',
                    background: isCompleted ? '#fff' : 'var(--color-primary)',
                    color: isCompleted ? 'var(--color-primary-deep)' : '#fff',
                    fontSize: '0.82rem', fontWeight: 800,
                    cursor: canToggle && !busy ? 'pointer' : 'not-allowed',
                    opacity: canToggle ? 1 : 0.5,
                  }}
                >{busy ? '...' : isCompleted ? '✓ 통독 완료 (취소)' : '통독 전'}</button>
                {!isCompleted && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', fontWeight: 600 }}>통독완료 후 클릭해주세요</span>
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
                  const text = passageTexts[ref];
                  if (!text) return (
                    <div key={i} style={{ padding: '0.9rem 1rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', display: 'grid', gap: '0.4rem' }}>
                      <strong style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--color-ink)' }}>{ref}</strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>본문을 찾을 수 없습니다.</span>
                    </div>
                  );
                  return <BiblePassageCard key={i} reference={ref} passageText={text} />;
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
