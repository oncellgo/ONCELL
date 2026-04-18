import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useAudio } from '../components/AudioPlayer';
import AppShell from '../components/AppShell';
import { WorshipBulletinPreview } from '../components/WorshipBulletinEditor';
import { getCommunities, getUsers, getProfiles, getSystemAdmins } from '../lib/dataStore';

type Community = {
  id: string;
  name: string;
  adminProfileId?: string;
  joinApprovalMode?: 'auto' | 'admin';
  requireRealName?: boolean;
};

type UserEntry = {
  userId: string;
  provider: string;
  providerProfileId: string;
  communityId: string;
  communityName: string;
  nickname: string;
  realName: string;
  contact: string;
  membershipStatus?: 'active' | 'pending';
  registeredAt: string;
  profile: any;
};

type StoredProfile = {
  profileId: string;
  provider: string;
  nickname: string;
  realName: string;
  contact: string;
  email?: string;
} | null;

type DashboardProps = {
  profileId: string | null;
  provider: string | null;
  nickname: string | null;
  email: string | null;
  joinedCommunities: Array<Community & { isAdmin: boolean }>;
  userEntries: UserEntry[];
  storedProfile: StoredProfile;
  systemAdminHref: string | null;
};

const Dashboard = ({ profileId, provider, nickname, email, joinedCommunities, userEntries, storedProfile, systemAdminHref }: DashboardProps) => {
  const { t } = useTranslation();
  const audio = useAudio();
  const [profileDone, setProfileDone] = useState<boolean>(!!storedProfile);
  const [realName, setRealName] = useState<string>(storedProfile?.realName || nickname || '');
  const [countryCode, setCountryCode] = useState<string>('+65');
  const [contact, setContact] = useState<string>(storedProfile?.contact?.replace(/^\+\d+-/, '') || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityApproval, setNewCommunityApproval] = useState<'auto' | 'admin'>('auto');
  const [newCommunityRequireRealName, setNewCommunityRequireRealName] = useState<boolean>(true);
  const [newCommunityTimezone, setNewCommunityTimezone] = useState<string>(() => {
    if (typeof window === 'undefined') return 'Asia/Seoul';
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; } catch { return 'Asia/Seoul'; }
  });
  const [qt, setQt] = useState<{
    reference: string | null;
    passage: string | null;
    hymn: { number: string; title: string | null } | null;
    audioUrl: string | null;
    source: string;
  } | null>(null);
  const [audioOpen, setAudioOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflection, setReflection] = useState('');
  const [reflectionSavedAt, setReflectionSavedAt] = useState<string | null>(null);

  const reflectionKey = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return profileId ? `qt-reflection:${profileId}:${today}` : null;
  }, [profileId]);

  useEffect(() => {
    if (!reflectionKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(reflectionKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setReflection(parsed.text || '');
        setReflectionSavedAt(parsed.savedAt || null);
      }
    } catch {}
  }, [reflectionKey]);

  const saveReflection = () => {
    if (!reflectionKey || typeof window === 'undefined') return;
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(
      reflectionKey,
      JSON.stringify({ text: reflection, savedAt, reference: qt?.reference || null }),
    );
    setReflectionSavedAt(savedAt);
  };
  const [qtLoading, setQtLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/qt', { cache: 'force-cache' })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setQt(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setQtLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const createCommunity = async () => {
    if (!profileId) return;
    const name = newCommunityName.trim();
    if (!name) {
      setCreateMsg('공동체 이름을 입력해주세요.');
      return;
    }
    setCreatingCommunity(true);
    setCreateMsg(null);
    try {
      const response = await fetch('/api/communities/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          profileId,
          provider: provider || 'kakao',
          nickname: nickname || '',
          email: email || '',
          joinApprovalMode: newCommunityApproval,
          requireRealName: newCommunityRequireRealName,
          timezone: newCommunityTimezone,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCreateMsg(data.error || '생성에 실패했습니다.');
      } else {
        const params = new URLSearchParams();
        params.set('profileId', profileId);
        if (nickname) params.set('nickname', nickname);
        if (email) params.set('email', email);
        if (data.community?.id) params.set('communityId', data.community.id);
        router.replace(`/dashboard?${params.toString()}`);
      }
    } catch (error) {
      console.error(error);
      setCreateMsg('생성 중 오류가 발생했습니다.');
    } finally {
      setCreatingCommunity(false);
    }
  };

  const saveProfile = async () => {
    if (!profileId) return;
    if (!realName.trim() || !contact.trim()) {
      setProfileMsg('실명과 연락처를 입력해주세요.');
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          provider: provider || 'kakao',
          nickname: nickname || '',
          realName: realName.trim(),
          contact: `${countryCode}-${contact.trim()}`,
          email: email || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setProfileMsg(data.error || '저장에 실패했습니다.');
      } else {
        setProfileDone(true);
        setProfileMsg('프로필이 저장되었습니다.');
      }
    } catch (error) {
      console.error(error);
      setProfileMsg('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingProfile(false);
    }
  };

  const router = useRouter();
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [publishedServices, setPublishedServices] = useState<any[]>([]);
  const [previewBulletin, setPreviewBulletin] = useState<any>(null);

  useEffect(() => {
    if (!activeCommunityId) { setPublishedServices([]); return; }
    (async () => {
      try {
        const res = await fetch(`/api/communities/${encodeURIComponent(activeCommunityId)}/worship-services`);
        if (!res.ok) { setPublishedServices([]); return; }
        const d = await res.json();
        const all: any[] = Array.isArray(d.services) ? d.services : [];
        const pub = all.filter((s) => s.published && (s.bulletin || s.resolvedBulletin));
        pub.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
        setPublishedServices(pub);
      } catch { setPublishedServices([]); }
    })();
  }, [activeCommunityId]);

  const bulletinBgThumb = (s: any): string | null => {
    const b = s?.bulletin ?? s?.resolvedBulletin;
    const bg = b?.design?.background ?? b?.background;
    if (!bg) return null;
    if (bg.type === 'default') return bg.value === 'default2' ? '/images/bg2.png' : '/images/bg1.png';
    if (bg.type === 'upload' && bg.dataUrl) return bg.dataUrl;
    return null;
  };
  const todayLabel = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  useEffect(() => {
    const queryCommunityId = typeof router.query.communityId === 'string' ? router.query.communityId : null;
    if (!queryCommunityId) {
      if (activeCommunityId) setActiveCommunityId(null);
      return;
    }
    if (
      queryCommunityId !== activeCommunityId &&
      joinedCommunities.some((community) => community.id === queryCommunityId)
    ) {
      setActiveCommunityId(queryCommunityId);
    }
    const target = joinedCommunities.find((c) => c.id === queryCommunityId);
    const wantAdminFlag = target?.isAdmin ? '1' : undefined;
    const currentAdminFlag = typeof router.query.isAdmin === 'string' ? router.query.isAdmin : undefined;
    if (wantAdminFlag !== currentAdminFlag) {
      const nextQuery: Record<string, string> = {};
      Object.entries(router.query).forEach(([k, v]) => { if (typeof v === 'string') nextQuery[k] = v; });
      if (wantAdminFlag) nextQuery.isAdmin = '1'; else delete nextQuery.isAdmin;
      router.replace({ pathname: '/dashboard', query: nextQuery }, undefined, { shallow: true });
    }
  }, [joinedCommunities, activeCommunityId, router.query.communityId, router.query.isAdmin]);

  const activeCommunity = joinedCommunities.find((community) => community.id === activeCommunityId)
  const selectCommunity = (communityId: string) => {
    setActiveCommunityId(communityId);
    const target = joinedCommunities.find((c) => c.id === communityId);
    router.replace(
      {
        pathname: '/dashboard',
        query: {
          ...(profileId ? { profileId } : {}),
          communityId,
          ...(target?.isAdmin ? { isAdmin: '1' } : {}),
        },
      },
      undefined,
      { shallow: true },
    );
  };

  const cardBase: React.CSSProperties = {
    padding: '1.5rem',
    borderRadius: 16,
    background: '#ffffff',
    boxShadow: '0 12px 32px rgba(24, 37, 39, 0.06)',
    border: '1px solid #E7F3EE',
  };
  const sectionTitle: React.CSSProperties = { margin: 0, fontSize: '1.35rem', color: '#182527', fontWeight: 800, letterSpacing: '-0.01em' };
  const helperText: React.CSSProperties = { margin: 0, color: '#2D4048', lineHeight: 1.6 };

  return (
    <>
      <Head>
        <title>{activeCommunity ? `${activeCommunity.name} · ${t('dashboard.title')}` : t('dashboard.title')}</title>
      </Head>

      <AppShell
        profileId={profileId}
        displayName={storedProfile?.realName || userEntries[0]?.realName || userEntries[0]?.nickname || nickname || null}
        nickname={nickname}
        email={email}
        isAdmin={joinedCommunities.some((c) => c.isAdmin)}
        systemAdminHref={systemAdminHref || undefined}
        brandExtras={activeCommunity && router.query.communityId && joinedCommunities.length > 0 ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setCommunityDropdownOpen((v) => !v)}
              aria-expanded={communityDropdownOpen}
              aria-label="공동체 전환"
              title="현재 선택된 공동체 · 클릭해서 전환"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.95rem',
                borderRadius: 999,
                border: 'none',
                background: '#CCF4E5',
                color: '#3F6212',
                fontWeight: 800,
                fontSize: '1.02rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(132, 204, 22, 0.25)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{activeCommunity.name}</span>
              <span style={{ padding: '0.1rem 0.5rem', borderRadius: 999, background: '#ffffff', color: 'var(--color-ink)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.02em', border: '1px solid var(--color-gray)' }}>
                {activeCommunity.isAdmin ? '관리자' : '일반회원'}
              </span>
              <span style={{ transform: communityDropdownOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease', fontSize: '1.1rem', lineHeight: 1 }}>▾</span>
            </button>
            {communityDropdownOpen && (
              <>
                <div onClick={() => setCommunityDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                <ul style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  minWidth: 220,
                  zIndex: 40,
                  margin: 0,
                  padding: '0.35rem',
                  listStyle: 'none',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-gray)',
                  borderRadius: 12,
                  boxShadow: 'var(--shadow-card)',
                  maxHeight: 320,
                  overflowY: 'auto',
                }}>
                  {joinedCommunities.map((community) => {
                    const isActive = activeCommunityId === community.id;
                    return (
                      <li key={community.id}>
                        <button
                          type="button"
                          onClick={() => { selectCommunity(community.id); setCommunityDropdownOpen(false); }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            padding: '0.55rem 0.7rem',
                            borderRadius: 8,
                            border: 'none',
                            background: isActive ? 'var(--color-primary-tint)' : 'transparent',
                            color: 'var(--color-ink)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                            {community.name}
                          </span>
                          {community.isAdmin && (
                            <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, background: 'var(--color-ink)', color: '#ffffff', fontSize: '0.66rem', fontWeight: 700, flexShrink: 0 }}>관리자</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            </div>
          </div>
        ) : undefined}
      >
          {activeCommunity && (
          <section id="qt" style={{ display: 'grid', gap: '0.65rem', padding: '1.1rem 1.25rem', borderRadius: 16, background: 'linear-gradient(135deg, var(--color-ink) 0%, var(--color-ink-2) 100%)', color: '#ffffff', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-card-lg)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 90% 10%, rgba(32, 205, 141, 0.35), transparent 55%)', pointerEvents: 'none' }} />

            {/* 헤더: 타이틀 + 날짜 + 오디오듣기 + 전체보기 */}
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#ffffff', fontWeight: 800, letterSpacing: '-0.01em' }}>오늘의 큐티</h2>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.18rem 0.55rem', borderRadius: 999, background: 'rgba(32, 205, 141, 0.22)', color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.75rem', border: '1px solid rgba(32, 205, 141, 0.3)' }}>
                  {todayLabel}
                </span>
                {!qtLoading && qt?.audioUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      if (audio.isOpen && audio.src === qt.audioUrl) audio.close();
                      else audio.play(qt.audioUrl!, '오늘의 큐티');
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.7rem', borderRadius: 999, background: 'var(--color-primary)', color: '#ffffff', fontWeight: 700, fontSize: '0.75rem', border: 'none', cursor: 'pointer' }}
                  >
                    {audio.isOpen && audio.src === qt.audioUrl ? '■ 닫기' : '▶ 오디오 듣기'}
                  </button>
                )}
              </div>
              {!qtLoading && (() => {
                const params = new URLSearchParams();
                if (profileId) params.set('profileId', profileId);
                if (nickname) params.set('nickname', nickname);
                if (email) params.set('email', email);
                return (
                  <a
                    href={`/qt/notes?${params.toString()}`}
                    style={{ color: 'rgba(255, 255, 255, 0.78)', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none' }}
                  >
                    전체 보기 →
                  </a>
                );
              })()}
            </div>

            {/* 본문 + 찬송가 한 줄 */}
            <div style={{ position: 'relative', display: 'grid', gap: '0.4rem' }}>
              {qtLoading ? (
                <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.72)', fontSize: '0.88rem' }}>오늘의 말씀을 불러오는 중…</p>
              ) : qt?.reference || qt?.passage || qt?.hymn ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {qt?.reference && (
                      <strong style={{ fontSize: '1rem', color: '#ffffff' }}>
                        본문 · <span style={{ color: 'var(--color-primary)' }}>{qt.reference}</span>
                      </strong>
                    )}
                    {qt?.hymn && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: 999, background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', fontWeight: 700, fontSize: '0.76rem', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                        ♪ 찬송가 {qt.hymn.number}장{qt.hymn.title ? ` · ${qt.hymn.title}` : ''}
                      </span>
                    )}
                  </div>
                  {qt?.passage && (
                    <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.55, fontSize: '0.88rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {qt.passage}
                    </p>
                  )}

                  {/* 묵상 적기 */}
                  <div style={{ marginTop: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => setReflectionOpen((v) => !v)}
                      aria-expanded={reflectionOpen}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.3rem 0.7rem',
                        borderRadius: 999,
                        background: reflection ? 'rgba(32, 205, 141, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                        color: reflection ? 'var(--color-primary)' : '#ffffff',
                        border: reflection ? '1px solid rgba(32, 205, 141, 0.35)' : '1px solid rgba(255, 255, 255, 0.22)',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      ✎ 묵상 적기{reflection ? ' · 작성됨' : ''}
                      <span style={{ fontSize: '0.75rem', transform: reflectionOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease' }}>▾</span>
                    </button>

                    {reflectionOpen && (
                      <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.5rem' }}>
                        <textarea
                          value={reflection}
                          onChange={(e) => setReflection(e.target.value)}
                          placeholder="오늘 말씀을 통해 받은 은혜나 결단을 자유롭게 적어보세요."
                          rows={4}
                          style={{
                            width: '100%',
                            padding: '0.75rem 0.85rem',
                            borderRadius: 12,
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: '#ffffff',
                            fontSize: '0.9rem',
                            lineHeight: 1.55,
                            resize: 'vertical',
                            outline: 'none',
                            fontFamily: 'var(--font-sans)',
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem' }}>
                            {reflectionSavedAt
                              ? `마지막 저장: ${new Date(reflectionSavedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
                              : '아직 저장된 묵상이 없습니다.'}
                          </span>
                          <button
                            type="button"
                            onClick={saveReflection}
                            disabled={!reflectionKey}
                            style={{
                              padding: '0.4rem 0.95rem',
                              borderRadius: 10,
                              border: 'none',
                              background: reflectionKey ? 'var(--color-primary)' : 'rgba(32, 205, 141, 0.4)',
                              color: '#ffffff',
                              fontWeight: 800,
                              fontSize: '0.8rem',
                              cursor: reflectionKey ? 'pointer' : 'not-allowed',
                            }}
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.72)', fontSize: '0.88rem' }}>오늘의 해설 내용을 불러오지 못했습니다.</p>
              )}
            </div>
          </section>
          )}

          {joinedCommunities.length > 0 && !router.query.communityId && (
            <section id="community" style={{ ...cardBase, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>
                  {t('dashboard.myCommunities')} <span style={{ color: 'var(--color-ink-2)', fontWeight: 700 }}>({joinedCommunities.length}{t('dashboard.countSuffix')})</span>
                </h2>
              </div>

              <div style={{
                marginTop: '0.75rem',
                display: 'grid',
                gap: '0.75rem',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              }}>
                {joinedCommunities.map((community) => {
                  const membershipEntry = userEntries.find((entry) => entry.communityId === community.id);
                  const membershipLabel = membershipEntry?.membershipStatus === 'pending' ? '가입대기' : '일반';
                  const isActive = activeCommunityId === community.id;
                  return (
                    <button
                      key={community.id}
                      type="button"
                      onClick={() => selectCommunity(community.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '0.55rem',
                        padding: '0.95rem 1rem',
                        borderRadius: 12,
                        border: isActive ? '1px solid var(--color-primary)' : '1px solid #E7F3EE',
                        background: isActive ? 'var(--color-primary-tint)' : '#CCF4E5',
                        color: 'var(--color-ink)',
                        boxShadow: isActive ? 'var(--shadow-card)' : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontWeight: 800, fontSize: '0.98rem', lineHeight: 1.3, wordBreak: 'break-word' }}>
                        {community.name}
                      </span>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {community.isAdmin && (
                          <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, background: 'var(--color-ink)', color: '#ffffff', fontSize: '0.68rem', fontWeight: 700 }}>관리자</span>
                        )}
                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, background: isActive ? '#ffffff' : 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontSize: '0.68rem', fontWeight: 700 }}>
                          {membershipLabel}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}


          {false && activeCommunity ? (
            <>
              <section id="notice" style={{ ...cardBase, display: 'grid', gap: '1rem' }}>
                <h2 style={sectionTitle}>알림 일정</h2>
                <p style={helperText}>오늘의 모임과 교회 일정을 빠르게 확인하세요.</p>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ padding: '1rem 1.1rem', borderRadius: 12, background: '#CCF4E5', border: '1px solid #E7F3EE', borderLeft: '4px solid #20CD8D' }}>
                    <p style={{ margin: 0, color: '#20CD8D', fontWeight: 700 }}>이번주 {activeCommunity?.name} 소모임</p>
                    <span style={{ color: '#2D4048', fontSize: '0.92rem' }}>수요일 저녁 8시 / A조</span>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <section style={cardBase}>
                <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>📅 이번주 교회일정 목록</h2>
                <p style={{ ...helperText, marginTop: '0.55rem' }}>
                  <a href="/schedule" style={{ color: 'var(--color-primary-deep)', textDecoration: 'underline', fontWeight: 700 }}>전체 일정 보기 →</a>
                </p>
              </section>

              <section style={cardBase}>
                <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>📍 나의 장소예약</h2>
                <p style={{ ...helperText, marginTop: '0.55rem' }}>
                  예약된 장소가 없습니다. <a href="/reservation" style={{ color: 'var(--color-primary-deep)', textDecoration: 'underline', fontWeight: 700 }}>장소 예약하기 →</a>
                </p>
              </section>

              <section style={cardBase}>
                <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>📖 오늘의 큐티</h2>
                <p style={{ ...helperText, marginTop: '0.55rem' }}>
                  <a href="/qt/notes" style={{ color: 'var(--color-primary-deep)', textDecoration: 'underline', fontWeight: 700 }}>큐티 묵상노트 열기 →</a>
                </p>
              </section>

              <section style={cardBase}>
                <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>📕 오늘의 성경통독</h2>
                <p style={{ ...helperText, marginTop: '0.55rem' }}>
                  오늘 읽을 말씀을 확인하고 함께 통독을 진행합니다. (준비 중)
                </p>
              </section>

              <section style={cardBase}>
                <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>🌱 셀그룹 생성</h2>
                <p style={{ ...helperText, marginTop: '0.55rem' }}>
                  공동체 셀 모임을 개설하고 구성원과 자료를 관리합니다. (준비 중)
                </p>
              </section>
            </>
          )}

          {false && (
            <section>
              <div style={{ display: 'none' }}>
                <input
                  type="text"
                  value={newCommunityName}
                  onChange={(e) => setNewCommunityName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createCommunity(); }}
                  placeholder={t('dashboard.communityNamePlaceholder')}
                  style={{ padding: '0.9rem 1rem', borderRadius: 12, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', fontSize: '0.95rem', color: 'var(--color-ink)' }}
                />
                <button
                  type="button"
                  onClick={createCommunity}
                  disabled={creatingCommunity || !profileId}
                  style={{ padding: '0.6rem 1.1rem', borderRadius: 'var(--radius-lg)', border: 'none', background: creatingCommunity || !profileId ? 'rgba(32, 205, 141, 0.5)' : 'var(--color-primary)', color: '#ffffff', fontWeight: 800, fontSize: '0.9rem', cursor: creatingCommunity || !profileId ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-button)', whiteSpace: 'nowrap' }}
                >
                  {creatingCommunity ? t('dashboard.creating') : t('dashboard.createBtn')}
                </button>
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-ink)' }}>{t('dashboard.joinApproval')}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="joinApprovalMode"
                    value="auto"
                    checked={newCommunityApproval === 'auto'}
                    onChange={() => setNewCommunityApproval('auto')}
                  />
                  {t('dashboard.joinAuto')}
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="joinApprovalMode"
                    value="admin"
                    checked={newCommunityApproval === 'admin'}
                    onChange={() => setNewCommunityApproval('admin')}
                  />
                  {t('dashboard.joinAdmin')}
                </label>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-ink)' }}>{t('dashboard.requireRealName')}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="requireRealName"
                    checked={newCommunityRequireRealName}
                    onChange={() => setNewCommunityRequireRealName(true)}
                  />
                  {t('dashboard.yes')}
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="requireRealName"
                    checked={!newCommunityRequireRealName}
                    onChange={() => setNewCommunityRequireRealName(false)}
                  />
                  {t('dashboard.no')}
                </label>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-ink)' }}>공동체 타임존</span>
                <select
                  value={newCommunityTimezone}
                  onChange={(e) => setNewCommunityTimezone(e.target.value)}
                  style={{ padding: '0.6rem 0.85rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', fontSize: '0.9rem', color: 'var(--color-ink)' }}
                >
                  {['Asia/Seoul', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'America/Los_Angeles', 'America/New_York', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Australia/Sydney', 'UTC'].includes(newCommunityTimezone) ? null : (
                    <option value={newCommunityTimezone}>{newCommunityTimezone} (현재)</option>
                  )}
                  <option value="Asia/Seoul">한국 (Asia/Seoul)</option>
                  <option value="Asia/Singapore">싱가포르 (Asia/Singapore)</option>
                  <option value="Asia/Tokyo">일본 (Asia/Tokyo)</option>
                  <option value="Asia/Shanghai">중국 (Asia/Shanghai)</option>
                  <option value="America/Los_Angeles">미 서부 (America/Los_Angeles)</option>
                  <option value="America/New_York">미 동부 (America/New_York)</option>
                  <option value="America/Chicago">미 중부 (America/Chicago)</option>
                  <option value="Europe/London">영국 (Europe/London)</option>
                  <option value="Europe/Berlin">독일 (Europe/Berlin)</option>
                  <option value="Australia/Sydney">호주 (Australia/Sydney)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              {createMsg && (
                <p style={{ margin: '0.65rem 0 0', color: '#b91c1c', fontSize: '0.88rem' }}>{createMsg}</p>
              )}
              {!profileId && (
                <p style={{ margin: '0.65rem 0 0', color: '#2D4048', fontSize: '0.85rem' }}>로그인 후 공동체를 생성할 수 있습니다.</p>
              )}
            </section>
          )}

          {profileId && !profileDone && !activeCommunity && (
            <section style={{ padding: profileExpanded ? '1.5rem' : '1rem 1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', transition: 'padding 0.2s ease' }}>
              <button
                type="button"
                onClick={() => setProfileExpanded((v) => !v)}
                aria-expanded={profileExpanded}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', padding: '0.3rem 0.7rem', borderRadius: 999, background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.78rem' }}>선택사항</span>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-ink)', fontWeight: 800, letterSpacing: '-0.01em' }}>프로필을 완성해 주세요</h2>
                </div>
                <span style={{ color: 'var(--color-ink-2)', fontSize: '1rem', transform: profileExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', lineHeight: 1 }}>▾</span>
              </button>

              {profileExpanded && (
                <div style={{ marginTop: '1.1rem' }}>
                  <p style={{ margin: '0 0 1rem', color: 'var(--color-ink-2)', fontSize: '0.92rem', lineHeight: 1.6 }}>실명과 연락처를 등록하면 소모임·공동체 관리자가 더 원활히 안내할 수 있어요.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label style={{ color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.88rem' }}>실명</label>
                      <input
                        type="text"
                        value={realName}
                        onChange={(e) => setRealName(e.target.value)}
                        placeholder="실명을 입력하세요"
                        style={{ padding: '0.85rem 0.95rem', borderRadius: 12, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', fontSize: '0.95rem', color: 'var(--color-ink)' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label style={{ color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.88rem' }}>연락처</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.5rem' }}>
                        <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} style={{ padding: '0.85rem 0.6rem', borderRadius: 12, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', color: 'var(--color-ink)', appearance: 'none' }}>
                          <option value="+65">🇸🇬 +65</option>
                          <option value="+82">🇰🇷 +82</option>
                          <option value="+1">🇺🇸 +1</option>
                          <option value="+44">🇬🇧 +44</option>
                          <option value="+81">🇯🇵 +81</option>
                        </select>
                        <input
                          type="text"
                          value={contact}
                          onChange={(e) => setContact(e.target.value)}
                          placeholder="1111-1111"
                          style={{ padding: '0.85rem 0.95rem', borderRadius: 12, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', fontSize: '0.95rem', color: 'var(--color-ink)' }}
                        />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ color: profileMsg?.includes('저장') ? 'var(--color-primary-deep)' : 'var(--color-danger)', fontSize: '0.88rem' }}>{profileMsg || ''}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={() => setProfileDone(true)} style={{ padding: '0.7rem 1.1rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', color: 'var(--color-ink-2)', fontWeight: 700, cursor: 'pointer' }}>
                        나중에
                      </button>
                      <button type="button" onClick={saveProfile} disabled={savingProfile} style={{ padding: '0.7rem 1.2rem', borderRadius: 10, border: 'none', background: savingProfile ? 'rgba(32, 205, 141, 0.5)' : 'var(--color-primary)', color: '#ffffff', fontWeight: 800, cursor: savingProfile ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-button)' }}>
                        {savingProfile ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
      </AppShell>

      {previewBulletin && (
        <WorshipBulletinPreview value={previewBulletin} onClose={() => setPreviewBulletin(null)} />
      )}

    </>
  );
};

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (context) => {
  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const queryNickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const queryEmail = typeof context.query.email === 'string' ? context.query.email : null;
  const provider = profileId && profileId.includes('-') ? profileId.split('-')[0] : null;

  const [communitiesArr, usersArr, profilesArr] = await Promise.all([
    getCommunities(),
    getUsers(),
    getProfiles().catch(() => [] as any[]),
  ]);

  const communities = communitiesArr as Community[];
  const users = usersArr as UserEntry[];
  const profiles = profilesArr as Array<NonNullable<StoredProfile>>;
  const storedProfile = profileId ? profiles.find((p) => p.profileId === profileId) || null : null;

  const providerPrefix = profileId && profileId.includes('-') ? profileId.split('-')[0] : null;
  const userEntries = profileId
    ? users.filter((entry) => {
        const exactMatch = entry.providerProfileId === profileId;
        const nicknameFallback = providerPrefix && queryNickname && entry.providerProfileId.startsWith(`${providerPrefix}-`) && entry.nickname === queryNickname;
        const emailFallback = queryEmail && entry.profile?.kakao_account?.email === queryEmail;
        return exactMatch || nicknameFallback || emailFallback;
      })
    : [];

  const joinedCommunityIds = profileId ? Array.from(new Set(userEntries.map((user) => user.communityId))) : [];
  const myNickname = queryNickname || userEntries[0]?.nickname || null;
  const myEmail = queryEmail || userEntries[0]?.profile?.kakao_account?.email || null;
  const joinedCommunities = communities
    .filter((community) => joinedCommunityIds.includes(community.id))
    .map((community) => ({
      ...community,
      isAdmin: profileId
        ? community.adminProfileId === profileId
          || (!!providerPrefix && !!myNickname && community.adminProfileId === `${providerPrefix}-${myNickname}`)
          || (!!myEmail && community.adminProfileId === myEmail)
        : false,
    }));

  let systemAdminHref: string | null = null;
  try {
    const parsed = (await getSystemAdmins()) as { profileIds?: string[] };
    const allowed = Array.isArray(parsed?.profileIds) && profileId ? parsed.profileIds.includes(profileId) : false;
    const token = process.env.ADMIN_ACCESS_TOKEN;
    if (allowed && token && profileId) {
      const qs = new URLSearchParams({ profileId, k: token });
      if (myNickname) qs.set('nickname', myNickname);
      if (myEmail) qs.set('email', myEmail);
      systemAdminHref = `/admin/system?${qs.toString()}`;
    }
  } catch {
    systemAdminHref = null;
  }

  return {
    props: {
      profileId,
      provider,
      nickname: queryNickname,
      email: queryEmail,
      joinedCommunities,
      userEntries,
      storedProfile,
      systemAdminHref,
    },
  };
};

export default Dashboard;