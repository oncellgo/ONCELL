import { GetServerSideProps } from 'next';
import Head from 'next/head';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AppShell from '../../components/AppShell';
import { useVideo } from '../../components/VideoPlayer';
import { requireSystemAdminSSR } from '../../lib/adminGuard';
import ScheduleView from '../../components/ScheduleView';
import VenueManager from '../../components/VenueManager';
import AdminReservationsView from '../../components/AdminReservationsView';
import EtcSettings from '../../components/EtcSettings';
import SignupApprovalsCard from '../../components/SignupApprovalsCard';
import MembersCard from '../../components/MembersCard';
import AdminTabBar from '../../components/AdminTabBar';
import StatsPanel from '../../components/StatsPanel';
import { expandOccurrences, EventRow as RawEventRow } from '../../lib/recurrence';
import { getCommunities, getEvents, getWorshipServices, getProfiles, getUsers } from '../../lib/dataStore';
import { useIsMobile } from '../../lib/useIsMobile';

type Props = {
  profileId: string;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  scheduleCommunities: Array<{ id: string; name: string; timezone?: string }>;
  scheduleEvents: any[];
  scheduleWorshipServices: any[];
  scheduleDefaultCommunityId: string;
};

type AdminCommunity = {
  id: string;
  name: string;
  adminProfileId?: string;
  joinApprovalMode?: 'auto' | 'admin';
  memberCount: number;
  pendingCount: number;
  createdAt: string | null;
  latestActivityAt: string | null;
};

type AdminUser = {
  profileId: string;
  nickname?: string;
  realName?: string;
  email?: string;
  provider?: string;
  communities: string[];
  registeredAt: string | null;
  isCommunityAdmin: boolean;
};

