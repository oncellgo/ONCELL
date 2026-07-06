import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import ActivityHeatmap, { HeatItem } from '../components/ActivityHeatmap';
import { useRequireLogin } from '../lib/useRequireLogin';
import { useSession } from '../lib/useSession';

const ReadingArchivePage = () => {
  const { profileId, nickname, email } = useSession();
  useRequireLogin();

  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();

  useEffect(() => {
    if (!profileId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/completions?profileId=${encodeURIComponent(profileId)}&type=reading&from=${year}-01-01&to=${year}-12-31`);
        const d = await r.json();
        if (alive) setDates(Array.isArray(d.dates) ? d.dates : []);
      } catch {
        if (alive) setDates([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [profileId, year]);

  const items = useMemo<HeatItem[]>(() => dates.map((date) => ({ date })), [dates]);

  const exportCsv = () => {
    const rows = [['날짜', '통독'], ...[...dates].sort().map((d) => [d, '완료'])];
    const esc = (c: string) => `"${String(c).replace(/"/g, '""')}"`;
    const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oncell-reading-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head><title>ONCELL | 나의 통독 아카이브</title></Head>
      <AppShell profileId={profileId} badge="나의 통독 아카이브" displayName={nickname || (email ? email.split('@')[0] : null)} nickname={nickname} email={email}>
        {!profileId ? (
          <section style={{ padding: '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
            <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>로그인 후 이용할 수 있습니다.</p>
          </section>
        ) : (
          <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'grid', gap: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-ink)' }}>나의 통독 아카이브</h1>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)' }}>셀을 클릭하면 해당 주의 완료일이 하단에 표시됩니다.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.7rem 0.9rem', borderRadius: 12, background: 'var(--color-primary-tint)', border: '1px solid var(--color-surface-border)' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary-deep)' }}>
                올해 총 통독 <strong style={{ fontSize: '1.05rem' }}>{dates.length}</strong> 일
              </span>
              <button type="button" onClick={exportCsv} style={{ padding: '0.4rem 0.7rem', minHeight: 34, borderRadius: 8, background: '#fff', border: '1px solid var(--color-surface-border)', color: 'var(--color-ink)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>⭳ Excel</button>
            </div>

            <ActivityHeatmap
              now={now}
              loading={loading}
              items={items}
              renderDetail={(_m, _w, weekItems) => (
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {weekItems.map((n) => (
                    <div key={n.date} style={{ padding: '0.6rem 0.8rem', borderRadius: 10, background: 'var(--color-surface-muted)', border: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span aria-hidden style={{ color: 'var(--color-primary-deep)', fontWeight: 800 }}>✓</span>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-ink)' }}>
                        {new Date(n.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>통독 완료</span>
                    </div>
                  ))}
                </div>
              )}
            />
          </div>
        )}
      </AppShell>
    </>
  );
};

export default ReadingArchivePage;
