import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import SubHeader from '../../components/SubHeader';
import ConfirmModal from '../../components/ConfirmModal';
import ReservationSlotPicker, { EditReservationPayload } from '../../components/ReservationSlotPicker';
import type { Venue, Block, BlockGroup } from '../../components/VenueGrid';
import { getSystemAdminHref } from '../../lib/adminGuard';
import { useIsMobile } from '../../lib/useIsMobile';
import { useRequireLogin } from '../../lib/useRequireLogin';
import { useTranslation } from 'react-i18next';

type Reservation = {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  venueId?: string;
  createdBy: string;
  seriesId?: string;
  dateKey?: string;
};

type Props = {
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return { mmdd: `${m}/${day}`, dow: labels[d.getDay()], hm: `${hh}:${mm}` };
};

const MyReservationsPage = ({ profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  useRequireLogin(profileId);
  const [effectiveProfileId, setEffectiveProfileId] = useState<string | null>(profileId);
  const [items, setItems] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Reservation | null>(null);
  // 편집 모달 — dashboard 와 동일한 ReservationSlotPicker(edit) 를 사용
  type ResCtx = {
    venues: Venue[];
    blocks: Block[];
    groups: BlockGroup[];
    slotMin: number;
    availableStart: string;
    availableEnd: string;
    reservationLimitMode: 'unlimited' | 'perUser';
    reservationLimitPerUser: number;
    bookingWindowMonths: 1 | 2 | 3 | 6;
  };
  const [editModalRes, setEditModalRes] = useState<Reservation | null>(null);
  const [editCtx, setEditCtx] = useState<ResCtx | null>(null);
  const [editCtxLoading, setEditCtxLoading] = useState(false);
  const [editCtxError, setEditCtxError] = useState<string | null>(null);

  const reload = async () => {
    if (!effectiveProfileId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/events?communityId=kcis&profileId=${encodeURIComponent(effectiveProfileId)}&type=reservation`);
      const d = await r.json();
      setItems((d?.events || []) as Reservation[]);
    } catch { /* noop */ } finally { setLoading(false); }
  };

  // 수정 클릭 → 컨텍스트 fetch 후 모달 오픈 (dashboard 와 동일한 흐름)
  const beginEdit = async (r: Reservation) => {
    setEditModalRes(r);
    setEditCtxError(null);
    setEditCtxLoading(true);
    try {
      const qs = new URLSearchParams();
      if (effectiveProfileId) qs.set('profileId', effectiveProfileId);
      if (email) qs.set('email', email);
      const res = await fetch(`/api/reservation-context?${qs.toString()}`);
      if (!res.ok) throw new Error('ctx load failed');
      const d = await res.json();
      setEditCtx({
        venues: d.venues || [],
        blocks: d.blocks || [],
        groups: d.groups || [],
        slotMin: d.slotMin || 30,
        availableStart: d.availableStart || '06:00',
        availableEnd: d.availableEnd || '22:00',
        reservationLimitMode: d.reservationLimitMode || 'unlimited',
        reservationLimitPerUser: d.reservationLimitPerUser || 3,
        bookingWindowMonths: (d.reservationBookingWindowMonths === 2 || d.reservationBookingWindowMonths === 3 || d.reservationBookingWindowMonths === 6) ? d.reservationBookingWindowMonths : 1,
      });
    } catch {
      setEditCtxError(t('page.myReservations.loadContextError'));
    } finally {
      setEditCtxLoading(false);
    }
  };
  const closeEditModal = () => {
    setEditModalRes(null);
    setEditCtx(null);
    setEditCtxError(null);
  };

  const onDelete = (r: Reservation) => setConfirmTarget(r);
  const performDelete = async () => {
    if (!effectiveProfileId || !confirmTarget) return;
    const r = confirmTarget;
    setDeletingId(r.id);
    try {
      const seriesId = (r as any).seriesId || r.id;
      const qs = new URLSearchParams({ id: seriesId, profileId: effectiveProfileId, scope: 'all' });
      const res = await fetch(`/api/events?${qs.toString()}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        alert(j?.error || t('page.myReservations.deleteFailed'));
        return;
      }
      setConfirmTarget(null);
      await reload();
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!effectiveProfileId) {
      try {
        const p = window.localStorage.getItem('kcisProfileId');
        if (p) setEffectiveProfileId(p);
      } catch {}
    }
  }, [effectiveProfileId]);

  useEffect(() => {
    void reload();
    // reload reads effectiveProfileId; deps 는 해당 id 만 필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveProfileId]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...(items || [])].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return {
      upcoming: sorted.filter((x) => new Date(x.endAt).getTime() >= now),
      past: sorted.filter((x) => new Date(x.endAt).getTime() < now).reverse(),
    };
  }, [items]);

  return (
    <>
      <Head>
        <title>ONCELL | 장소예약</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader
        profileId={profileId}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref}
      />

      <main style={{ maxWidth: 840, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: '1.25rem' }}>
        <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>{t('page.myReservations.title')}</h2>
            <Link
              href={`/reservations/grid${effectiveProfileId ? `?profileId=${encodeURIComponent(effectiveProfileId)}` : ''}`}
              style={{ padding: '0.5rem 1rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: '#fff', color: 'var(--color-primary)', fontWeight: 800, fontSize: '0.86rem', textDecoration: 'none' }}
            >
              {t('page.myReservations.newReservation')}
            </Link>
          </div>

          {!effectiveProfileId ? (
            <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem' }}>{t('page.myReservations.pleaseLogin')}</p>
          ) : loading ? (
            <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem' }}>{t('page.common.loading')}</p>
          ) : (
            <>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.92rem', color: '#3F6212', fontWeight: 800 }}>{t('page.myReservations.upcomingCount', { count: upcoming.length })}</h3>
                {upcoming.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>{t('page.myReservations.noUpcoming')}</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
                    {upcoming.map((r) => {
                      const s = fmtDateTime(r.startAt);
                      const e = fmtDateTime(r.endAt);
                      const isDeleting = deletingId === r.id;
                      const isLoadingEdit = editCtxLoading && editModalRes?.id === r.id;
                      return (
                        <li
                          key={r.id + r.startAt}
                          style={{
                            padding: '0.85rem 1rem',
                            borderRadius: 12,
                            background: '#ECFCCB',
                            border: '1px solid #D9F09E',
                            display: 'grid',
                            gap: '0.35rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--color-ink)' }}>{s.mmdd} ({s.dow})</span>
                            <span style={{ fontSize: '0.92rem', color: 'var(--color-ink)', fontWeight: 700 }}>{s.hm}~{e.hm}</span>
                            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.3rem' }}>
                              <button
                                type="button"
                                onClick={() => beginEdit(r)}
                                disabled={isDeleting || isLoadingEdit}
                                style={{ padding: '0.25rem 0.6rem', minHeight: 32, borderRadius: 8, border: '1px solid #65A30D', background: '#fff', color: '#3F6212', fontSize: '0.78rem', fontWeight: 800, cursor: (isDeleting || isLoadingEdit) ? 'not-allowed' : 'pointer' }}
                              >{isLoadingEdit ? t('page.myReservations.opening') : t('page.common.editBtn')}</button>
                              <button
                                type="button"
                                onClick={() => onDelete(r)}
                                disabled={isDeleting}
                                style={{ padding: '0.25rem 0.6rem', minHeight: 32, borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: '0.78rem', fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer' }}
                              >{isDeleting ? t('page.myReservations.deleting') : t('page.common.deleteBtn')}</button>
                            </span>
                          </div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--color-ink)' }}>{r.title}</div>
                          {r.location && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>📍 {r.location}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {past.length > 0 && (
                <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--color-ink-2)', fontWeight: 800 }}>{t('page.myReservations.pastCount', { count: past.length })}</h3>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                    {past.slice(0, 10).map((r) => {
                      const s = fmtDateTime(r.startAt);
                      const e = fmtDateTime(r.endAt);
                      return (
                        <li
                          key={r.id + r.startAt}
                          style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: 10,
                            background: '#F9FAFB',
                            border: '1px solid var(--color-gray)',
                            color: 'var(--color-ink-2)',
                            fontSize: isMobile ? '0.8rem' : '0.85rem',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.4rem',
                            alignItems: 'baseline',
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{s.mmdd} ({s.dow})</span>
                          <span>{s.hm}~{e.hm}</span>
                          <span>· {r.title}</span>
                          {r.location && <span>· {r.location}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {editModalRes && (() => {
        const r = editModalRes;
        const venueId = r.venueId || (editCtx?.venues || []).find((v) => r.location?.includes(`(${v.code})`))?.id || '';
        const fixedVenue = (editCtx?.venues || []).find((v) => v.id === venueId);
        const dateStr = r.startAt.slice(0, 10);
        const startDate = new Date(r.startAt);
        const endDate = new Date(r.endAt);
        const startMin = startDate.getHours() * 60 + startDate.getMinutes();
        const endMin = endDate.getHours() * 60 + endDate.getMinutes();
        const editPayload: EditReservationPayload = {
          id: r.id,
          seriesId: r.seriesId || r.id,
          dateKey: r.dateKey || dateStr,
          date: dateStr,
          venueId,
          startMin,
          endMin,
          description: r.description || r.title || '',
        };
        return (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) closeEditModal(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem' }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('page.myReservations.editDialogLabel')}
              style={{
                width: '100%',
                maxWidth: 1100,
                maxHeight: isMobile ? '94dvh' : '92vh',
                background: '#fff',
                borderRadius: isMobile ? '18px 18px 0 0' : 16,
                boxShadow: '0 -8px 40px rgba(0,0,0,0.22)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
            >
              <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>{t('page.myReservations.editTitle')}</h3>
                <button type="button" onClick={closeEditModal} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40 }}>✕</button>
              </div>
              <div style={{ padding: isMobile ? '0.85rem 0.75rem 1.5rem' : '1.1rem 1.2rem', overflowY: 'auto', display: 'grid', gap: isMobile ? '0.85rem' : '1rem' }}>
                {editCtxLoading ? (
                  <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>{t('page.myReservations.loadingContext')}</p>
                ) : editCtxError ? (
                  <p style={{ margin: 0, color: '#B91C1C', fontSize: '0.9rem', fontWeight: 700, textAlign: 'center', padding: '1rem 0' }}>⚠ {editCtxError}</p>
                ) : editCtx && fixedVenue ? (
                  <ReservationSlotPicker
                    mode="edit"
                    venues={editCtx.venues}
                    blocks={editCtx.blocks}
                    groups={editCtx.groups}
                    slotMin={editCtx.slotMin}
                    availableStart={editCtx.availableStart}
                    availableEnd={editCtx.availableEnd}
                    reservationLimitMode={editCtx.reservationLimitMode}
                    bookingWindowMonths={editCtx.bookingWindowMonths}
                    reservationLimitPerUser={editCtx.reservationLimitPerUser}
                    profileId={effectiveProfileId}
                    displayName={displayName}
                    contact={null}
                    nickname={nickname}
                    email={email}
                    isAdmin={!!systemAdminHref}
                    editReservation={editPayload}
                    onSubmitted={async () => { closeEditModal(); await reload(); }}
                    onCancel={closeEditModal}
                  />
                ) : (
                  <p style={{ margin: 0, color: '#B91C1C', fontSize: '0.9rem', fontWeight: 700, textAlign: 'center', padding: '1rem 0' }}>{t('page.myReservations.venueNotFound')}</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmModal
        open={!!confirmTarget}
        title={t('page.myReservations.deleteConfirmTitle')}
        details={confirmTarget ? [
          confirmTarget.title || confirmTarget.description || '(제목 없음)',
          `${confirmTarget.startAt.slice(0, 10)} ${confirmTarget.startAt.slice(11, 16)}~${confirmTarget.endAt.slice(11, 16)}`,
          confirmTarget.location || '',
        ].filter(Boolean) : []}
        warning={t('page.myReservations.deleteWarning')}
        confirmLabel={t('page.common.deleteBtn')}
        confirmTone="danger"
        busy={!!deletingId}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={performDelete}
      />
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const profileId = typeof ctx.query.profileId === 'string' ? ctx.query.profileId : null;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;
  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  return {
    props: {
      profileId,
      displayName: nickname,
      nickname,
      email,
      systemAdminHref,
    },
  };
};

export default MyReservationsPage;
