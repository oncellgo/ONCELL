import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SubHeader from '../components/SubHeader';
import BiblePassageCard from '../components/BiblePassageCard';
import { getSystemAdminHref } from '../lib/adminGuard';
import { getProfiles, getUsers } from '../lib/dataStore';
import { useIsMobile } from '../lib/useIsMobile';
import { useRequireLogin } from '../lib/useRequireLogin';
import { planForDate, formatRange, dateKey as keyFor, type ReadingRange } from '../lib/readingPlan';
import { getReadingPlan, setReadingPlan, hasReadingPlan, subscribeReadingPlan, planShortLabel, type ReadingPlan } from '../lib/readingPreferences';

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

  // 통독 계획 선호도 — 1독/2독 (localStorage). null = 미지정(최초 배너 노출).
  const [readingPlanChoice, setReadingPlanChoice] = useState<ReadingPlan | null>(null);
  const [showPlanBanner, setShowPlanBanner] = useState(false);
  useEffect(() => {
    const p = getReadingPlan();
    setReadingPlanChoice(p);
    setShowPlanBanner(!hasReadingPlan());
    // ProfileModal 등 다른 컴포넌트가 플랜을 바꾸면 즉시 반영 (같은 탭 내 custom event)
    const unsub = subscribeReadingPlan((next) => {
      setReadingPlanChoice(next);
      setShowPlanBanner(false);
    });
    return () => unsub();
  }, []);
  const pickPlan = (plan: ReadingPlan) => {
    setReadingPlan(plan);
    setReadingPlanChoice(plan);
    setShowPlanBanner(false);
  };

  // 주간 계획표 캐시 — /api/reading-plan 에서 주 단위로 prefetch. 미스 시 FLAT 기반 fallback.
  const [weekPlanMap, setWeekPlanMap] = useState<Map<string, ReadingRange[]>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const planN = readingPlanChoice || 1;
    const from = keyFor(dateForDow(0));
    const to = keyFor(dateForDow(6));
    (async () => {
      try {
        const r = await fetch(`/api/reading-plan?plan=${planN}&from=${from}&to=${to}`);
        if (!r.ok) throw new Error(`status ${r.status}`);
        const d = await r.json();
        const m = new Map<string, ReadingRange[]>();
        for (const day of (d?.days || [])) {
          if (typeof day?.date === 'string' && Array.isArray(day?.ranges)) {
            m.set(day.date, day.ranges as ReadingRange[]);
          }
        }
        if (!cancelled) setWeekPlanMap(m);
      } catch (e) {
        // 네트워크/DB 실패 시 FLAT 기반 로컬 계산으로 graceful degrade
        console.warn('[reading] plan fetch failed, using local fallback', e);
        if (!cancelled) setWeekPlanMap(new Map());
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, readingPlanChoice]);

  const getRangesFor = (d: Date): ReadingRange[] => {
    const k = keyFor(d);
    const hit = weekPlanMap.get(k);
    if (hit && hit.length > 0) return hit;
    return planForDate(d); // FLAT 기반 fallback
  };

  const reading = useMemo(() => getRangesFor(selectedDate), [selectedKey, weekPlanMap]);

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

  // ── 오디오 듣기 ────────────────────────────────────────────────────
  // Phase 2 기본: Google Cloud TTS (서버 proxy /api/tts) + <audio> 재생.
  // Fallback: 브라우저 SpeechSynthesis (네트워크/설정 실패 시).
  // 텍스트는 절(verse) 단위로 나눠 순차 재생 — Google 단일 요청 5KB 한도 대응 + 중단/속도변경 유연.
  const [speakSupported, setSpeakSupported] = useState(false);
  const [speakState, setSpeakState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [speakRate, setSpeakRate] = useState<number>(2);
  // 'unknown' = 첫 재생 시 결정. 'remote' = /api/tts 사용. 'browser' = SpeechSynthesis fallback.
  const [ttsMode, setTtsMode] = useState<'unknown' | 'remote' | 'browser'>('unknown');
  const speakQueueRef = useRef<string[]>([]);
  const speakIdxRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 원격 TTS 는 <audio> 로 재생(사실상 모든 환경 지원), 브라우저 fallback 은 SpeechSynthesis.
    // 둘 중 하나라도 가능하면 UI 노출.
    const audioOk = typeof window.HTMLAudioElement !== 'undefined';
    const browserOk = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    setSpeakSupported(audioOk || browserOk);
    return () => {
      try { window.speechSynthesis?.cancel(); } catch {}
      try { audioRef.current?.pause(); } catch {}
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, []);

  // 날짜 바뀌면 재생 중지
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.speechSynthesis?.cancel(); } catch {}
    try { audioRef.current?.pause(); } catch {}
    if (audioRef.current) audioRef.current.src = '';
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    setSpeakState('idle');
    speakQueueRef.current = [];
    speakIdxRef.current = 0;
  }, [selectedKey]);

  // 한자어 숫자 변환 (브라우저 TTS 기본 고유어 읽기 "스물아홉" 교정).
  // 성경 장/절은 반드시 한자어 ("이십구장 십오절").
  const sinoKorean = (n: number): string => {
    if (!Number.isFinite(n) || n < 0) return String(n);
    if (n === 0) return '영';
    const ones = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    if (n < 10) return ones[n];
    if (n < 20) return '십' + (n === 10 ? '' : ones[n - 10]);
    if (n < 100) {
      const t = Math.floor(n / 10);
      const o = n % 10;
      return ones[t] + '십' + (o === 0 ? '' : ones[o]);
    }
    if (n < 1000) {
      const h = Math.floor(n / 100);
      const rest = n % 100;
      return (h === 1 ? '' : ones[h]) + '백' + (rest === 0 ? '' : sinoKorean(rest));
    }
    return String(n);
  };

  // TTS 전처리: 성경 장/절 문맥의 숫자만 한자어로 치환. 본문 내 '삼백 명' 같은 이미 한글인 표현은 건드리지 않음.
  const hangulizeForSpeech = (text: string): string => {
    let s = text;
    // "1-3장" 범위
    s = s.replace(/(\d+)\s*-\s*(\d+)\s*장/g, (_, a, b) => `${sinoKorean(+a)}장에서 ${sinoKorean(+b)}장까지`);
    // 장:절 (예: "29:15")
    s = s.replace(/(\d+):(\d+)/g, (_, c, v) => `${sinoKorean(+c)}장 ${sinoKorean(+v)}절`);
    // 단일 "N장"
    s = s.replace(/(\d+)\s*장/g, (_, n) => `${sinoKorean(+n)}장`);
    // 단일 "N절"
    s = s.replace(/(\d+)\s*절/g, (_, n) => `${sinoKorean(+n)}절`);
    return s;
  };

  const buildSpeakChunks = (): string[] => {
    // reading 순회 → 각 범위의 ko 텍스트 → 줄 단위 분할 → 한자어 치환
    // 본문 포맷 (lib/bible.ts formatVerses):
    //   [1장]
    //   1 태초에 하나님이 천지를 창조하시니라
    //   2 땅이 혼돈하고 ...
    // → 장 머리말은 "N장." 으로 안내, 절 앞 숫자는 **제거** (낭독 흐름 방해 방지)
    const out: string[] = [];
    for (const r of reading) {
      const ref = r.startCh === r.endCh ? `${r.book} ${r.startCh}장` : `${r.book} ${r.startCh}-${r.endCh}장`;
      const ko = passageTexts[ref]?.ko?.trim();
      if (!ko) continue;
      // 범위 시작 안내 (한 번만): "창세기 이십구장."
      out.push(hangulizeForSpeech(ref + '.'));
      for (const rawLine of ko.split(/\n+/)) {
        const line = rawLine.trim();
        if (!line) continue;
        // 장 머리말 "[N장]" → "N장." (여러 장 묶인 경우 전환 알림)
        const chapM = line.match(/^\[(\d+)\s*장\]$/);
        if (chapM) {
          out.push(sinoKorean(+chapM[1]) + '장.');
          continue;
        }
        // 절 머리말 "N 본문" → 본문만 추출 (절 번호 미독)
        const verseM = line.match(/^(\d+)\s+(.+)$/);
        if (verseM) {
          out.push(verseM[2].trim());
          continue;
        }
        out.push(hangulizeForSpeech(line));
      }
    }
    return out;
  };

  // 절 끝 syllable 체크 → 짧은 호흡 pause (2배속 기준 ≈1글자 = 100ms)
  const VERSE_END_CHARS = new Set(['니', '고', '다', '까', '요', '오', '라', '며', '나', '마']);
  const VERSE_PAUSE_MS = 100;
  const needsVersePause = (text: string): boolean => {
    const stripped = text.replace(/[.。!?~\s]+$/, '');
    return VERSE_END_CHARS.has(stripped.slice(-1));
  };

  // 브라우저 TTS 한 chunk 재생
  const speakBrowserChunk = (rate: number) => {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    const q = speakQueueRef.current;
    const i = speakIdxRef.current;
    if (i >= q.length) { setSpeakState('idle'); return; }
    const u = new SpeechSynthesisUtterance(q[i]);
    u.lang = 'ko-KR';
    u.rate = rate;
    u.pitch = 1;
    u.onend = () => {
      const justFinished = q[i] || '';
      speakIdxRef.current = i + 1;
      if (speakIdxRef.current >= q.length) { setSpeakState('idle'); return; }
      const pause = needsVersePause(justFinished) ? VERSE_PAUSE_MS : 0;
      if (pause > 0) setTimeout(() => speakBrowserChunk(rate), pause);
      else speakBrowserChunk(rate);
    };
    u.onerror = () => setSpeakState('idle');
    synth.speak(u);
  };

  // 원격 TTS: 현재 idx 의 텍스트를 /api/tts 에서 받아 <audio> 로 재생. onended 에서 다음 idx.
  const speakRemoteChunk = async (rate: number): Promise<void> => {
    const q = speakQueueRef.current;
    const i = speakIdxRef.current;
    const audio = audioRef.current;
    if (!audio) return;
    if (i >= q.length) { setSpeakState('idle'); return; }
    try {
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q[i] }),
      });
      if (!r.ok) {
        // 첫 chunk 에서 실패 → 브라우저 TTS 로 fallback
        if (i === 0 && ttsMode !== 'browser') {
          console.warn('[tts] remote failed, falling back to browser', r.status);
          setTtsMode('browser');
          speakBrowserChunk(rate);
          return;
        }
        console.error('[tts] remote chunk failed, stopping', r.status);
        setSpeakState('idle');
        return;
      }
      const blob = await r.blob();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      audio.src = url;
      audio.playbackRate = rate;
      await audio.play();
    } catch (e) {
      if (i === 0 && ttsMode !== 'browser') {
        console.warn('[tts] remote network error, falling back to browser', e);
        setTtsMode('browser');
        speakBrowserChunk(rate);
        return;
      }
      console.error('[tts] remote network error', e);
      setSpeakState('idle');
    }
  };

  const handleSpeakPlay = () => {
    if (typeof window === 'undefined') return;
    // paused → resume
    if (speakState === 'paused') {
      if (ttsMode === 'browser') {
        window.speechSynthesis.resume();
      } else if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
      setSpeakState('playing');
      return;
    }
    // fresh start
    try { window.speechSynthesis?.cancel(); } catch {}
    try { audioRef.current?.pause(); } catch {}
    const chunks = buildSpeakChunks();
    if (chunks.length === 0) return;
    speakQueueRef.current = chunks;
    speakIdxRef.current = 0;
    setSpeakState('playing');
    // 첫 시도는 remote. 실패 시 내부에서 fallback.
    if (ttsMode === 'browser') speakBrowserChunk(speakRate);
    else { setTtsMode('remote'); void speakRemoteChunk(speakRate); }
  };

  const handleSpeakPause = () => {
    if (typeof window === 'undefined') return;
    if (ttsMode === 'browser') {
      window.speechSynthesis.pause();
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
    setSpeakState('paused');
  };

  const handleSpeakStop = () => {
    if (typeof window === 'undefined') return;
    try { window.speechSynthesis?.cancel(); } catch {}
    try { audioRef.current?.pause(); } catch {}
    if (audioRef.current) audioRef.current.src = '';
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    speakQueueRef.current = [];
    speakIdxRef.current = 0;
    setSpeakState('idle');
  };

  const handleSpeakRate = (r: number) => {
    setSpeakRate(r);
    if (speakState === 'idle') return;
    if (ttsMode === 'browser') {
      // SpeechSynthesis 는 mid-utterance rate 변경 불가 → 현재 idx 부터 재시작
      try { window.speechSynthesis?.cancel(); } catch {}
      setTimeout(() => {
        if (speakQueueRef.current.length > 0 && speakIdxRef.current < speakQueueRef.current.length) {
          setSpeakState('playing');
          speakBrowserChunk(r);
        }
      }, 60);
    } else if (audioRef.current) {
      // <audio> 는 playbackRate 즉시 반영 (재생 유지)
      audioRef.current.playbackRate = r;
    }
  };

  // <audio> 재생 끝 → (필요 시 pause 후) 다음 chunk
  const handleAudioEnded = () => {
    const justFinished = speakQueueRef.current[speakIdxRef.current] || '';
    speakIdxRef.current += 1;
    if (speakIdxRef.current >= speakQueueRef.current.length) {
      setSpeakState('idle');
      return;
    }
    const pause = needsVersePause(justFinished) ? VERSE_PAUSE_MS : 0;
    if (pause > 0) setTimeout(() => { void speakRemoteChunk(speakRate); }, pause);
    else void speakRemoteChunk(speakRate);
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
          </div>

          {/* 최초 진입 soft 배너 — 플랜 미지정 사용자만 노출. 한 번 선택하면 사라짐. 설정에서 언제든 변경. */}
          {showPlanBanner && (
            <div style={{ padding: isMobile ? '0.7rem 0.8rem' : '0.85rem 1rem', borderRadius: 12, background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <span aria-hidden style={{ fontSize: '1.05rem' }}>📖</span>
                <strong style={{ fontSize: '0.88rem', color: '#1E40AF' }}>어떤 속도로 통독하시겠어요?</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#1E3A8A', lineHeight: 1.55 }}>
                한 번만 선택하면 됩니다. 나중에 설정(⚙️)에서 변경 가능해요. 선택하지 않으면 기본 1독으로 시작합니다.
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => pickPlan(1)}
                  style={{ flex: 1, minHeight: 44, padding: '0.55rem 0.8rem', borderRadius: 8, border: '1px solid #2563EB', background: '#fff', color: '#1E40AF', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'grid', gap: '0.15rem' }}
                >
                  <span>1독</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.8 }}>하루 3-4장</span>
                </button>
                <button
                  type="button"
                  onClick={() => pickPlan(2)}
                  style={{ flex: 1, minHeight: 44, padding: '0.55rem 0.8rem', borderRadius: 8, border: '1px solid #2563EB', background: '#fff', color: '#1E40AF', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'grid', gap: '0.15rem' }}
                >
                  <span>2독</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.8 }}>하루 6-7장 · 도전적</span>
                </button>
              </div>
            </div>
          )}

          {/* 7일 캘린더 — QT와 동일한 디자인 */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: isMobile ? '0.2rem' : '0.3rem' }}>
            <button
              type="button" onClick={goPrev} aria-label={t('page.reading.navPrev')}
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
                const ranges = getRangesFor(d);
                const planLabel = ranges.map(formatRange).join(' · ');
                const isDayCompleted = completedSet.has(k);
                const dowColor = dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink)';
                return (
                  <button
                    key={dow} type="button" onClick={() => setSelectedDow(dow)}
                    title={planLabel}
                    style={{
                      padding: isMobile ? '0.3rem 0.1rem' : '0.4rem 0.25rem',
                      border: isSelected ? '2px solid #20CD8D' : isDayCompleted ? '2px solid #20CD8D' : '1px solid var(--color-gray)',
                      borderRadius: 8,
                      background: '#fff',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: isSelected ? '0 2px 6px rgba(32,205,141,0.28)' : 'none',
                      display: 'grid', gap: isMobile ? '0.12rem' : '0.18rem',
                      minHeight: isMobile ? 60 : 72, minWidth: 0, position: 'relative',
                    }}
                  >
                    {isDayCompleted && (
                      <span aria-hidden style={{
                        position: 'absolute', top: 3, right: 4,
                        width: 14, height: 14, borderRadius: 999,
                        background: '#20CD8D', color: '#fff',
                        fontSize: 9, fontWeight: 900,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1,
                      }}>✓</span>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.15rem', lineHeight: 1 }}>
                      <span style={{ fontSize: isMobile ? '0.72rem' : '0.85rem', fontWeight: 800, color: isDayCompleted ? 'var(--color-primary-deep)' : dowColor, lineHeight: 1 }}>
                        {m}/{day}
                      </span>
                      {isToday ? (
                        <span className="kcis-today-pulse" style={{
                          fontSize: isMobile ? '0.68rem' : '0.75rem',
                          fontWeight: 900,
                          color: '#20CD8D',
                          lineHeight: 1,
                          padding: '0.08rem 0.4rem',
                          borderRadius: 999,
                          background: 'rgba(32, 205, 141, 0.15)',
                          border: '1px solid #20CD8D',
                          letterSpacing: '-0.02em',
                          animation: 'kcis-today-pulse 2s ease-in-out infinite',
                        }}>오늘</span>
                      ) : (
                        <span style={{ fontSize: isMobile ? '0.58rem' : '0.66rem', fontWeight: 700, color: isDayCompleted ? 'var(--color-primary-deep)' : dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : 'var(--color-ink-2)', lineHeight: 1 }}>
                          {DAY_LABELS[dow]}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button" onClick={goNext} aria-label={t('page.reading.navNext')}
              style={{ padding: isMobile ? '0 0.4rem' : '0 0.45rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', cursor: 'pointer', fontSize: isMobile ? '1.1rem' : '0.9rem', fontWeight: 800, flexShrink: 0, minWidth: 44, minHeight: 44 }}
            >›</button>
          </div>

          {/* 선택된 날짜의 통독 범위 — 본문 스크롤 중에도 완료 토글·오디오 접근 가능하도록 sticky */}
          <div style={{ padding: isMobile ? '0.9rem' : '1.1rem', borderRadius: 12, background: '#ECFCCB', border: '1px solid #D9F09E', display: 'grid', gap: '0.6rem', position: 'sticky', top: isMobile ? 88 : 100, zIndex: 10, boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#65A30D', textTransform: 'uppercase' }}>
                  {selectedDate.getFullYear()}.{String(selectedDate.getMonth() + 1).padStart(2, '0')}.{String(selectedDate.getDate()).padStart(2, '0')} ({DAY_LABELS[selectedDate.getDay()]})
                </span>
                <span style={{ padding: '0.1rem 0.5rem', borderRadius: 999, background: '#fff', color: '#65A30D', fontSize: '0.68rem', fontWeight: 800, border: '1px solid #65A30D' }}>
                  {(readingPlanChoice || 1) === 2 ? '1년에 2독 목표' : '1년에 1독 목표'}
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
                  <span>{busy ? t('page.reading.toggleLoading') : isCompleted ? t('page.reading.toggleComplete') : t('page.reading.togglePending')}</span>
                </button>
                {toggleError && (
                  <span style={{ fontSize: '0.7rem', color: '#B91C1C', fontWeight: 700 }}>⚠ {toggleError}</span>
                )}
              </div>
            </div>
            {/* 🔊 간단 오디오 컨트롤 — 연라임 카드 안에 내장 */}
            {reading.length > 0 && !passageLoading && speakSupported && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.1rem' }}>
                <audio ref={audioRef} onEnded={handleAudioEnded} preload="auto" style={{ display: 'none' }} />
                <button
                  type="button"
                  onClick={speakState === 'playing' ? handleSpeakPause : handleSpeakPlay}
                  aria-label={speakState === 'playing' ? '일시정지' : '듣기'}
                  style={{ padding: '0.35rem 0.75rem', borderRadius: 999, border: '1px solid #65A30D', background: '#fff', color: '#65A30D', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', minHeight: 36 }}
                >{speakState === 'playing' ? '⏸' : '▶'} {speakState === 'playing' ? '일시정지' : speakState === 'paused' ? '이어서' : '오디오 듣기'}</button>
                {speakState !== 'idle' && (
                  <button
                    type="button"
                    onClick={handleSpeakStop}
                    aria-label="정지"
                    style={{ padding: '0.35rem 0.6rem', borderRadius: 999, border: '1px solid #D9F09E', background: '#fff', color: '#65A30D', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', minHeight: 36 }}
                  >⏹</button>
                )}
                <span aria-hidden style={{ display: 'inline-block', width: 1, height: 22, background: '#65A30D', opacity: 0.35, margin: '0 0.4rem' }} />
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0.2rem 0.35rem', borderRadius: 8, background: 'rgba(255,255,255,0.55)', border: '1px dashed rgba(101, 163, 13, 0.35)' }}>
                  {([
                    { value: 1.25, label: '1x' },
                    { value: 1.5,  label: '1.25x' },
                    { value: 2,    label: '1.5x' },
                  ] as const).map(({ value, label }) => {
                    const active = Math.abs(speakRate - value) < 0.01;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleSpeakRate(value)}
                        style={{
                          padding: '0.25rem 0.45rem',
                          borderRadius: 6,
                          border: `${active ? 2 : 1}px solid ${active ? '#65A30D' : '#D9F09E'}`,
                          background: '#fff',
                          color: '#65A30D',
                          fontWeight: active ? 900 : 800,
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          minHeight: 30,
                          minWidth: 36,
                        }}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {reading.length === 0 && (
              <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>{t('page.reading.noAssignment')}</p>
            )}
          </div>

          {/* 말씀 본문 카드 — design.md §2.3 Bible passage rule 준수 (BiblePassageCard 사용) */}
          {reading.length > 0 && (
            passageLoading ? (
              <div style={{ padding: '0.9rem 1rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', fontSize: '0.88rem', color: 'var(--color-ink-2)' }}>{t('page.reading.loadingPassage')}</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {reading.map((r, i) => {
                  const ref = r.startCh === r.endCh ? `${r.book} ${r.startCh}장` : `${r.book} ${r.startCh}-${r.endCh}장`;
                  const texts = passageTexts[ref];
                  const noText = !texts || (!texts.ko && !texts.en);
                  if (noText) return (
                    <div key={i} style={{ padding: '0.9rem 1rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', display: 'grid', gap: '0.4rem' }}>
                      <strong style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--color-ink)' }}>{ref}</strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>{t('page.reading.passageNotFound')}</span>
                    </div>
                  );
                  return <BiblePassageCard key={i} reference={ref} koText={texts.ko || null} enText={texts.en || null} source="KCIS 통독 일정표 · 본문: 개역한글/KJV 공공영역" />;
                })}
              </div>
            )
          )}

          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-ink-2)', lineHeight: 1.6 }}>
            1월 1일부터 12월 31일까지 1년 1회 완독할 수 있도록 하루 3-4장씩 분배됩니다.
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
