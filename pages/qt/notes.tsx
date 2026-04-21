import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useRequireLogin } from '../../lib/useRequireLogin';

type ReflectionRecord = { text: string; savedAt: string; reference?: string | null };

const QtNotesPage = () => {
  const router = useRouter();
  const profileId = typeof router.query.profileId === 'string' ? router.query.profileId : null;
  useRequireLogin(profileId);
  const nickname = typeof router.query.nickname === 'string' ? router.query.nickname : null;
  const email = typeof router.query.email === 'string' ? router.query.email : null;

  const [month, setMonth] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [entries, setEntries] = useState<Record<string, ReflectionRecord>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const prefix = useMemo(() => (profileId ? `qt-reflection:${profileId}:` : null), [profileId]);

  useEffect(() => {
    if (!prefix || typeof window === 'undefined') return;
    const map: Record<string, ReflectionRecord> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as ReflectionRecord;
        if (parsed.text && parsed.text.trim().length > 0) {
          const date = key.slice(prefix.length);
          map[date] = parsed;
        }
      } catch {}
    }
    setEntries(map);
  }, [prefix, selectedDate]);

  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const first = new Date(year, monthIdx, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, monthIdx, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = new Date().toISOString().slice(0, 10);
  const monthLabel = month.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  const openDate = (d: Date) => {
    const key = d.toISOString().slice(0, 10);
    setSelectedDate(key);
    setEditingText(entries[key]?.text || '');
  };

  const saveSelected = () => {
    if (!selectedDate || !prefix || typeof window === 'undefined') return;
    const savedAt = new Date().toISOString();
    const existing = entries[selectedDate];
    const record: ReflectionRecord = { text: editingText, savedAt, reference: existing?.reference ?? null };
    if (editingText.trim()) {
      window.localStorage.setItem(prefix + selectedDate, JSON.stringify(record));
    } else {
      window.localStorage.removeItem(prefix + selectedDate);
    }
    setEntries((prev) => {
      const next = { ...prev };
      if (editingText.trim()) next[selectedDate] = record;
      else delete next[selectedDate];
      return next;
    });
  };

  const closeDetail = () => setSelectedDate(null);
  const selectedRecord = selectedDate ? entries[selectedDate] : null;

  return (
    <>
      <Head>
        <title>KCIS | 큐티 묵상노트</title>
      </Head>
      <AppShell profileId={profileId} badge="큐티 묵상노트" displayName={nickname || (email ? email.split('@')[0] : null)} nickname={nickname} email={email}>
        <section style={{ width: '100%', maxWidth: 360, margin: '0 auto', padding: '0.7rem 0.85rem', borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={() => setMonth(new Date(year, monthIdx - 1, 1))} style={{ background: 'transparent', border: 'none', padding: '0.1rem 0.4rem', color: 'var(--color-ink-2)', cursor: 'pointer', fontSize: '0.9rem' }}>‹</button>
            <strong style={{ color: 'var(--color-ink)', fontSize: '0.88rem', letterSpacing: '-0.01em' }}>{monthLabel}</strong>
            <button type="button" onClick={() => setMonth(new Date(year, monthIdx + 1, 1))} style={{ background: 'transparent', border: 'none', padding: '0.1rem 0.4rem', color: 'var(--color-ink-2)', cursor: 'pointer', fontSize: '0.9rem' }}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.15rem' }}>
            {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
              <span key={w} style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--color-ink-2)' }}>
                {w}
              </span>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.15rem' }}>
            {cells.map((d, idx) => {
              if (!d) return <span key={idx} />;
              const key = d.toISOString().slice(0, 10);
              const hasEntry = !!entries[key];
              const isToday = key === todayKey;
              const dow = d.getDay();
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => openDate(d)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: isToday ? 800 : 600,
                    color: hasEntry ? '#ffffff' : isToday ? 'var(--color-primary-deep)' : dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink)',
                    background: hasEntry ? 'var(--color-primary)' : isToday ? 'var(--color-primary-tint)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  {d.getDate()}
                  {isToday && <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', fontSize: '0.48rem', fontWeight: 800, color: hasEntry ? '#fff' : 'var(--color-primary-deep)', lineHeight: 1 }}>오늘</span>}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ink-2)', fontSize: '0.68rem', paddingTop: '0.15rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--color-primary)' }} /> 묵상 기록
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--color-primary-tint)' }} /> 오늘
            </span>
          </div>
        </section>

        {selectedDate && (
          <section style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '1.1rem 1.25rem', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--color-ink)', fontSize: '1rem' }}>
                  {new Date(selectedDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                </strong>
                {selectedRecord?.reference && (
                  <span style={{ display: 'inline-flex', padding: '0.2rem 0.6rem', borderRadius: 999, background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.75rem' }}>
                    본문 · {selectedRecord.reference}
                  </span>
                )}
              </div>
              <button type="button" onClick={closeDetail} style={{ background: 'transparent', border: 'none', color: 'var(--color-ink-2)', fontSize: '1rem', cursor: 'pointer', padding: '0.2rem 0.4rem' }}>✕</button>
            </div>

            <span style={{ color: 'var(--color-ink-2)', fontSize: '0.78rem' }}>
              {selectedRecord
                ? `기록일: ${new Date(selectedRecord.savedAt).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : '아직 기록된 묵상이 없어요. 아래에 작성해 주세요.'}
            </span>

            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <span style={{ color: 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700 }}>묵상 나눔</span>
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                placeholder="이 날 받은 은혜를 기록해 보세요."
                rows={6}
                style={{ padding: '0.8rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: 'var(--color-surface-muted)', color: 'var(--color-ink)', fontSize: '0.92rem', lineHeight: 1.6, resize: 'vertical', fontFamily: 'var(--font-sans)', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={saveSelected} style={{ padding: '0.55rem 1.1rem', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: 'var(--shadow-button)' }}>저장</button>
            </div>
          </section>
        )}

        {!profileId && (
          <section style={{ padding: '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
            <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>로그인 후 이용할 수 있습니다.</p>
          </section>
        )}
      </AppShell>
    </>
  );
};

export default QtNotesPage;
