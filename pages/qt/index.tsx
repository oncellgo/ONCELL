import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Fragment, useEffect, useState } from 'react';
import SubHeader from '../../components/SubHeader';
import BiblePassageCard from '../../components/BiblePassageCard';
import { getSystemAdminHref } from '../../lib/adminGuard';
import { getProfiles, getUsers } from '../../lib/dataStore';
import { useIsMobile } from '../../lib/useIsMobile';
import { useRequireLogin } from '../../lib/useRequireLogin';
import { fetchChannelUploadsByHandle } from '../../lib/youtube';
import { getSGDateKey, getSGDow, getSGSundayKey, getSGTodayKey, addDaysToKey } from '../../lib/events';

type Video = { videoId: string; title: string; publishedAt: string; dow: number; dateKey: string };

type Props = {
  videos: Video[];
  weekStartISO: string;
  todayDow: number;
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const QtPage = ({ videos, todayDow, weekStartISO, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  // localStorage fallback — MenuBar 하드 네비 시 SSR 프롭 없이 들어와도 동작
  const [effProfileId, setEffProfileId] = useState<string | null>(profileId);
  useEffect(() => {
    if (profileId) { setEffProfileId(profileId); return; }
    try { const p = window.localStorage.getItem('kcisProfileId'); if (p) setEffProfileId(p); } catch {}
  }, [profileId]);
  useRequireLogin(effProfileId);

  // 현재 주간(weekOffset 적용)의 큐티 완료 날짜 집합
  const [qtCompletedSet, setQtCompletedSet] = useState<Set<string>>(new Set());
  // 일요일 기준 dow별 실제 날짜 계산 (일=0..토=6). weekOffset은 주 단위 이동(일 단위).
  // weekStartISO 는 SG 기준 Sunday의 YYYY-MM-DD — addDaysToKey 로 TZ-safe 계산.
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const dateKeyForDow = (dow: number): string => addDaysToKey(weekStartISO, dow + weekOffset);
  const dateForDow = (dow: number): { m: number; d: number } => {
    const [, m, d] = dateKeyForDow(dow).split('-').map(Number);
    return { m, d };
  };
  const latestVideo = videos.length
    ? [...videos].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))[0]
    : null;
  const [selectedDow, setSelectedDow] = useState<number>(todayDow);
  // 쿼리에 profileId가 없으면 localStorage에서 복구 (SubHeader/TopNav와 동일 규칙)
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(profileId);
  useEffect(() => {
    if (resolvedProfileId) return;
    try {
      const p = window.localStorage.getItem('kcisProfileId');
      if (p) setResolvedProfileId(p);
    } catch {}
  }, [resolvedProfileId]);
  // 영상 매칭: weekOffset 반영한 실제 날짜(YYYY-MM-DD)와 일치하는 것
  const selectedVideo = videos.find((v) => v.dateKey === dateKeyForDow(selectedDow)) || null;
  const selectedVideoId = selectedVideo?.videoId || null;
  const videoMeta = (() => {
    if (!selectedVideo) return null;
    const raw = selectedVideo.title;
    const quote =
      (raw.match(/[""](.+?)[""]/) || raw.match(/"([^"]+)"/) || raw.match(/'([^']+)'/) || raw.match(/「(.+?)」/))?.[1] ?? null;
    const pastor =
      (raw.match(/[-–]\s*([가-힣]{2,6}\s*(?:담임)?\s*(?:목사|전도사))\s*[-–]/) ||
        raw.match(/([가-힣]{2,6}\s*(?:담임)?\s*(?:목사|전도사))/))?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
    const dm = raw.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?/);
    const dateStr = dm ? `${dm[1]}.${String(dm[2]).padStart(2, '0')}.${String(dm[3]).padStart(2, '0')}` : null;
    const dow = selectedVideo.dow;
    const dowLabel = dow === 0 ? '주일' : DAY_LABELS[dow];
    return { dateStr, dowLabel, quote, pastor };
  })();

  const goPrev = () => {
    if (selectedDow > 0) {
      setSelectedDow(selectedDow - 1);
    } else {
      setWeekOffset(weekOffset - 7);
      setSelectedDow(6);
    }
  };
  const goNext = () => {
    if (selectedDow < 6) {
      setSelectedDow(selectedDow + 1);
    } else {
      setWeekOffset(weekOffset + 7);
      setSelectedDow(0);
    }
  };
  const [qtRef, setQtRef] = useState<string | null>(null);
  const [qtPassage, setQtPassage] = useState<string | null>(null);
  const [qtPassageText, setQtPassageText] = useState<string | null>(null);
  const [qtPassageTextEn, setQtPassageTextEn] = useState<string | null>(null);
  const [qtLoading, setQtLoading] = useState(false);
  const [qtError, setQtError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteFeelings, setNoteFeelings] = useState('');
  const [noteDecision, setNoteDecision] = useState('');
  const [notePrayer, setNotePrayer] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);

  const todayKey = getSGTodayKey();

  const openNoteModal = async () => {
    if (!resolvedProfileId) {
      alert('로그인 후 사용하실 수 있습니다.');
      router.push('/auth/login');
      return;
    }
    setNoteOpen(true);
    setNoteMsg(null);
    setNoteLoading(true);
    try {
      const r = await fetch(`/api/qt-notes?profileId=${encodeURIComponent(resolvedProfileId)}&date=${todayKey}`);
      const j = await r.json();
      const n = j?.note || {};
      // 이전 스키마(text) 호환: text가 있고 3필드가 비어있으면 느낀점에 마이그레이션
      // 단일 필드 UI — 기존 3필드 레코드는 합쳐서 불러온다
      const parts: string[] = [];
      if (n.feelings && n.feelings.trim()) parts.push(`💭 느낀점\n${n.feelings.trim()}`);
      if (n.decision && n.decision.trim()) parts.push(`🌱 나의 결단\n${n.decision.trim()}`);
      if (n.prayer && n.prayer.trim()) parts.push(`🙏 기도제목\n${n.prayer.trim()}`);
      const merged = parts.length > 0 ? parts.join('\n\n') : (n.text || '');
      setNoteFeelings(merged);
      setNoteDecision('');
      setNotePrayer('');
    } catch {
      setNoteFeelings(''); setNoteDecision(''); setNotePrayer('');
    } finally {
      setNoteLoading(false);
    }
  };

  const hasNoteInput = !!(noteFeelings.trim() || noteDecision.trim() || notePrayer.trim());

  const saveNote = async () => {
    if (!resolvedProfileId || !hasNoteInput) return;
    setNoteSaving(true);
    setNoteMsg(null);
    try {
      const r = await fetch('/api/qt-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: resolvedProfileId,
          date: todayKey,
          reference: qtRef,
          feelings: noteFeelings,
          decision: noteDecision,
          prayer: notePrayer,
        }),
      });
      if (!r.ok) throw new Error('save failed');
      setNoteMsg('저장됐어요.');
      // qt-notes API가 완료여부를 자동 동기화 (1자 이상이면 완료, 전부 비우면 해제)
      setQtCompletedSet((prev) => {
        const next = new Set(prev);
        if (hasNoteInput) next.add(todayKey); else next.delete(todayKey);
        return next;
      });
      // 저장 성공 후 잠시 메시지 보여주고 창 닫기
      setTimeout(() => { setNoteOpen(false); setNoteMsg(null); }, 600);
    } catch {
      setNoteMsg('저장에 실패했습니다.');
    } finally {
      setNoteSaving(false);
    }
  };

  // 선택된 날짜(일=0..토=6 + weekOffset)에 해당하는 YYYY-MM-DD (SG 기준)
  const selectedDateKey = dateKeyForDow(selectedDow);
  const isTodaySelected = weekOffset === 0 && selectedDow === todayDow;

  // 해당 주간의 큐티 완료 fetch (weekOffset 이 바뀌면 재조회)
  useEffect(() => {
    if (!effProfileId) { setQtCompletedSet(new Set()); return; }
    const from = dateKeyForDow(0);
    const to = dateKeyForDow(6);
    fetch(`/api/completions?profileId=${encodeURIComponent(effProfileId)}&type=qt&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => setQtCompletedSet(new Set(Array.isArray(d?.dates) ? d.dates : [])))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effProfileId, weekOffset]);

  useEffect(() => {
    let cancelled = false;
    setQtLoading(true);
    setQtError(null);
    const url = isTodaySelected ? '/api/qt' : `/api/qt?date=${selectedDateKey}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setQtRef(d?.reference || null);
        setQtPassageText(d?.passageText || null);
        setQtPassageTextEn(d?.passageTextEn || null);
        setQtPassage(d?.passage || null);
        if (d?.error) setQtError(d.error);
      })
      .catch(() => { if (!cancelled) setQtError('말씀을 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setQtLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDateKey, isTodaySelected]);

  return (
    <>
      <Head>
        <title>KCIS | 오늘의 큐티말씀</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader
        profileId={profileId}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref}
      />

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: isMobile ? '1rem' : '1.25rem' }}>
        <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: isMobile ? '0.75rem' : '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>오늘의 큐티말씀</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>KoreanChurchInSingapore</span>
          </div>

          <>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: isMobile ? '0.2rem' : '0.3rem' }}>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="이전 날짜"
                  style={{
                    padding: isMobile ? '0 0.4rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)',
                    background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer',
                    fontSize: isMobile ? '1.1rem' : '0.9rem', fontWeight: 800, flexShrink: 0,
                    minWidth: 44, minHeight: 44,
                  }}
                >‹</button>
                <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? '0.15rem' : '0.25rem' }}>
                {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                  const v = videos.find((x) => x.dateKey === dateKeyForDow(dow));
                  const isToday = weekOffset === 0 && dow === todayDow;
                  const isSelected = dow === selectedDow;
                  const isLatest = !!(v && latestVideo && v.videoId === latestVideo.videoId);
                  const { m, d } = dateForDow(dow);
                  const dk = dateKeyForDow(dow);
                  const isDayCompleted = qtCompletedSet.has(dk);
                  // 오늘 이후(미래) 날짜는 비활성화 — 큐티는 선지급 불가 (SG 기준)
                  const isFuture = dk > getSGTodayKey();
                  return (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => { if (!isFuture) setSelectedDow(dow); }}
                      disabled={isFuture}
                      title={isFuture ? '미래 날짜는 선택할 수 없습니다' : isLatest ? '최신영상' : undefined}
                      style={{
                        padding: isMobile ? '0.25rem 0.05rem' : '0.3rem 0.2rem',
                        border: isSelected ? '2px solid #20CD8D' : isDayCompleted ? '1.5px solid #20CD8D' : isToday ? '1.5px solid #D9F09E' : '1px solid var(--color-gray)',
                        borderRadius: 8,
                        background: isFuture ? '#F9FAFB' : isDayCompleted ? '#20CD8D' : isToday ? '#ECFCCB' : '#fff',
                        cursor: isFuture ? 'not-allowed' : 'pointer',
                        opacity: isFuture ? 0.4 : (v ? 1 : 0.7),
                        textAlign: 'center',
                        boxShadow: isSelected ? '0 2px 6px rgba(32,205,141,0.2)' : 'none',
                        display: 'grid',
                        gap: isMobile ? '0.1rem' : '0.15rem',
                        minHeight: isMobile ? 44 : 48,
                        minWidth: 0,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {isLatest && !isFuture && (
                        <span style={{
                          position: 'absolute', top: -4, right: -4,
                          width: 8, height: 8, borderRadius: 999, background: '#DC2626',
                          boxShadow: '0 0 0 2px #fff',
                        }} aria-label="최신영상" />
                      )}
                      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: isMobile ? '0.05rem' : '0.2rem', lineHeight: 1 }}>
                        <span style={{ fontSize: isMobile ? '0.7rem' : '0.82rem', fontWeight: 800, color: isDayCompleted ? '#fff' : isFuture ? '#9CA3AF' : 'var(--color-ink)', lineHeight: 1 }}>
                          {m}/{d}
                        </span>
                        <span style={{ fontSize: isMobile ? '0.58rem' : '0.64rem', fontWeight: 700, color: isDayCompleted ? 'rgba(255,255,255,0.9)' : isFuture ? '#9CA3AF' : dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : 'var(--color-ink-2)', lineHeight: 1 }}>
                          {DAY_LABELS[dow]}
                        </span>
                      </div>
                      {isDayCompleted ? (
                        <span style={{ fontSize: isMobile ? '0.55rem' : '0.6rem', fontWeight: 800, color: '#20CD8D', background: '#fff', padding: '0.05rem 0.35rem', borderRadius: 999, letterSpacing: '0.02em', justifySelf: 'center' }}>✓ 완료</span>
                      ) : isToday ? (
                        <span style={{ fontSize: isMobile ? '0.55rem' : '0.6rem', fontWeight: 800, color: '#fff', background: '#20CD8D', padding: '0.05rem 0.35rem', borderRadius: 999, letterSpacing: '0.02em', justifySelf: 'center' }}>오늘</span>
                      ) : v ? (
                        <svg viewBox="0 0 24 24" width={isMobile ? 12 : 14} height={isMobile ? 9 : 10} aria-label="YouTube" style={{ justifySelf: 'center' }}>
                          <path fill="#FF0000" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8z"/>
                          <path fill="#fff" d="M9.6 15.6 15.8 12 9.6 8.4z"/>
                        </svg>
                      ) : null}
                    </button>
                  );
                })}
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="다음 날짜"
                  style={{
                    padding: isMobile ? '0 0.4rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)',
                    background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer',
                    fontSize: isMobile ? '1.1rem' : '0.9rem', fontWeight: 800, flexShrink: 0,
                    minWidth: 44, minHeight: 44,
                  }}
                >›</button>
              </div>

              {selectedVideoId ? (
                <div style={{ position: 'relative', width: isMobile ? '100%' : '75%', maxWidth: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', background: '#000', margin: '0 auto' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${selectedVideoId}`}
                    title={selectedVideo?.title || '새벽기도 영상'}
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              ) : (
                <div style={{
                  position: 'relative', width: isMobile ? '100%' : '75%', maxWidth: '100%', aspectRatio: '16/9', borderRadius: 12,
                  background: '#F3F4F6', border: '1px dashed var(--color-gray)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-ink-2)', fontSize: '1rem', fontWeight: 700,
                  margin: '0 auto',
                }}>
                  영상 없음
                </div>
              )}

              <div style={{
                display: 'grid', gap: isMobile ? '0.6rem' : '0.75rem',
                padding: isMobile ? '0.75rem 0.75rem' : '1rem 1.1rem',
                borderRadius: 12,
                background: '#ECFCCB',
                border: '1px solid #D9F09E',
                fontFamily: '"Noto Sans KR", "Nanum Gothic", "Malgun Gothic", system-ui, sans-serif',
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: isMobile ? '0.4rem' : '0.5rem',
                  flexWrap: isMobile ? 'nowrap' : 'wrap',
                }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.02em', color: '#65A30D', textTransform: 'uppercase', flexShrink: 0 }}>
                    {isTodaySelected ? '오늘의 QT말씀' : `${selectedDateKey.slice(5).replace('-', '/')} QT말씀`}
                  </span>
                  {videoMeta && (videoMeta.quote || videoMeta.pastor) && (
                    <div
                      style={{
                        fontSize: isMobile ? '0.82rem' : '0.9rem',
                        fontWeight: 800,
                        color: 'var(--color-ink)',
                        lineHeight: 1.5,
                        display: 'flex',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: isMobile ? '0.15rem' : '0.3rem',
                        flex: isMobile ? undefined : 1,
                        minWidth: 0,
                      }}
                    >
                      {videoMeta.quote && (
                        <span style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}>&ldquo;{videoMeta.quote}&rdquo;</span>
                      )}
                      {videoMeta.pastor && (
                        <span style={{ color: 'var(--color-ink-2)', fontWeight: 700, fontSize: isMobile ? '0.76rem' : undefined }}>— {videoMeta.pastor}</span>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: isMobile ? undefined : 1, marginLeft: 'auto' }}>
                    {qtLoading && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>불러오는 중…</span>
                    )}
                    {!qtLoading && !qtRef && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>{qtError || '오늘의 QT말씀 정보가 없습니다.'}</span>
                    )}
                    {qtRef && (() => {
                      const hasNote = qtCompletedSet.has(selectedDateKey);
                      return (
                        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={openNoteModal}
                            title={hasNote ? '묵상 입력됨 — 클릭하여 수정' : '나의 묵상노트 작성'}
                            aria-label={hasNote ? '묵상 입력됨' : '묵상 미입력'}
                            style={{
                              padding: '0.38rem 0.85rem',
                              borderRadius: 999,
                              border: `1px solid ${hasNote ? '#20CD8D' : 'var(--color-gray)'}`,
                              background: hasNote ? '#20CD8D' : '#fff',
                              color: hasNote ? '#fff' : 'var(--color-ink-2)',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              letterSpacing: '0.02em',
                              transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                            }}
                          >
                            <span aria-hidden>{hasNote ? '✓' : '✍️'}</span>
                            <span>{hasNote ? '묵상 입력됨' : '묵상 미입력'}</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {(qtPassageText || qtPassageTextEn) && qtRef && (
                  <BiblePassageCard reference={qtRef} koText={qtPassageText} enText={qtPassageTextEn} />
                )}
                {!qtPassageText && !qtPassageTextEn && qtPassage && (
                  <div style={{ padding: '0.9rem 1.1rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E', fontSize: '0.9rem', color: 'var(--color-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-ink-2)', marginBottom: '0.45rem' }}>※ 개역한글 본문 번들 미포함 — 매일성경 해설</div>
                    {qtPassage}
                  </div>
                )}
                {!qtPassageText && !qtPassageTextEn && !qtPassage && !qtLoading && qtRef && (
                  <div style={{ padding: '0.85rem 1rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E', fontSize: '0.88rem', color: 'var(--color-ink-2)' }}>
                    본문을 불러오지 못했습니다.
                  </div>
                )}
              </div>
          </>
        </section>
      </main>

      {noteOpen && (
        <div
          onClick={() => setNoteOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: isMobile ? 0 : '1rem', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-card"
            style={{
              width: '100%', maxWidth: isMobile ? '100%' : 560, background: '#fff',
              borderRadius: isMobile ? '16px 16px 0 0' : 16,
              padding: isMobile ? '1.25rem 1rem 2rem' : '1.5rem',
              boxShadow: '0 -4px 30px rgba(0,0,0,0.18)',
              display: 'grid', gap: isMobile ? '0.75rem' : '0.9rem',
              maxHeight: isMobile ? '92dvh' : '92vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#1F2937' }}>✍️ 나의 묵상노트</h3>
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                style={{ border: 'none', background: 'transparent', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40 }}
                aria-label="닫기"
              >✕</button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>
              <span style={{ fontWeight: 700, color: '#3F6212' }}>{(() => {
                const [y, m, d] = todayKey.split('-').map(Number);
                if (!y || !m || !d) return todayKey;
                const dow = new Date(y, m - 1, d).getDay();
                return `${todayKey}(${DAY_LABELS[dow]})`;
              })()}</span>
              {qtRef && <span> · 📖 {qtRef}</span>}
            </div>
            {noteLoading ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-ink-2)' }}>불러오는 중…</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#65A30D' }}>✍️ 나의 묵상노트</label>
                <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--color-ink-2)', lineHeight: 1.5 }}>느낀 점 · 결단 · 기도제목을 자유롭게 한 곳에 기록하세요.</p>
                <textarea
                  value={noteFeelings}
                  onChange={(e) => { setNoteFeelings(e.target.value); setNoteMsg(null); }}
                  placeholder={'오늘 말씀을 통해 받은 은혜·결단·기도제목을 자유롭게 기록해 보세요.\n\n예)\n💭 느낀점 — …\n🌱 결단 — …\n🙏 기도제목 — …'}
                  rows={isMobile ? 9 : 12}
                  style={{
                    width: '100%', padding: '0.75rem 0.9rem', borderRadius: 10,
                    border: '1px solid var(--color-gray)', fontSize: isMobile ? '1rem' : '0.93rem', lineHeight: 1.75,
                    fontFamily: '"Noto Sans KR", "Nanum Gothic", "Malgun Gothic", system-ui, sans-serif',
                    resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
            {noteMsg && (
              <div style={{ fontSize: '0.82rem', color: noteMsg.includes('실패') ? '#B91C1C' : '#047857' }}>{noteMsg}</div>
            )}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                style={{ padding: '0.7rem 1.1rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', cursor: 'pointer', fontWeight: 700, minHeight: 48, width: isMobile ? '100%' : 'auto' }}
              >닫기</button>
              <button
                type="button"
                onClick={saveNote}
                disabled={noteSaving || noteLoading || !hasNoteInput}
                style={{
                  padding: '0.7rem 1.3rem', borderRadius: 8, border: 'none',
                  background: (!hasNoteInput || noteLoading) ? '#D1D5DB' : noteSaving ? '#86EFAC' : '#20CD8D',
                  color: '#fff',
                  cursor: (noteSaving || !hasNoteInput || noteLoading) ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  opacity: (!hasNoteInput || noteLoading) ? 0.7 : 1,
                  minHeight: 48,
                  width: isMobile ? '100%' : 'auto',
                }}
              >{noteSaving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const CHANNEL_HANDLE = 'KoreanChurchInSingapore';

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  // 모든 날짜 계산은 싱가폴(UTC+8) 기준 — Vercel 서버 UTC 때문에 KST 새벽에 전날로 밀리는 버그 방지
  const todayDow = getSGDow();
  const weekStartKey = getSGSundayKey();

  let videos: Video[] = [];
  {
    const all = await fetchChannelUploadsByHandle(CHANNEL_HANDLE, 50);
    const allVids = all
      .filter((v) => /새벽/.test(v.title))
      .map((v) => {
        const dateKey = getSGDateKey(v.publishedAt) || '';
        return {
          videoId: v.videoId,
          title: v.title,
          publishedAt: v.publishedAt,
          dow: getSGDow(v.publishedAt),
          dateKey,
        };
      })
      .filter((v) => v.dateKey);
    // 같은 dateKey에 여러 영상이면 최신 publishedAt 우선
    const byDate = new Map<string, Video>();
    for (const v of allVids) {
      const existing = byDate.get(v.dateKey);
      if (!existing || new Date(v.publishedAt).getTime() > new Date(existing.publishedAt).getTime()) {
        byDate.set(v.dateKey, v);
      }
    }
    videos = Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }

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
      weekStartISO: weekStartKey,
      todayDow,
      profileId,
      displayName,
      nickname,
      email,
      systemAdminHref,
    },
  };
};

export default QtPage;
