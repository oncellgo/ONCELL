import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import ActivityHeatmap, { HeatItem } from '../../components/ActivityHeatmap';
import { useRequireLogin } from '../../lib/useRequireLogin';
import { useSession } from '../../lib/useSession';

type QtNote = {
  profileId: string;
  date: string; // YYYY-MM-DD
  reference: string | null;
  feelings?: string;
  decision?: string;
  prayer?: string;
  text?: string;
  updatedAt?: string;
};

const QtNotesPage = () => {
  const { profileId, nickname, email } = useSession();
  useRequireLogin();

  const [notes, setNotes] = useState<QtNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/qt-notes?profileId=${encodeURIComponent(profileId)}`);
        const d = await r.json();
        if (alive) setNotes(Array.isArray(d.notes) ? d.notes : []);
      } catch {
        if (alive) setNotes([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [profileId]);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const yearNotes = useMemo(() => notes.filter((n) => n.date && n.date.slice(0, 4) === String(year)), [notes, year]);

  const txtHref = profileId
    ? `/api/qt-notes-export?profileId=${encodeURIComponent(profileId)}${nickname ? `&nickname=${encodeURIComponent(nickname)}` : ''}`
    : '#';

  const exportCsv = () => {
    const header = ['날짜', '본문', '느낀 점', '나의 결단', '기도 제목'];
    const rows = [...notes]
      .filter((n) => n.date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((n) => [n.date, n.reference || '', n.feelings || n.text || '', n.decision || '', n.prayer || '']);
    const esc = (c: string) => `"${String(c).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oncell-qt-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head><title>ONCELL | 나의 묵상 아카이브</title></Head>
      <AppShell profileId={profileId} badge="나의 묵상 아카이브" displayName={nickname || (email ? email.split('@')[0] : null)} nickname={nickname} email={email}>
        {!profileId ? (
          <section style={{ padding: '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
            <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>로그인 후 이용할 수 있습니다.</p>
          </section>
        ) : (
          <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'grid', gap: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-ink)' }}>나의 묵상 아카이브</h1>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)' }}>셀을 클릭하면 해당 주의 묵상이 하단에 표시됩니다.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.7rem 0.9rem', borderRadius: 12, background: 'var(--color-primary-tint)', border: '1px solid var(--color-surface-border)' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary-deep)' }}>
                올해 총 묵상노트 <strong style={{ fontSize: '1.05rem' }}>{yearNotes.length}</strong> 건
              </span>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <a href={txtHref} style={{ padding: '0.4rem 0.7rem', minHeight: 34, display: 'inline-flex', alignItems: 'center', borderRadius: 8, background: '#fff', border: '1px solid var(--color-surface-border)', color: 'var(--color-ink)', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}>⭳ TXT</a>
                <button type="button" onClick={exportCsv} style={{ padding: '0.4rem 0.7rem', minHeight: 34, borderRadius: 8, background: '#fff', border: '1px solid var(--color-surface-border)', color: 'var(--color-ink)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>⭳ Excel</button>
              </div>
            </div>

            <ActivityHeatmap
              now={now}
              loading={loading}
              items={yearNotes as HeatItem[]}
              renderDetail={(_m, _w, weekItems) => (
                <>
                  {(weekItems as QtNote[]).map((n) => (
                    <article key={n.date} style={{ padding: '0.75rem 0.85rem', borderRadius: 10, background: 'var(--color-surface-muted)', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--color-ink)' }}>
                          {new Date(n.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                        </strong>
                        {n.reference && <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 999, background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700 }}>{n.reference}</span>}
                      </div>
                      {(n.feelings || n.text) && <Field label="느낀 점" text={n.feelings || n.text || ''} />}
                      {n.decision && <Field label="나의 결단" text={n.decision} />}
                      {n.prayer && <Field label="기도 제목" text={n.prayer} />}
                    </article>
                  ))}
                </>
              )}
            />
          </div>
        )}
      </AppShell>
    </>
  );
};

const Field = ({ label, text }: { label: string; text: string }) => (
  <div style={{ display: 'grid', gap: '0.15rem' }}>
    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{label}</span>
    <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--color-ink)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{text}</p>
  </div>
);

export default QtNotesPage;