const cardStyle: React.CSSProperties = {
  padding: '1.25rem',
  borderRadius: 16,
  background: '#ffffff',
  border: '1px solid #E7F3EE',
  boxShadow: '0 12px 32px rgba(24, 37, 39, 0.06)',
  display: 'grid',
  gap: '0.85rem',
};
const titleStyle: React.CSSProperties = { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#182527' };
const subtle: React.CSSProperties = { margin: 0, color: '#2D4048', fontSize: '0.88rem' };
const btn: React.CSSProperties = { padding: '0.55rem 0.9rem', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' };

const SystemAdminPage = ({ profileId, displayName, nickname, email, scheduleCommunities, scheduleEvents, scheduleWorshipServices, scheduleDefaultCommunityId }: Props) => {
  const router = useRouter();
  const { t } = useTranslation();
  const video = useVideo();
  const isMobile = useIsMobile();
  const k = typeof router.query.k === 'string' ? router.query.k : '';
  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}${email ? `&email=${encodeURIComponent(email)}` : ''}`;
  const authHeaders: Record<string, string> = { 'x-profile-id': profileId, 'x-admin-token': k, ...(email ? { 'x-email': email } : {}) };
  const myEmailLower = (email || '').trim().toLowerCase();
  const sectionFilter = typeof router.query.section === 'string' ? router.query.section : null;
  const subFilter = typeof router.query.sub === 'string' ? router.query.sub : null;

  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [admins, setAdmins] = useState<string[]>([]);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newAdmin, setNewAdmin] = useState('');
  const [busy, setBusy] = useState(false);
  const [userFilter, setUserFilter] = useState<'all' | 'admin'>('all');
  const [activeDays, setActiveDays] = useState<number>(30);
  const [userSort, setUserSort] = useState<'recent' | 'name'>('recent');
  const [communitySort, setCommunitySort] = useState<'createdDesc' | 'name' | 'members' | 'activity'>('createdDesc');
  type WorshipItem = { id: string; title: string; description?: string; presenter?: string; allTogether?: boolean; link?: string; passage?: string; members?: string; prayerNote?: string; songs?: { title: string; link: string }[] };
  const ytId = (url: string): string | null => {
    const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/);
    return m ? m[1] : null;
  };
  const patchItemSongs = async (itemId: string, songs: { title: string; link: string }[]) => {
    const res = await fetch(`/api/admin/worship-templates?${authQS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ id: itemId, songs }),
    });
    if (res.ok) { const d = await res.json(); setWorshipItems(d.items || []); }
  };
  type WorshipBackground = { type: 'default'; value: 'default1' | 'default2' | 'default3' } | { type: 'upload'; dataUrl: string } | null;
  const [worshipItems, setWorshipItems] = useState<WorshipItem[]>([]);
  const [worshipBackground, setWorshipBackground] = useState<WorshipBackground>({ type: 'default', value: 'default1' });
  const [worshipLogo, setWorshipLogo] = useState<{ dataUrl: string } | null>(null);
  type Announcement = { title: string; content: string; noTitle?: boolean };
  const normalizeAnnouncements = (raw: any): Announcement[] => {
    if (!Array.isArray(raw) || raw.length === 0) return [{ title: '', content: '' }];
    return raw.map((a: any) => typeof a === 'string' ? { title: '', content: a } : { title: String(a?.title ?? ''), content: String(a?.content ?? ''), ...(a?.noTitle ? { noTitle: true } : {}) });
  };
  const [worshipAnnouncements, setWorshipAnnouncements] = useState<Announcement[]>([{ title: '', content: '' }]);
  const [worshipHomepage, setWorshipHomepage] = useState('');
  const [worshipFooter, setWorshipFooter] = useState('');
  const [worshipBulletinName, setWorshipBulletinName] = useState('');
  const [worshipTheme, setWorshipTheme] = useState('');
  const [worshipLabel, setWorshipLabel] = useState('WORSHIP');
  const [worshipTime, setWorshipTime] = useState('오전 11:00');
  const [worshipLocation, setWorshipLocation] = useState('2층 사랑홀');
  const [worshipDate, setWorshipDate] = useState('');
  const computeNextSundayLabel = () => {
    const now = new Date();
    const day = now.getDay();
    const daysUntil = day === 0 ? 7 : (7 - day);
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil);
    return `${next.getFullYear()}.${next.getMonth() + 1}.${next.getDate()}(일)`;
  };
  const [worshipChurchName, setWorshipChurchName] = useState('은혜교회 청년부');
  const [worshipAnnouncementTitle, setWorshipAnnouncementTitle] = useState('광고');
  const [newWorshipTitle, setNewWorshipTitle] = useState('');
  const [newWorshipDesc, setNewWorshipDesc] = useState('');
  const [newWorshipPresenter, setNewWorshipPresenter] = useState('');
  const [editingWorship, setEditingWorship] = useState<WorshipItem | null>(null);
  const [worshipPreviewOpen, setWorshipPreviewOpen] = useState(false);
  const [songSearch, setSongSearch] = useState<{ itemId: string; songIdx: number; query: string } | null>(null);
  const [songSearchResults, setSongSearchResults] = useState<Array<{ id: string; title: string; channel: string; thumbnail: string }>>([]);
  const [songSearchLoading, setSongSearchLoading] = useState(false);
  const [lyricsQuery, setLyricsQuery] = useState<string | null>(null);

  const runSongSearch = async (q: string) => {
    if (!q.trim()) { setSongSearchResults([]); return; }
    setSongSearchLoading(true);
    try {
      const r = await fetch(`/api/youtube-search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setSongSearchResults(d.results || []);
    } catch {
      setSongSearchResults([]);
    } finally {
      setSongSearchLoading(false);
    }
  };
  const [worshipEditMode, setWorshipEditMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [songDrag, setSongDrag] = useState<{ itemId: string; from: number } | null>(null);

  const saveWorshipMeta = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/worship-templates?${authQS}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      setWorshipBackground(data.background ?? null);
      setWorshipLogo(data.logo ?? null);
      setWorshipBulletinName(data.bulletinName ?? '');
      setWorshipTheme(data.theme ?? '');
      setWorshipLabel(data.worshipLabel ?? 'WORSHIP');
      setWorshipTime(data.worshipTime ?? '오전 11:00');
      setWorshipLocation(data.worshipLocation ?? '2층 사랑홀');
      setWorshipDate(data.worshipDate ?? '');
      setWorshipChurchName(data.churchName ?? '은혜교회 청년부');
      setWorshipAnnouncementTitle(data.announcementTitle ?? '광고');
      setWorshipAnnouncements(normalizeAnnouncements(data.announcements));
      setWorshipHomepage(data.homepage ?? '');
      setWorshipFooter(data.footer ?? '');
    } catch (e: any) {
      window.alert(e?.message || '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (kind: 'background' | 'logo', file: File | null) => {
    if (!file) return;
    if (file.size > 20 * 1024) { window.alert('20KB 미만 이미지만 업로드 가능합니다.'); return; }
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { window.alert('PNG/JPG 이미지만 업로드 가능합니다.'); return; }
    const dataUrl = await readFileAsDataUrl(file);
    if (kind === 'background') await saveWorshipMeta({ background: { type: 'upload', dataUrl } });
    else await saveWorshipMeta({ logo: { dataUrl } });
  };

  const reorderWorship = async (id: string, toOrder: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/worship-templates?${authQS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ id, order: toOrder }),
      });
      if (res.ok) { const d = await res.json(); setWorshipItems(d.items || []); }
    } finally { setBusy(false); }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, uRes, aRes, wRes] = await Promise.all([
        fetch(`/api/admin/communities?${authQS}`),
        fetch(`/api/admin/users?${authQS}`),
        fetch(`/api/admin/system-admins?${authQS}`),
        fetch(`/api/admin/worship-templates?${authQS}`),
      ]);
      if (!cRes.ok || !uRes.ok || !aRes.ok) throw new Error('권한이 없거나 로드 실패');
      const [cData, uData, aData] = await Promise.all([cRes.json(), uRes.json(), aRes.json()]);
      setCommunities(cData.communities || []);
      setUsers(uData.users || []);
      setAdmins(aData.profileIds || []);
      setAdminEmails(aData.emails || []);
      if (wRes.ok) {
        const wData = await wRes.json();
        setWorshipItems(wData.items || []);
        setWorshipBackground(wData.background ?? { type: 'default', value: 'default1' });
        setWorshipLogo(wData.logo ?? null);
        setWorshipBulletinName(wData.bulletinName ?? '');
        setWorshipTheme(wData.theme ?? '');
        setWorshipLabel(wData.worshipLabel ?? 'WORSHIP');
        setWorshipTime(wData.worshipTime ?? '오전 11:00');
        setWorshipLocation(wData.worshipLocation ?? '2층 사랑홀');
        setWorshipDate(wData.worshipDate ?? '');
        setWorshipChurchName(wData.churchName ?? '은혜교회 청년부');
        setWorshipAnnouncementTitle(wData.announcementTitle ?? '광고');
        setWorshipAnnouncements(normalizeAnnouncements(wData.announcements ?? (wData.announcement ? [wData.announcement] : null)));
        setWorshipHomepage(wData.homepage ?? '');
        setWorshipFooter(wData.footer ?? '');
      }
    } catch (e: any) {
      setError(e?.message || '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [authQS]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const sortedCommunities = communities.slice().sort((a, b) => {
    if (communitySort === 'name') return a.name.localeCompare(b.name, 'ko');
    if (communitySort === 'members') return b.memberCount - a.memberCount;
    if (communitySort === 'activity') return (b.latestActivityAt || '').localeCompare(a.latestActivityAt || '');
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  const filteredUsers = (userFilter === 'admin' ? users.filter((u) => u.isCommunityAdmin) : users)
    .slice()
    .sort((a, b) => {
      if (userSort === 'name') {
        const an = (a.realName || a.nickname || a.profileId).toLowerCase();
        const bn = (b.realName || b.nickname || b.profileId).toLowerCase();
        return an.localeCompare(bn, 'ko');
      }
      const ad = a.registeredAt || '';
      const bd = b.registeredAt || '';
      return bd.localeCompare(ad);
    });

  const deleteCommunity = async (c: AdminCommunity) => {
    if (!window.confirm(t('admin.confirmDeleteCommunity', { name: c.name, count: c.memberCount }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/communities/${encodeURIComponent(c.id)}?${authQS}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error('삭제 실패');
      await loadAll();
    } catch (e: any) {
      window.alert(e?.message || '삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  const addAdmin = async () => {
    const id = newAdmin.trim();
    if (!id) return;
    const isEmail = /@/.test(id);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/system-admins?${authQS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(isEmail ? { email: id } : { profileId: id }),
      });
      if (!res.ok) throw new Error('추가 실패');
      const data = await res.json();
      setAdmins(data.profileIds || []);
      setAdminEmails(data.emails || []);
      setNewAdmin('');
    } catch (e: any) {
      window.alert(e?.message || '추가 실패');
    } finally {
      setBusy(false);
    }
  };

  const removeAdmin = async (id: string, kind: 'profileId' | 'email' = 'profileId') => {
    // 자기 이메일 제거 시 강한 경고
    if (kind === 'email' && myEmailLower && id.trim().toLowerCase() === myEmailLower) {
      const still = admins.includes(profileId);
      const warn = still
        ? `⚠️ 본인 이메일입니다. 제거해도 profileId(${profileId})로 관리자 권한은 유지됩니다. 계속할까요?`
        : `⚠️ 본인 이메일입니다. 제거 후 관리자 권한을 잃습니다. 다른 관리자가 다시 등록해야 복구됩니다. 정말 계속할까요?`;
      if (!window.confirm(warn)) return;
    } else {
      if (!window.confirm(t('admin.confirmRemoveAdmin', { id }))) return;
    }
    setBusy(true);
    try {
      // authQS 에는 호출자 본인의 profileId/email 이 포함되어 있어 같은 query key 가 두 번 들어가는 충돌 발생.
      // 인증은 헤더(x-profile-id, x-admin-token, x-email) 로 충분 → URL 에는 token 만 보조로.
      const param = kind === 'email' ? `email=${encodeURIComponent(id)}` : `profileId=${encodeURIComponent(id)}`;
      const res = await fetch(`/api/admin/system-admins?${param}&k=${encodeURIComponent(k)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '제거 실패');
      }
      const data = await res.json();
      setAdmins(data.profileIds || []);
      setAdminEmails(data.emails || []);
    } catch (e: any) {
      window.alert(e?.message || '제거 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>{t('admin.title')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AppShell profileId={profileId} displayName={displayName} nickname={nickname} email={email} isAdmin adminAccent showMenuBar={false}>
        <div className="admin-scope" style={{ display: 'grid', gap: '1rem' }}>
          {error && (
            <div style={{ ...cardStyle, padding: isMobile ? '0.85rem' : cardStyle.padding, borderColor: '#fca5a5', background: '#fff1f2' }}>
              <p style={{ margin: 0, color: '#b91c1c', fontWeight: 700 }}>{error}</p>
            </div>
          )}

          <AdminTabBar
            authQS={authQS}
            active={!sectionFilter ? 'users' : sectionFilter === 'bulletinTemplate' ? 'bulletinTemplate' : sectionFilter === 'venue' ? 'venue' : sectionFilter === 'etc' ? 'etc' : sectionFilter === 'stats' ? 'stats' : null}
            defaultCommunityId={scheduleDefaultCommunityId}
          />

        {!sectionFilter && (
          <SignupApprovalsCard profileId={profileId} k={k} />
        )}

        {!sectionFilter && (
          <MembersCard profileId={profileId} k={k} />
        )}

        {!sectionFilter && (
        <section style={{ ...cardStyle, padding: isMobile ? '0.85rem' : cardStyle.padding }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={titleStyle}>접속자 관리 {(() => {
              const cutoff = Date.now() - activeDays * 24 * 60 * 60 * 1000;
              const activeCount = users.filter((u) => {
                if (!u.registeredAt) return false;
                const t = new Date(u.registeredAt).getTime();
                return Number.isFinite(t) && t >= cutoff;
              }).length;
              return <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#2D4048' }}>(최근 {activeDays}일 <strong style={{ color: '#20CD8D' }}>{activeCount}</strong>명 / 전체 {users.length}명)</span>;
            })()}</h2>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
              <select aria-label="기간 필터" value={activeDays} onChange={(e) => setActiveDays(Number(e.target.value))} style={{ flex: isMobile ? '1 1 auto' : 'none', minHeight: 40, padding: '0 0.6rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem' }}>
                <option value={7}>최근 7일</option>
                <option value={30}>최근 30일</option>
                <option value={90}>최근 90일</option>
                <option value={365}>최근 1년</option>
              </select>
              <select aria-label="역할 필터" value={userFilter} onChange={(e) => setUserFilter(e.target.value as 'all' | 'admin')} style={{ flex: isMobile ? '1 1 auto' : 'none', minHeight: 40, padding: '0 0.6rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem' }}>
                <option value="all">{t('admin.filterAll')}</option>
                <option value="admin">{t('admin.filterAdmin')}</option>
              </select>
              <select aria-label="정렬 기준" value={userSort} onChange={(e) => setUserSort(e.target.value as 'recent' | 'name')} style={{ flex: isMobile ? '1 1 auto' : 'none', minHeight: 40, padding: '0 0.6rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem' }}>
                <option value="recent">{t('admin.sortRecent')}</option>
                <option value="name">{t('admin.sortName')}</option>
              </select>
            </div>
          </div>
          {loading ? <p style={subtle}>불러오는 중...</p> : (
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              {filteredUsers.map((u) => (
                <div key={u.profileId} style={{ padding: '0.55rem 0.75rem', border: '1px solid #E7F3EE', borderRadius: 10, background: '#F9FCFB' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#182527', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {u.realName || u.nickname || '(이름없음)'}
                    {u.isCommunityAdmin && (
                      <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, background: '#182527', color: '#fff', fontSize: '0.66rem', fontWeight: 800 }}>{t('admin.communityAdmin')}</span>
                    )}
                    <span style={{ color: '#2D4048', fontWeight: 500 }}>{u.email || u.profileId}</span>
                  </p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#2D4048' }}>
                    {u.provider || '-'} · 가입 {u.communities.length}개{u.registeredAt ? ` · 최근 ${new Date(u.registeredAt).toLocaleDateString('ko-KR')}` : ''}
                  </p>
                </div>
              ))}
              {filteredUsers.length === 0 && <p style={subtle}>사용자가 없습니다.</p>}
            </div>
          )}
        </section>
        )}

        {!sectionFilter && (
        <section style={{ ...cardStyle, padding: isMobile ? '0.85rem' : cardStyle.padding }}>
          <h2 style={titleStyle}>{t('admin.sectionSysAdmins')} ({admins.length + adminEmails.length})</h2>
          <p style={subtle}>가입자 목록에서 시스템 관리자로 추가할 사람을 선택하세요.</p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: '0.5rem' }}>
            <select
              value={newAdmin}
              onChange={(e) => setNewAdmin(e.target.value)}
              aria-label="시스템 관리자 가입자 선택"
              style={{ padding: '0.65rem 0.8rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem', minHeight: 44, background: '#fff' }}
            >
              <option value="">— 가입자를 선택하세요 —</option>
              {users
                .filter((u) => !admins.includes(u.profileId))
                .slice()
                .sort((a, b) => (a.realName || a.nickname || a.profileId).localeCompare(b.realName || b.nickname || b.profileId, 'ko'))
                .map((u) => {
                  const label = `${u.realName || u.nickname || '(이름 미입력)'}${u.email ? ` · ${u.email}` : ''}${u.provider ? ` · ${u.provider}` : ''}`;
                  return <option key={u.profileId} value={u.profileId}>{label}</option>;
                })}
            </select>
            <button disabled={busy || !newAdmin.trim()} onClick={addAdmin} style={{ ...btn, background: '#20CD8D', color: '#fff', minHeight: 44 }}>{t('admin.add')}</button>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
            {admins.map((id) => {
              const u = users.find((x) => x.profileId === id);
              const name = u?.realName || u?.nickname || '(이름 미입력)';
              // 카카오 OAuth 가입은 email 미동의 가능 → email 없으면 식별을 위해 profileId 노출.
              const sub = u?.email || id;
              return (
                <li key={`pid-${id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem', border: '1px solid #E7F3EE', borderRadius: 10, background: '#F9FCFB' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#182527', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, background: '#20CD8D', color: '#fff', fontSize: '0.66rem', fontWeight: 800 }}>ID</span>
                    <span>{name}</span>
                    {id === profileId && <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, background: '#F59E0B', color: '#fff', fontSize: '0.66rem', fontWeight: 800 }}>나</span>}
                    <span style={{ color: '#2D4048', fontWeight: 500 }}>{sub}</span>
                  </p>
                  <button disabled={busy || id === profileId} onClick={() => removeAdmin(id, 'profileId')} style={{ ...btn, minHeight: 40, background: id === profileId ? '#e5e7eb' : '#b91c1c', color: id === profileId ? '#6b7280' : '#fff', cursor: id === profileId ? 'not-allowed' : 'pointer', flexShrink: 0 }}>{t('admin.remove')}</button>
                </li>
              );
            })}
            {adminEmails.map((em) => {
              const isMine = myEmailLower && em.toLowerCase() === myEmailLower;
              const u = users.find((x) => (x.email || '').toLowerCase() === em.toLowerCase());
              const name = u?.realName || u?.nickname || '(가입 안 된 이메일)';
              return (
                <li key={`em-${em}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem', border: isMine ? '1px solid #F59E0B' : '1px solid #BFDBFE', borderRadius: 10, background: isMine ? '#FEF3C7' : '#EFF6FF' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#182527', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, background: '#1E40AF', color: '#fff', fontSize: '0.66rem', fontWeight: 800 }}>EMAIL</span>
                    <span>{name}</span>
                    {isMine && <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, background: '#F59E0B', color: '#fff', fontSize: '0.66rem', fontWeight: 800 }}>나</span>}
                    <span style={{ color: '#2D4048', fontWeight: 500 }}>{em}</span>
                  </p>
                  <button disabled={busy} onClick={() => removeAdmin(em, 'email')} style={{ ...btn, minHeight: 40, background: '#b91c1c', color: '#fff', flexShrink: 0 }}>{t('admin.remove')}</button>
                </li>
              );
            })}
            {admins.length === 0 && adminEmails.length === 0 && <li><p style={subtle}>관리자가 없습니다.</p></li>}
          </ul>
        </section>
        )}

        {sectionFilter === 'schedule' && (
          <ScheduleView
            communities={scheduleCommunities}
            events={scheduleEvents}
            worshipServices={scheduleWorshipServices}
            defaultCommunityId={scheduleDefaultCommunityId}
            addEventHref={`/management?${authQS}${scheduleDefaultCommunityId ? `&communityId=${encodeURIComponent(scheduleDefaultCommunityId)}` : ''}&isAdmin=1&menu=${encodeURIComponent('일정관리')}`}
          />
        )}

        {sectionFilter === 'venue' && !subFilter && (
          <section style={{ ...cardStyle, padding: isMobile ? '0.85rem' : cardStyle.padding }}>
            <h2 style={titleStyle}>장소예약관리</h2>
            <p style={subtle}>장소 설정과 예약 현황을 관리합니다.</p>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <a
                href={`/admin/system?${authQS}&section=venue&sub=settings`}
                style={{
                  display: 'block', padding: '1.5rem', borderRadius: 14,
                  background: '#ECFCCB', border: '1px solid #D9F09E', textDecoration: 'none',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏛️</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#3F6212', marginBottom: '0.35rem' }}>장소 설정</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>층/장소 추가·수정, 가용 시간, 단발/반복 블럭 설정</div>
              </a>
              <a
                href={`/admin/system?${authQS}&section=venue&sub=reservations`}
                style={{
                  display: 'block', padding: '1.5rem', borderRadius: 14,
                  background: '#DBEAFE', border: '1px solid #93C5FD', textDecoration: 'none',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1E40AF', marginBottom: '0.35rem' }}>예약 상황</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>날짜·사용자별 예약 내역 조회</div>
              </a>
            </div>
          </section>
        )}

        {sectionFilter === 'venue' && subFilter === 'settings' && (
          <section style={{ ...cardStyle, padding: isMobile ? '0.85rem' : cardStyle.padding }}>
            <h2 style={titleStyle}>장소 설정</h2>
            <p style={subtle}>세로는 장소, 가로는 30분 단위 시간 그리드입니다. 셀을 클릭하면 해당 30분이 토글로 블럭됩니다. 장기 블럭은 우측 "장기블럭" 버튼으로 설정합니다.</p>
            <VenueManager profileId={profileId} k={k} />
          </section>
        )}

        {sectionFilter === 'venue' && subFilter === 'reservations' && (
          <AdminReservationsView
            authQS={authQS}
            authHeaders={authHeaders}
            communityId={scheduleDefaultCommunityId || 'kcis'}
            cardStyle={cardStyle}
            titleStyle={titleStyle}
            subtle={subtle}
            isMobile={isMobile}
          />
        )}

        {sectionFilter === 'etc' && (
          <EtcSettings profileId={profileId} k={k} />
        )}

        {sectionFilter === 'stats' && (
          <StatsPanel profileId={profileId} k={k} email={email} />
        )}

        {sectionFilter === 'bulletinTemplate' && (
        <section className="wbe" style={{ ...cardStyle, padding: isMobile ? '0.85rem' : cardStyle.padding }}>
          <style>{`
            .wbe input::placeholder, .wbe textarea::placeholder { color: #b4c2c7; font-style: italic; font-weight: 400; opacity: 1; }
          `}</style>
          <h2 style={titleStyle}>주보 템플릿 ({worshipItems.length})</h2>
          <ul style={{ ...subtle, margin: 0, paddingLeft: '1.2rem' }}>
            <li>각 공동체의 예배관리에서 기본으로 제공되는 주보 템플릿입니다.</li>
            <li>각 항목은 드래그앤드롭으로 순서변경이 가능합니다.</li>
          </ul>

          {/* 1. 배경 이미지 */}
          <div style={{ padding: '0.75rem 0.85rem', border: '1px solid #E7F3EE', borderRadius: 12, background: '#F9FCFB', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.9rem', color: '#20CD8D' }}>배경</strong>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'nowrap' }}>
              {(['default1', 'default2'] as const).map((v) => (
                <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="bg"
                    checked={worshipBackground?.type === 'default' && worshipBackground.value === v}
                    onChange={() => saveWorshipMeta({ background: { type: 'default', value: v } })}
                  />
                  {v === 'default1' ? '기본1' : '기본2'}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setWorshipEditMode((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', marginLeft: 'auto', boxShadow: 'var(--shadow-button)' }}
            >
              {worshipEditMode ? '✓ 완료' : '✎ 편집'}
            </button>
            <button
              type="button"
              onClick={() => setWorshipPreviewOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', boxShadow: 'var(--shadow-button)' }}
            >
              👁 주보 미리보기
            </button>
          </div>

          <div style={{
            display: 'grid', gap: '0.5rem', padding: isMobile ? '0.5rem 0.5rem 0' : '0.5rem 1rem 0', borderRadius: 12,
            width: isMobile ? '100%' : 600, maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box', overflow: 'visible', position: 'relative',
            backgroundColor: '#ffffff',
            backgroundImage: worshipBackground?.type === 'default' && worshipBackground.value === 'default2'
              ? 'linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(/images/bg2.png)'
              : worshipBackground?.type === 'default'
                ? 'linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(/images/bg1.png)'
                : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}>

          {/* 2-1. 주보 헤더: WORSHIP / 테마 / 이름·날짜·시간 */}
          <div style={{ padding: '1rem 0.25rem 0.5rem', marginTop: '1rem', display: 'grid', gap: '0.5rem', justifyItems: 'center', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.85rem', justifyContent: 'center', width: '100%' }}>
              <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to right, transparent, #182527)' }} />
              <input
                type="text"
                value={worshipLabel}
                onChange={(e) => setWorshipLabel(e.target.value)}
                onBlur={() => saveWorshipMeta({ worshipLabel })}
                placeholder="WORSHIP"
                style={{ fontSize: '0.78rem', fontWeight: 800, color: '#20CD8D', letterSpacing: '0.4em', textTransform: 'uppercase', textAlign: 'center', border: 'none', background: 'transparent', padding: '0.1rem 0.3rem', width: 130, fontFamily: 'inherit' }}
              />
              <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to left, transparent, #182527)' }} />
            </div>
            <input
              type="text"
              value={worshipTheme}
              onChange={(e) => setWorshipTheme(e.target.value)}
              onBlur={() => saveWorshipMeta({ theme: worshipTheme })}
              placeholder="네가 나를 사랑하느냐?"
              style={{ padding: isMobile ? '0.3rem 0.5rem' : '0.4rem 0.9rem', borderRadius: 10, border: 'none', fontSize: isMobile ? '1.3rem' : '1.85rem', fontWeight: 800, color: '#1E293B', textAlign: 'center', width: isMobile ? '100%' : 480, maxWidth: '100%', boxSizing: 'border-box', background: 'transparent', display: 'block', margin: '0 auto', letterSpacing: '-0.01em', lineHeight: 1.2, fontFamily: '"Pretendard", "Plus Jakarta Sans", "Noto Serif KR", serif' }}
            />
            <div style={{ width: 80, height: 3, background: '#20CD8D', borderRadius: 999 }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center', fontSize: '0.85rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.02em' }}>
              <input
                type="text"
                value={worshipBulletinName}
                onChange={(e) => setWorshipBulletinName(e.target.value)}
                onBlur={() => saveWorshipMeta({ bulletinName: worshipBulletinName })}
                placeholder="주일예배"
                style={{ padding: '0.15rem 0.3rem', borderRadius: 6, border: 'none', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textAlign: 'center', width: 90, background: 'transparent' }}
              />
              <span style={{ color: '#cbd5d0' }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                <input
                  type="text"
                  value={worshipDate || computeNextSundayLabel()}
                  onChange={(e) => setWorshipDate(e.target.value)}
                  onBlur={() => saveWorshipMeta({ worshipDate })}
                  placeholder="2026.4.19(일)"
                  style={{ padding: '0.15rem 0', borderRadius: 6, border: 'none', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textAlign: 'right', width: 100, background: 'transparent' }}
                />
                <input
                  type="text"
                  value={worshipTime}
                  onChange={(e) => setWorshipTime(e.target.value)}
                  onBlur={() => saveWorshipMeta({ worshipTime })}
                  placeholder="오전 11:00"
                  style={{ padding: '0.15rem 0', borderRadius: 6, border: 'none', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textAlign: 'left', width: 80, background: 'transparent', marginLeft: 4 }}
                />
              </span>
              <span style={{ color: '#cbd5d0' }}>|</span>
              <input
                type="text"
                value={worshipLocation}
                onChange={(e) => setWorshipLocation(e.target.value)}
                onBlur={() => saveWorshipMeta({ worshipLocation })}
                placeholder="2층 사랑홀"
                style={{ padding: '0.15rem 0.3rem', borderRadius: 6, border: 'none', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textAlign: 'center', width: 110, background: 'transparent' }}
              />
            </div>
          </div>

          {/* 3. 예배 순서 (기존 리스트) */}
          <div style={{ padding: '0.25rem', display: 'grid', gap: '0.5rem', width: '100%', boxSizing: 'border-box', overflow: 'visible' }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
            {worshipItems.map((item, idx) => (
              <React.Fragment key={item.id}>
              <li
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex === null || dragIndex === idx) { setDragIndex(null); return; }
                  reorderWorship(worshipItems[dragIndex].id, idx);
                  setDragIndex(null);
                }}
                style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.45rem', border: '1px solid #E7F3EE', borderRadius: 8, background: dragIndex === idx ? '#CCF4E5' : '#F9FCFB', opacity: dragIndex !== null && dragIndex !== idx ? 0.85 : 1, width: isMobile ? '100%' : 500, maxWidth: '100%', margin: '0 auto' }}
              >
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(`'${item.title}' 항목을 삭제할까요?`)) return;
                    setBusy(true);
                    try {
                      const res = await fetch(`/api/admin/worship-templates?id=${encodeURIComponent(item.id)}&${authQS}`, {
                        method: 'DELETE',
                        headers: authHeaders,
                      });
                      if (res.ok) { const d = await res.json(); setWorshipItems(d.items || []); }
                    } finally { setBusy(false); }
                  }}
                  aria-label="항목 삭제"
                  title="삭제"
                  style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, padding: 0, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}
                >
                  ✕
                </button>
                <span
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragEnd={() => setDragIndex(null)}
                  style={{ color: '#94a3b8', fontSize: '0.95rem', cursor: 'grab', userSelect: 'none', padding: '0 0.2rem' }}
                  title="드래그해서 순서 변경"
                >⋮⋮</span>
                {worshipEditMode ? (
                  <>
                    <input
                      type="text"
                      defaultValue={item.title}
                      onBlur={(e) => { if (e.target.value !== item.title) reorderWorship && fetch(`/api/admin/worship-templates?${authQS}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: item.id, title: e.target.value }) }).then((r) => r.ok && r.json()).then((d) => d && setWorshipItems(d.items || [])); }}
                      style={{ fontWeight: 700, color: '#182527', fontSize: '0.92rem', textAlign: 'left', padding: '0.15rem 0.4rem', borderRadius: 6, border: '1px solid #cbd5d0', background: '#fff', minWidth: 0 }}
                    />
                    <input
                      type="text"
                      defaultValue={item.description || ''}
                      placeholder="설명"
                      onBlur={(e) => { if (e.target.value !== (item.description || '')) fetch(`/api/admin/worship-templates?${authQS}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: item.id, description: e.target.value }) }).then((r) => r.ok && r.json()).then((d) => d && setWorshipItems(d.items || [])); }}
                      style={{ color: '#2D4048', fontSize: '0.85rem', textAlign: 'center', padding: '0.15rem 0.4rem', borderRadius: 6, border: '1px solid #cbd5d0', background: '#fff', minWidth: 0 }}
                    />
                    <input
                      type="text"
                      defaultValue={item.presenter || ''}
                      placeholder="담당자"
                      onBlur={(e) => { if (e.target.value !== (item.presenter || '')) fetch(`/api/admin/worship-templates?${authQS}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: item.id, presenter: e.target.value }) }).then((r) => r.ok && r.json()).then((d) => d && setWorshipItems(d.items || [])); }}
                      style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'right', padding: '0.15rem 0.4rem', borderRadius: 6, border: '1px solid #cbd5d0', background: '#fff', minWidth: 0 }}
                    />
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, color: '#182527', fontSize: '0.92rem', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                    <span style={{ color: '#2D4048', fontSize: '0.85rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || ''}</span>
                    <span style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.presenter || ''}</span>
                  </>
                )}
              </li>
              {item.title.includes('찬양') && (
                <li style={{ width: isMobile ? '100%' : 500, maxWidth: '100%', margin: '0 auto', padding: '0.4rem 0.55rem', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5d0', borderRadius: 8, display: 'grid', gap: '0.4rem' }}>
                  {(item.songs || []).map((song, sIdx) => {
                    const vid = ytId(song.link);
                    return (
                      <div
                        key={sIdx}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!songDrag || songDrag.itemId !== item.id || songDrag.from === sIdx) { setSongDrag(null); return; }
                          const songsArr = [...(item.songs || [])];
                          const [moved] = songsArr.splice(songDrag.from, 1);
                          songsArr.splice(sIdx, 0, moved);
                          patchItemSongs(item.id, songsArr);
                          setSongDrag(null);
                        }}
                        style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '0.35rem', alignItems: 'center', background: songDrag?.itemId === item.id && songDrag.from === sIdx ? '#CCF4E5' : 'transparent', padding: '0.15rem 0.25rem', borderRadius: 6 }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const next = (item.songs || []).filter((_, i) => i !== sIdx);
                            patchItemSongs(item.id, next);
                          }}
                          aria-label="찬양 삭제"
                          style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, padding: 0, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}
                        >
                          ✕
                        </button>
                        <span
                          draggable
                          onDragStart={() => setSongDrag({ itemId: item.id, from: sIdx })}
                          onDragEnd={() => setSongDrag(null)}
                          style={{ color: '#94a3b8', fontSize: '0.85rem', cursor: 'grab', userSelect: 'none' }}
                          title="드래그해서 순서 변경"
                        >⋮⋮</span>
                        <input
                          type="text"
                          value={song.title}
                          placeholder={`찬양제목${sIdx + 1}`}
                          onChange={(e) => {
                            const next = worshipItems.map((it) => it.id === item.id ? { ...it, songs: (it.songs || []).map((s, i) => i === sIdx ? { ...s, title: e.target.value } : s) } : it);
                            setWorshipItems(next);
                          }}
                          onBlur={(e) => {
                            if (e.target.value !== (song.title || '')) {
                              const updatedSongs = (item.songs || []).map((s, i) => i === sIdx ? { ...s, title: e.target.value } : s);
                              patchItemSongs(item.id, updatedSongs);
                            }
                          }}
                          style={{ padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5d0', fontSize: '0.82rem', fontWeight: 700, minWidth: 0 }}
                        />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: '#475569', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const q = song.title;
                              if (!q) { window.alert('찬양제목을 먼저 입력해주세요.'); return; }
                              setSongSearch({ itemId: item.id, songIdx: sIdx, query: q });
                              runSongSearch(q);
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#0ea5e9', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                            title="유튜브에서 음원 검색"
                          >
                            음원찾기
                          </button>
                          <span style={{ color: '#cbd5d0' }}>|</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (!song.title) { window.alert('찬양제목을 먼저 입력해주세요.'); return; }
                              setLyricsQuery(song.title);
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#475569', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                            title="가사 보기"
                          >
                            가사
                          </button>
                          <span style={{ color: '#cbd5d0' }}>|</span>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!song.link) { window.alert('복사할 링크가 없습니다.'); return; }
                              try { await navigator.clipboard.writeText(song.link); window.alert('링크가 복사되었습니다.'); } catch { window.prompt('링크', song.link); }
                            }}
                            aria-label="링크 복사"
                            title="링크 복사"
                            style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        </span>
                        {vid ? (
                          <button
                            type="button"
                            onClick={() => video.play(vid, song.title || '찬양')}
                            title="비디오 재생"
                            style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative', display: 'inline-block' }}
                          >
                            <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="YouTube" style={{ width: 56, height: 32, borderRadius: 4, border: '1px solid #cbd5d0', objectFit: 'cover', display: 'block' }} />
                            <span style={{ position: 'absolute', inset: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.78rem', textShadow: '0 0 4px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>▶</span>
                          </button>
                        ) : (
                          <span style={{ width: 56, height: 32, borderRadius: 4, border: '1px dashed #cbd5d0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.6rem' }}>썸네일</span>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(item.songs || []), { title: '', link: '' }];
                      patchItemSongs(item.id, next);
                    }}
                    style={{ justifySelf: 'center', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.7rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    + 찬양 추가
                  </button>
                </li>
              )}
              </React.Fragment>
            ))}
            {worshipItems.length === 0 && <li><p style={subtle}>등록된 항목이 없습니다.</p></li>}
          </ul>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr auto', gap: '0.4rem', width: isMobile ? '100%' : 500, maxWidth: '100%', margin: '0.5rem auto 0' }}>
            <input
              type="text"
              value={newWorshipTitle}
              onChange={(e) => setNewWorshipTitle(e.target.value)}
              placeholder="제목"
              style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem', textAlign: 'left', minWidth: 0 }}
            />
            <input
              type="text"
              value={newWorshipDesc}
              onChange={(e) => setNewWorshipDesc(e.target.value)}
              placeholder="설명"
              style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem', textAlign: 'center', minWidth: 0 }}
            />
            <input
              type="text"
              value={newWorshipPresenter}
              onChange={(e) => setNewWorshipPresenter(e.target.value)}
              placeholder="담당자"
              style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem', textAlign: 'right', minWidth: 0 }}
            />
            <button
              disabled={busy || !newWorshipTitle.trim()}
              onClick={async () => {
                if (!newWorshipTitle.trim()) return;
                setBusy(true);
                try {
                  const res = await fetch(`/api/admin/worship-templates?${authQS}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders },
                    body: JSON.stringify({ title: newWorshipTitle, description: newWorshipDesc, presenter: newWorshipPresenter }),
                  });
                  if (!res.ok) throw new Error('추가 실패');
                  const data = await res.json();
                  setWorshipItems(data.file?.items || []);
                  setNewWorshipTitle('');
                  setNewWorshipDesc('');
                  setNewWorshipPresenter('');
                } catch (e: any) {
                  window.alert(e?.message || '추가 실패');
                } finally {
                  setBusy(false);
                }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.7rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              + 예배항목 추가
            </button>
          </div>
          <div style={{ marginTop: '1rem', marginBottom: '0.85rem', display: 'grid', gap: '0.85rem', justifyItems: 'center' }}>
            {worshipAnnouncements.map((ann, i) => (ann as any).noTitle ? null : (
              <div key={i} style={{ position: 'relative', width: isMobile ? '100%' : 500, maxWidth: '100%', display: 'grid', gap: '0.3rem', justifyItems: 'center', padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem', border: '1px solid #cbd5d0', borderRadius: 14, background: 'rgba(255,255,255,0.55)' }}>
                <input
                  type="text"
                  value={ann.title}
                  onChange={(e) => {
                    const next = worshipAnnouncements.map((a, idx) => idx === i ? { ...a, title: e.target.value } : a);
                    setWorshipAnnouncements(next);
                  }}
                  onBlur={() => saveWorshipMeta({ announcements: worshipAnnouncements })}
                  placeholder="광고"
                  style={{ width: '100%', fontSize: '1.05rem', fontWeight: 800, color: '#182527', textAlign: 'center', border: '1px dashed transparent', borderRadius: 6, padding: '0.1rem 0.4rem', background: 'transparent', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.target.style.border = '1px dashed var(--color-primary)'; e.target.style.background = 'rgba(255,255,255,0.7)'; }}
                  onBlurCapture={(e) => { e.target.style.border = '1px dashed transparent'; e.target.style.background = 'transparent'; }}
                />
                <textarea
                  value={ann.content}
                  onChange={(e) => {
                    const next = worshipAnnouncements.map((a, idx) => idx === i ? { ...a, content: e.target.value } : a);
                    setWorshipAnnouncements(next);
                  }}
                  onBlur={() => saveWorshipMeta({ announcements: worshipAnnouncements })}
                  rows={3}
                  placeholder="내용"
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem', fontFamily: 'var(--font-sans)', background: 'rgba(255,255,255,0.85)', resize: 'vertical', boxSizing: 'border-box' }}
                />
                {worshipAnnouncements.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = worshipAnnouncements.filter((_, idx) => idx !== i);
                      setWorshipAnnouncements(next);
                      saveWorshipMeta({ announcements: next });
                    }}
                    aria-label="항목 삭제"
                    title="삭제"
                    style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, padding: 0, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const lastTitle = [...worshipAnnouncements].reverse().find((a) => !(a as any).noTitle)?.title || '광고';
                const next = [...worshipAnnouncements, { title: lastTitle, content: '' }];
                setWorshipAnnouncements(next);
                saveWorshipMeta({ announcements: next });
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.75rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
              title="광고 항목 추가"
            >
              + 타이틀항목 추가
            </button>
            {worshipAnnouncements.map((ann, i) => (ann as any).noTitle ? (
              <div key={i} style={{ position: 'relative', width: isMobile ? '100%' : 500, maxWidth: '100%', display: 'grid', gap: '0.3rem', justifyItems: 'center', padding: isMobile ? '0.5rem 0.7rem' : '0.5rem 1rem', border: '1px solid #cbd5d0', borderRadius: 14, background: 'rgba(255,255,255,0.55)' }}>
                <input
                  type="text"
                  value={ann.content}
                  onChange={(e) => {
                    const next = worshipAnnouncements.map((a, idx) => idx === i ? { ...a, content: e.target.value } : a);
                    setWorshipAnnouncements(next);
                  }}
                  onBlur={() => saveWorshipMeta({ announcements: worshipAnnouncements })}
                  placeholder="내용을 입력하세요"
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem', background: 'rgba(255,255,255,0.85)', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = worshipAnnouncements.filter((_, idx) => idx !== i);
                    setWorshipAnnouncements(next);
                    saveWorshipMeta({ announcements: next });
                  }}
                  aria-label="항목 삭제"
                  title="삭제"
                  style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, padding: 0, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            ) : null)}
            <button
              type="button"
              onClick={() => {
                const next = [...worshipAnnouncements, { title: '', content: '', noTitle: true }];
                setWorshipAnnouncements(next);
                saveWorshipMeta({ announcements: next });
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.75rem', borderRadius: 999, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
              title="제목 없는 한줄 항목 추가"
            >
              + 한줄 항목추가
            </button>
          </div>
          </div>
          </div>

        </section>
        )}

        {lyricsQuery && (() => {
          const q = `${lyricsQuery} 가사`;
          const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&igu=1`;
          const bugsUrl = `https://music.bugs.co.kr/search/track?q=${encodeURIComponent(lyricsQuery)}`;
          const naverUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`;
          return (
            <div onClick={() => setLyricsQuery(null)} style={{ position: 'fixed', inset: 0, zIndex: 105, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
              <div role="dialog" aria-modal="true" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, height: '85vh', background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#182527', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎵 {lyricsQuery} · 가사</h3>
                  <button type="button" onClick={() => setLyricsQuery(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                  <a href={googleUrl} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>Google ↗</a>
                  <a href={naverUrl} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>네이버 ↗</a>
                  <a href={bugsUrl} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>벅스 ↗</a>
                </div>
                <iframe
                  src={googleUrl}
                  title="가사 검색"
                  style={{ flex: 1, width: '100%', border: 0, background: '#fff' }}
                />
                <div style={{ padding: '0.45rem 1rem', borderTop: '1px solid var(--color-surface-border)', fontSize: '0.7rem', color: 'var(--color-ink-2)', textAlign: 'center' }}>
                  결과가 보이지 않으면 위의 외부 링크(↗)를 사용해주세요.
                </div>
              </div>
            </div>
          );
        })()}

        {songSearch && (
          <div onClick={() => setSongSearch(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
            <div role="dialog" aria-modal="true" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', padding: isMobile ? '0.85rem' : '1.25rem', display: 'grid', gap: '0.75rem', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#182527' }}>유튜브 검색</h3>
                <button type="button" onClick={() => setSongSearch(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="text"
                  value={songSearch.query}
                  onChange={(e) => setSongSearch({ ...songSearch, query: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSongSearch(songSearch.query); }}
                  placeholder="검색어"
                  style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem' }}
                />
                <button type="button" onClick={() => runSongSearch(songSearch.query)} style={{ ...btn, background: '#20CD8D', color: '#fff' }}>검색</button>
              </div>
              {songSearchLoading ? (
                <p style={subtle}>검색 중...</p>
              ) : songSearchResults.length === 0 ? (
                <p style={subtle}>결과가 없습니다.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
                  {songSearchResults.map((res) => (
                    <li key={res.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `https://www.youtube.com/watch?v=${res.id}`;
                          const target = worshipItems.find((it) => it.id === songSearch.itemId);
                          if (!target) { setSongSearch(null); return; }
                          const next = (target.songs || []).map((s, i) => i === songSearch.songIdx ? { ...s, link: url } : s);
                          patchItemSongs(songSearch.itemId, next);
                          setSongSearch(null);
                        }}
                        style={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.6rem', alignItems: 'center', padding: '0.5rem', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <img src={res.thumbnail} alt="" style={{ width: 96, height: 54, borderRadius: 6, objectFit: 'cover' }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 700, color: '#182527', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.title}</span>
                          <span style={{ display: 'block', color: '#475569', fontSize: '0.78rem' }}>{res.channel}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {worshipPreviewOpen && (
          <div onClick={() => setWorshipPreviewOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
            <div role="dialog" aria-modal="true" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', position: 'relative', background: 'transparent' }}>
              <button type="button" onClick={() => setWorshipPreviewOpen(false)} aria-label="닫기" style={{ position: 'absolute', top: 8, right: 12, background: 'rgba(255,255,255,0.85)', border: 'none', fontSize: '1.2rem', cursor: 'pointer', zIndex: 2, borderRadius: 999, width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>✕</button>

              <div style={{
                display: 'grid', gap: '0.5rem', padding: '1rem 1rem 1rem', borderRadius: 16,
                backgroundColor: '#ffffff',
                backgroundImage: worshipBackground?.type === 'default' && worshipBackground.value === 'default2'
                  ? 'linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(/images/bg2.png)'
                  : worshipBackground?.type === 'default'
                    ? 'linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(/images/bg1.png)'
                    : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}>

                {/* 주보 헤더 */}
                <div style={{ padding: '1.25rem 0 0.5rem', textAlign: 'center', display: 'grid', gap: '0.4rem', justifyItems: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.85rem', justifyContent: 'center', width: '100%' }}>
                    <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to right, transparent, #182527)' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#20CD8D', letterSpacing: '0.4em', textTransform: 'uppercase' }}>{worshipLabel || 'WORSHIP'}</span>
                    <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to left, transparent, #182527)' }} />
                  </div>
                  {(worshipTheme || '네가 나를 사랑하느냐?') && (
                    <h2 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: '#1E293B', letterSpacing: '-0.01em', lineHeight: 1.2, fontFamily: '"Pretendard", "Plus Jakarta Sans", "Noto Serif KR", serif' }}>{worshipTheme || '네가 나를 사랑하느냐?'}</h2>
                  )}
                  <div style={{ width: 80, height: 3, background: '#20CD8D', borderRadius: 999 }} />
                  <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.02em' }}>
                    {worshipBulletinName || '주일예배'} | {worshipDate || computeNextSundayLabel()} {worshipTime || '오전 11:00'} | {worshipLocation || '2층 사랑홀'}
                  </div>
                </div>

                {/* 예배 순서 */}
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
                  {worshipItems.map((item) => (
                    <li key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.55rem', borderBottom: '1px dotted #cbd5d0', width: 500, maxWidth: '100%', margin: '0 auto' }}>
                      <span style={{ fontWeight: 700, color: '#182527', fontSize: '0.92rem', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                      <span style={{ color: '#2D4048', fontSize: '0.85rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || ''}</span>
                      <span style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.presenter || ''}</span>
                      {(item.songs && item.songs.length > 0) && (
                        <ul style={{ gridColumn: '1 / -1', margin: '0.3rem auto 0.2rem', padding: 0, listStyle: 'none', display: 'grid', gap: '0.3rem', width: 'fit-content', textAlign: 'left' }}>
                          {item.songs.map((song, sIdx) => {
                            const m = (song.link || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/);
                            const vid = m ? m[1] : null;
                            return (
                              <li key={sIdx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#475569' }}>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem', minWidth: 12 }}>•</span>
                                <span style={{ fontWeight: 600, color: '#182527' }}>{song.title || '(제목 없음)'}</span>
                                {vid ? (
                                  <button type="button" onClick={() => video.play(vid, song.title || '찬양')} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} title="비디오 재생">
                                    <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="YouTube" style={{ width: 56, height: 32, borderRadius: 4, border: '1px solid #cbd5d0', objectFit: 'cover', display: 'block' }} />
                                  </button>
                                ) : (
                                  <span style={{ width: 56, height: 32 }} />
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>

                {/* 광고 */}
                <div style={{ marginTop: '1rem', display: 'grid', gap: '0.7rem', justifyItems: 'center' }}>
                  {worshipAnnouncements.map((ann, i) => (
                    <div key={i} style={{ width: 500, maxWidth: '100%', textAlign: 'center', padding: (ann as any).noTitle ? '0.5rem 1rem' : '0.75rem 1rem', border: '1px solid #cbd5d0', borderRadius: 14, background: 'rgba(255,255,255,0.55)' }}>
                      {!(ann as any).noTitle && <h3 style={{ margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: 800, color: '#182527' }}>{ann.title || '광고'}</h3>}
                      {ann.content && <p style={{ margin: 0, fontSize: '0.88rem', color: '#182527', lineHeight: 1.5, whiteSpace: 'pre-wrap', textAlign: (ann as any).noTitle ? 'center' : 'left' }}>{ann.content}</p>}
                    </div>
                  ))}
                </div>

                {/* 푸터 */}
                <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #cbd5d0', textAlign: 'center', fontSize: '0.78rem', color: '#475569' }}>
                  <div style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 700 }}>KCIS · 싱가폴한인교회</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {editingWorship && (
          <div onClick={() => setEditingWorship(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
            <div role="dialog" aria-modal="true" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', padding: isMobile ? '0.85rem' : '1.25rem', display: 'grid', gap: '0.65rem', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#182527' }}>예배 항목 편집</h3>
                <button type="button" onClick={() => setEditingWorship(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
              </div>
              {(['title', 'description'] as const).map((field) => {
                const labels: Record<string, string> = { title: '제목 (예: 찬양)', description: '설명' };
                const isLong = field === 'description';
                return (
                  <label key={field} style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>{labels[field]}</span>
                    {isLong ? (
                      <textarea value={(editingWorship as any)[field] || ''} onChange={(e) => setEditingWorship({ ...editingWorship, [field]: e.target.value })} rows={2} style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem', fontFamily: 'var(--font-sans)' }} />
                    ) : (
                      <input type="text" value={(editingWorship as any)[field] || ''} onChange={(e) => setEditingWorship({ ...editingWorship, [field]: e.target.value })} style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem' }} />
                    )}
                  </label>
                );
              })}
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>담당자</span>
                <input
                  type="text"
                  placeholder="담당자 이름 입력"
                  value={editingWorship.presenter || ''}
                  onChange={(e) => setEditingWorship({ ...editingWorship, presenter: e.target.value })}
                  style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem' }}
                />
              </label>
              {(['link', 'passage', 'members', 'prayerNote'] as const).map((field) => {
                const labels: Record<string, string> = {
                  link: '관련 링크 (예: 찬양 영상 URL)',
                  passage: '말씀 구절 (예: 요한복음 3:16)',
                  members: '참여자 (쉼표로 구분, 예: 봉헌위원 김OO, 이OO)',
                  prayerNote: '기도/메모 (예: 봉헌기도 담당자)',
                };
                const isLong = field === 'prayerNote';
                return (
                  <label key={field} style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>{labels[field]}</span>
                    {isLong ? (
                      <textarea value={(editingWorship as any)[field] || ''} onChange={(e) => setEditingWorship({ ...editingWorship, [field]: e.target.value })} rows={2} style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem', fontFamily: 'var(--font-sans)' }} />
                    ) : (
                      <input type={field === 'link' ? 'url' : 'text'} value={(editingWorship as any)[field] || ''} onChange={(e) => setEditingWorship({ ...editingWorship, [field]: e.target.value })} style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem' }} />
                    )}
                  </label>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.4rem' }}>
                <button type="button" onClick={() => setEditingWorship(null)} style={{ ...btn, background: '#fff', color: '#182527', border: '1px solid #cbd5d0' }}>취소</button>
                <button
                  type="button"
                  disabled={busy || !editingWorship.title?.trim()}
                  onClick={async () => {
                    if (!editingWorship) return;
                    setBusy(true);
                    try {
                      const res = await fetch(`/api/admin/worship-templates?${authQS}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        body: JSON.stringify(editingWorship),
                      });
                      if (!res.ok) throw new Error('저장 실패');
                      const data = await res.json();
                      setWorshipItems(data.items || []);
                      setEditingWorship(null);
                    } catch (e: any) {
                      window.alert(e?.message || '저장 실패');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  style={{ ...btn, background: '#20CD8D', color: '#fff' }}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </AppShell>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireSystemAdminSSR(context);
  if (!guard.ok) return { notFound: true };

  const [communitiesArr, eventsArr, wsArr, profilesArr, usersArr] = await Promise.all([
    getCommunities().catch(() => [] as any[]),
    getEvents().catch(() => [] as any[]),
    getWorshipServices().catch(() => [] as any[]),
    getProfiles().catch(() => [] as any[]),
    getUsers().catch(() => [] as any[]),
  ]);
  const scheduleCommunities = (communitiesArr as any[]).map((c) => ({ id: c.id, name: c.name, timezone: c.timezone }));
  const allEvents = eventsArr as RawEventRow[];
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 6, 0, 23, 59, 59);
  const scheduleEvents = allEvents
    .filter((e) => ((e.type || 'event') === 'event') && ((e.scope || 'community') === 'community'))
    .flatMap((e) => expandOccurrences(e, { from, to }))
    .map((e: any) => ({
      id: e.id,
      communityId: e.communityId,
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      location: e.location ?? null,
      description: e.description ?? null,
      createdByName: e.createdByName ?? null,
      scope: e.scope ?? null,
      shared: e.shared ?? false,
    }));
  const scheduleWorshipServices = wsArr as any[];
  const scheduleDefaultCommunityId = scheduleCommunities[0]?.id || '';

  const nickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const email = typeof context.query.email === 'string' ? context.query.email : null;
  let displayName: string | null = nickname;
  try {
    const profiles = profilesArr as Array<any>;
    const users = usersArr as Array<any>;
    const p = profiles.find((x) => x.profileId === guard.profileId);
    const u = users.find((x) => x.providerProfileId === guard.profileId);
    displayName = p?.realName || u?.realName || u?.nickname || nickname || null;
  } catch {}

  return {
    props: {
      profileId: guard.profileId,
      displayName,
      nickname,
      email,
      scheduleCommunities,
      scheduleEvents,
      scheduleWorshipServices,
      scheduleDefaultCommunityId,
    },
  };
};

export default SystemAdminPage;
