import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import SubHeader from '../../components/SubHeader';
import { getSystemAdminHref } from '../../lib/adminGuard';
import { getProfiles, getUsers } from '../../lib/dataStore';
import { useIsMobile } from '../../lib/useIsMobile';

type Video = { videoId: string; title: string; publishedAt: string; dow: number };

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
  // 일요일 기준 dow별 실제 날짜 계산 (일=0..토=6). weekOffset은 주 단위 이동(일 단위).
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const dateForDow = (dow: number): { m: number; d: number } => {
    const sunday = new Date(weekStartISO);
    const target = new Date(sunday);
    target.setDate(target.getDate() + dow + weekOffset);
    return { m: target.getMonth() + 1, d: target.getDate() };
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
  // 영상은 이번 주(weekOffset === 0)에만 매칭
  const selectedVideo = weekOffset === 0 ? (videos.find((v) => v.dow === selectedDow) || null) : null;
  const selectedVideoId = selectedVideo?.videoId || null;

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
  const [qtLoading, setQtLoading] = useState(false);
  const [qtError, setQtError] = useState<string | null>(null);
  const [passageOpen, setPassageOpen] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteFeelings, setNoteFeelings] = useState('');
  const [noteDecision, setNoteDecision] = useState('');
  const [notePrayer, setNotePrayer] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);

  const todayKey = (() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

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
      setNoteFeelings(n.feelings || n.text || '');
      setNoteDecision(n.decision || '');
      setNotePrayer(n.prayer || '');
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
    } catch {
      setNoteMsg('저장에 실패했습니다.');
    } finally {
      setNoteSaving(false);
    }
  };

  // 선택된 날짜(일=0..토=6 + weekOffset)에 해당하는 YYYY-MM-DD
  const selectedDateKey = (() => {
    const sunday = new Date(weekStartISO);
    const target = new Date(sunday);
    target.setDate(target.getDate() + selectedDow + weekOffset);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();
  const isTodaySelected = weekOffset === 0 && selectedDow === todayDow;

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
                    padding: isMobile ? '0 0.35rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)',
                    background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer',
                    fontSize: isMobile ? '1.05rem' : '0.9rem', fontWeight: 800, flexShrink: 0,
                    minWidth: isMobile ? 32 : 'auto',
                  }}
                >‹</button>
                <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? '0.15rem' : '0.25rem' }}>
                {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                  const v = weekOffset === 0 ? videos.find((x) => x.dow === dow) : undefined;
                  const isToday = weekOffset === 0 && dow === todayDow;
                  const isSelected = dow === selectedDow;
                  const isLatest = !!(v && latestVideo && v.videoId === latestVideo.videoId);
                  const { m, d } = dateForDow(dow);
                  return (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => setSelectedDow(dow)}
                      title={isLatest ? '최신영상' : undefined}
                      style={{
                        padding: isMobile ? '0.25rem 0.05rem' : '0.3rem 0.2rem',
                        border: isSelected ? '2px solid #20CD8D' : isToday ? '1.5px solid #D9F09E' : '1px solid var(--color-gray)',
                        borderRadius: 8,
                        background: isToday ? '#ECFCCB' : '#fff',
                        cursor: 'pointer',
                        opacity: v ? 1 : 0.7,
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
                      {isLatest && (
                        <span style={{
                          position: 'absolute', top: -4, right: -4,
                          width: 8, height: 8, borderRadius: 999, background: '#DC2626',
                          boxShadow: '0 0 0 2px #fff',
                        }} aria-label="최신영상" />
                      )}
                      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: isMobile ? '0.05rem' : '0.2rem', lineHeight: 1 }}>
                        <span style={{ fontSize: isMobile ? '0.7rem' : '0.82rem', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>
                          {m}/{d}
                        </span>
                        <span style={{ fontSize: isMobile ? '0.58rem' : '0.64rem', fontWeight: 700, color: 'var(--color-ink-2)', lineHeight: 1 }}>
                          {DAY_LABELS[dow]}
                        </span>
                      </div>
                      {v ? (
                        <svg viewBox="0 0 24 24" width={isMobile ? 12 : 14} height={isMobile ? 9 : 10} aria-label="YouTube" style={{ justifySelf: 'center' }}>
                          <path fill="#FF0000" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8z"/>
                          <path fill="#fff" d="M9.6 15.6 15.8 12 9.6 8.4z"/>
                        </svg>
                      ) : (
                        <span style={{ fontSize: isMobile ? '0.55rem' : '0.62rem', color: 'var(--color-ink-2)' }}>없음</span>
                      )}
                    </button>
                  );
                })}
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="다음 날짜"
                  style={{
                    padding: isMobile ? '0 0.35rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)',
                    background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer',
                    fontSize: isMobile ? '1.05rem' : '0.9rem', fontWeight: 800, flexShrink: 0,
                    minWidth: isMobile ? 32 : 'auto',
                  }}
                >›</button>
              </div>

              {selectedVideoId ? (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${selectedVideoId}`}
                    title="새벽기도 영상"
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              ) : (
                <div style={{
                  position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 12,
                  background: '#F3F4F6', border: '1px dashed var(--color-gray)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-ink-2)', fontSize: '1rem', fontWeight: 700,
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.02em', color: '#65A30D', textTransform: 'uppercase' }}>
                    {isTodaySelected ? '오늘의 QT말씀' : `${selectedDateKey.slice(5).replace('-', '/')} QT말씀`}
                  </span>
                  {qtLoading ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>불러오는 중…</span>
                  ) : qtRef ? (
                    <button
                      type="button"
                      onClick={() => setPassageOpen((v) => !v)}
                      style={{
                        padding: '0.38rem 0.85rem',
                        borderRadius: 999,
                        border: '1px solid #65A30D',
                        background: '#fff',
                        color: '#3F6212',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <span>📖</span>
                      <span>{qtRef}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-ink-2)' }}>{passageOpen ? '▾' : '▸'}</span>
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>{qtError || '오늘의 QT말씀 정보가 없습니다.'}</span>
                  )}
                  {qtRef && (
                    <button
                      type="button"
                      onClick={openNoteModal}
                      style={{
                        marginLeft: 'auto',
                        padding: '0.38rem 0.85rem',
                        borderRadius: 999,
                        border: '1px solid #65A30D',
                        background: '#fff',
                        color: '#3F6212',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <span>✍️</span>
                      <span>나의 묵상노트</span>
                    </button>
                  )}
                </div>

                {passageOpen && qtPassageText && (() => {
                  const lines = qtPassageText.split('\n');
                  const blocks: Array<{ chapter?: string; verse?: string; text?: string }> = [];
                  for (const line of lines) {
                    const chMatch = /^\[(\d+)장\]$/.exec(line.trim());
                    if (chMatch) { blocks.push({ chapter: chMatch[1] }); continue; }
                    const vMatch = /^(\d+)\s+(.+)$/.exec(line.trim());
                    if (vMatch) { blocks.push({ verse: vMatch[1], text: vMatch[2] }); continue; }
                    if (line.trim()) blocks.push({ text: line.trim() });
                  }
                  return (
                    <div style={{ padding: isMobile ? '0.85rem 0.85rem' : '1.1rem 1.2rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.6rem', borderBottom: '1px solid #ECFCCB', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: isMobile ? '0.92rem' : '0.98rem', color: 'var(--color-ink)', fontWeight: 800 }}>{qtRef}</strong>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.25rem 0.7rem',
                          borderRadius: 999,
                          border: '1px solid #D9F09E',
                          background: '#ECFCCB',
                          color: '#3F6212',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                        }}>
                          개역한글 · 공공영역
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: '0.5rem', color: 'var(--color-ink)', fontSize: isMobile ? '0.92rem' : '0.97rem', lineHeight: isMobile ? 1.75 : 1.85 }}>
                        {blocks.map((b, i) => {
                          if (b.chapter) {
                            return (
                              <div key={i} style={{ marginTop: i === 0 ? 0 : '0.8rem', marginBottom: '0.2rem' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '0.25rem 0.9rem',
                                  borderRadius: 999,
                                  background: '#65A30D',
                                  color: '#fff',
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  letterSpacing: '0.02em',
                                }}>
                                  {b.chapter}장
                                </span>
                              </div>
                            );
                          }
                          if (b.verse) {
                            return (
                              <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1.5rem 1fr' : '2rem 1fr', columnGap: isMobile ? '0.3rem' : '0.4rem', alignItems: 'baseline' }}>
                                <span style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', color: '#65A30D', fontWeight: 700, textAlign: 'right' }}>{b.verse}</span>
                                <p style={{ margin: 0 }}>{b.text}</p>
                              </div>
                            );
                          }
                          return <p key={i} style={{ margin: 0, paddingLeft: isMobile ? '1.8rem' : '2.4rem' }}>{b.text}</p>;
                        })}
                      </div>
                    </div>
                  );
                })()}
                {passageOpen && !qtPassageText && qtPassage && (
                  <div style={{ padding: '0.9rem 1.1rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E', fontSize: '0.9rem', color: 'var(--color-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-ink-2)', marginBottom: '0.45rem' }}>※ 개역한글 본문 번들 미포함 — 매일성경 해설</div>
                    {qtPassage}
                  </div>
                )}
                {passageOpen && !qtPassageText && !qtPassage && !qtLoading && (
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
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: isMobile ? '0.5rem' : '1rem', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-card"
            style={{
              width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16,
              padding: isMobile ? '1rem' : '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              display: 'grid', gap: isMobile ? '0.7rem' : '0.9rem',
              maxHeight: '92vh', overflowY: 'auto',
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
              <span style={{ fontWeight: 700, color: '#3F6212' }}>{todayKey}</span>
              {qtRef && <span> · 📖 {qtRef}</span>}
            </div>
            {noteLoading ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-ink-2)' }}>불러오는 중…</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {([
                  { key: 'feelings', label: '💭 느낀점', value: noteFeelings, set: setNoteFeelings, placeholder: '말씀을 읽으며 느낀 점을 자유롭게 적어보세요.' },
                  { key: 'decision', label: '🌱 나의 결단', value: noteDecision, set: setNoteDecision, placeholder: '오늘 말씀을 통해 결단하고 실천할 것을 적어보세요.' },
                  { key: 'prayer', label: '🙏 기도제목', value: notePrayer, set: setNotePrayer, placeholder: '오늘의 기도제목을 적어보세요.' },
                ] as const).map((s) => (
                  <div key={s.key} style={{ display: 'grid', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#65A30D' }}>{s.label}</label>
                    <textarea
                      value={s.value}
                      onChange={(e) => { s.set(e.target.value); setNoteMsg(null); }}
                      placeholder={s.placeholder}
                      rows={4}
                      style={{
                        width: '100%', padding: '0.65rem 0.8rem', borderRadius: 10,
                        border: '1px solid var(--color-gray)', fontSize: '0.93rem', lineHeight: 1.6,
                        fontFamily: '"Noto Sans KR", "Nanum Gothic", "Malgun Gothic", system-ui, sans-serif',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {noteMsg && (
              <div style={{ fontSize: '0.82rem', color: noteMsg.includes('실패') ? '#B91C1C' : '#047857' }}>{noteMsg}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                style={{ padding: isMobile ? '0.7rem 1.1rem' : '0.55rem 1rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', cursor: 'pointer', fontWeight: 700, minHeight: 40 }}
              >닫기</button>
              <button
                type="button"
                onClick={saveNote}
                disabled={noteSaving || noteLoading || !hasNoteInput}
                style={{
                  padding: isMobile ? '0.7rem 1.3rem' : '0.55rem 1.2rem', borderRadius: 8, border: 'none',
                  background: (!hasNoteInput || noteLoading) ? '#D1D5DB' : noteSaving ? '#86EFAC' : '#20CD8D',
                  color: '#fff',
                  cursor: (noteSaving || !hasNoteInput || noteLoading) ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  opacity: (!hasNoteInput || noteLoading) ? 0.7 : 1,
                  minHeight: 40,
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
let cachedChannelId: string | null = null;
let cachedChannelIdAt = 0;

const resolveChannelId = async (): Promise<string | null> => {
  const now = Date.now();
  if (cachedChannelId && now - cachedChannelIdAt < 24 * 60 * 60 * 1000) return cachedChannelId;
  try {
    const res = await fetch(`https://www.youtube.com/@${CHANNEL_HANDLE}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const m = html.match(/"channelId":"(UC[^"]+)"/) || html.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (m) {
      cachedChannelId = m[1];
      cachedChannelIdAt = now;
      return cachedChannelId;
    }
  } catch {}
  return null;
};

