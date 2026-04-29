import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

type Mode = 'interview' | 'waitlist';

const COPY: Record<Mode, { title: string; sub: string; cta: string; thanks: string; showTime: boolean; showNote: boolean }> = {
  interview: {
    title: '30분 인터뷰 참여',
    sub: '제품을 만들기 전에 당신의 일상을 듣고 싶어요. 줌 또는 카페에서 30분, 사례비 안내드립니다.',
    cta: '인터뷰 신청',
    thanks: '신청 감사합니다. 운영자가 1-2일 안에 이메일로 연락드릴게요.',
    showTime: true,
    showNote: true,
  },
  waitlist: {
    title: '베타 대기 등록',
    sub: 'ONCELL 베타가 열리면 가장 먼저 알려드립니다. 이메일 외엔 마케팅 용도로 사용하지 않습니다.',
    cta: '대기 등록',
    thanks: '등록 완료. 베타 오픈 시 이메일로 안내드립니다.',
    showTime: false,
    showNote: false,
  },
};

export default function SignupPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<Mode>('interview');

  useEffect(() => {
    const t = router.query.type;
    if (t === 'waitlist' || t === 'interview') setMode(t);
  }, [router.query.type]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const copy = COPY[mode];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: mode, name, email, time, note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `요청 실패 (${res.status})`);
      }
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || '신청 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.85rem 0.95rem',
    minHeight: 48,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <>
      <Head>
        <title>{copy.title} · ONCELL</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: isMobile ? '1.5rem 1rem 3rem' : '3rem 1.5rem 4rem', color: '#fff' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', minHeight: 36, borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)', fontSize: '0.82rem', textDecoration: 'none', marginBottom: '1.5rem', fontWeight: 600 }}>
          ← 홈으로
        </a>

        <h1 style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 800, margin: '0 0 0.6rem', color: '#fff', letterSpacing: '-0.01em' }}>
          {copy.title}
        </h1>
        <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.7, margin: '0 0 2rem' }}>
          {copy.sub}
        </p>

        {done ? (
          <div style={{ padding: '1.5rem', borderRadius: 16, background: 'rgba(165,243,252,0.08)', border: '1px solid rgba(165,243,252,0.32)', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
            <div style={{ fontWeight: 700, color: '#A5F3FC', marginBottom: '0.5rem' }}>접수 완료</div>
            <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.92rem', lineHeight: 1.65 }}>{copy.thanks}</div>
            <a href="/" style={{ display: 'inline-block', marginTop: '1.25rem', padding: '0.65rem 1.2rem', minHeight: 44, borderRadius: 10, background: '#fff', color: '#2D3850', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none' }}>
              홈으로 돌아가기
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.85rem' }}>
            <label style={{ display: 'grid', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>이름</span>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" style={inputStyle} />
            </label>

            <label style={{ display: 'grid', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>이메일</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} autoComplete="email" />
            </label>

            {copy.showTime && (
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>가능한 시간대</span>
                <input type="text" value={time} onChange={(e) => setTime(e.target.value)} placeholder="평일 저녁 7시 이후 / 주말 오전 등" style={inputStyle} />
              </label>
            )}

            {copy.showNote && (
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>한 줄 자기소개 (선택)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="신앙 강도·관심사 등 — 비워두셔도 됩니다" rows={3} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
              </label>
            )}

            {err && (
              <div style={{ padding: '0.7rem 0.85rem', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.32)', color: '#FCA5A5', fontSize: '0.85rem' }}>
                {err}
              </div>
            )}

            <button type="submit" disabled={submitting} style={{ marginTop: '0.5rem', padding: '0.95rem 1.2rem', minHeight: 50, borderRadius: 12, background: submitting ? 'rgba(255,255,255,0.5)' : '#fff', color: '#2D3850', fontWeight: 800, fontSize: '0.98rem', border: 'none', cursor: submitting ? 'wait' : 'pointer' }}>
              {submitting ? '전송 중…' : copy.cta}
            </button>

            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: '0.5rem 0 0', lineHeight: 1.6 }}>
              제출하면 ONCELL의 <a href="/privacy" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>개인정보처리방침</a>에 동의한 것으로 간주됩니다.<br />
              이메일은 본 신청 응대 외 용도로 사용되지 않습니다.
            </p>

            {mode === 'interview' && (
              <a href="/signup?type=waitlist" style={{ textAlign: 'center', marginTop: '0.5rem', color: 'rgba(255,255,255,0.55)', fontSize: '0.82rem', textDecoration: 'underline' }}>
                인터뷰는 부담돼요 → 베타 대기만 등록할래요
              </a>
            )}
          </form>
        )}
      </main>
    </>
  );
}