let cachedVideos: Array<{ videoId: string; title: string; publishedAt: string }> = [];
let cachedVideosAt = 0;

const fetchChannelVideos = async (channelId: string) => {
  const now = Date.now();
  if (cachedVideos.length > 0 && now - cachedVideosAt < 30 * 60 * 1000) return cachedVideos;
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
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
  } catch {
    return [];
  }
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const now = new Date();
  const todayDow = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - todayDow);
  sunday.setHours(0, 0, 0, 0);
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);

  let videos: Video[] = [];
  const channelId = await resolveChannelId();
  if (channelId) {
    const all = await fetchChannelVideos(channelId);
    const weekVids = all
      .map((v) => ({ ...v, pub: new Date(v.publishedAt) }))
      .filter((v) => v.pub >= sunday && v.pub < nextSunday)
      // 새벽기도 영상만 포함 (주일예배, 수요예배 등은 제외)
      .filter((v) => /새벽/.test(v.title))
      .map((v) => ({ videoId: v.videoId, title: v.title, publishedAt: v.publishedAt, dow: v.pub.getDay() }));
    const byDow = new Map<number, Video>();
    for (const v of weekVids) {
      const existing = byDow.get(v.dow);
      if (!existing || new Date(v.publishedAt).getTime() > new Date(existing.publishedAt).getTime()) {
        byDow.set(v.dow, v);
      }
    }
    videos = Array.from(byDow.values()).sort((a, b) => a.dow - b.dow);
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
      weekStartISO: sunday.toISOString(),
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
