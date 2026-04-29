import React, { useState } from 'react';
import { useVideo } from './VideoPlayer';
import DateTimePicker from './DateTimePicker';
import { useIsMobile } from '../lib/useIsMobile';

export type BulletinItem = {
  id: string;
  title: string;
  description?: string;
  presenter?: string;
  passage?: string;
  prayerNote?: string;
  songs?: { title: string; link: string }[];
};

export type BulletinDesign = {
  background?: { type: 'default'; value: 'default1' | 'default2' } | { type: 'upload'; dataUrl: string } | null;
  logo?: { dataUrl: string } | null;
  churchName?: string;
  worshipLabel?: string;
  homepage?: string;
  footer?: string;
};

export type BulletinContent = {
  bulletinName?: string;
  theme?: string;
  worshipDate?: string;
  worshipTime?: string;
  worshipLocation?: string;
  items?: BulletinItem[];
  announcementTitle?: string;
  announcements?: { title: string; content: string; noTitle?: boolean }[];
};

export type Bulletin = {
  design?: BulletinDesign;
  content?: BulletinContent;
  // Legacy flat fields — accepted on input via normalizeBulletin; not used after normalize
  background?: BulletinDesign['background'];
  logo?: BulletinDesign['logo'];
  churchName?: string;
  bulletinName?: string;
  theme?: string;
  worshipLabel?: string;
  worshipDate?: string;
  worshipTime?: string;
  worshipLocation?: string;
  items?: BulletinItem[];
  announcementTitle?: string;
  announcements?: { title: string; content: string; noTitle?: boolean }[];
  homepage?: string;
  footer?: string;
};

const DESIGN_KEYS: (keyof BulletinDesign)[] = ['background', 'logo', 'churchName', 'worshipLabel', 'homepage', 'footer'];
const CONTENT_KEYS: (keyof BulletinContent)[] = ['bulletinName', 'theme', 'worshipDate', 'worshipTime', 'worshipLocation', 'items', 'announcementTitle', 'announcements'];

export const normalizeBulletin = (raw: any): Bulletin => {
  if (!raw || typeof raw !== 'object') return { design: {}, content: {} };
  const design: any = { ...(raw.design || {}) };
  const content: any = { ...(raw.content || {}) };
  for (const k of DESIGN_KEYS) {
    if (raw[k] !== undefined && design[k] === undefined) design[k] = raw[k];
  }
  for (const k of CONTENT_KEYS) {
    if (raw[k] !== undefined && content[k] === undefined) content[k] = raw[k];
  }
  return { design, content };
};

const toFlat = (b: Bulletin): any => {
  const n = normalizeBulletin(b);
  return { ...(n.design || {}), ...(n.content || {}) };
};

const toNested = (flat: any): Bulletin => {
  const design: any = {};
  const content: any = {};
  for (const k of DESIGN_KEYS) if (flat[k] !== undefined) design[k] = flat[k];
  for (const k of CONTENT_KEYS) if (flat[k] !== undefined) content[k] = flat[k];
  return { design, content };
};

const computeNextSundayLabel = () => {
  const now = new Date();
  const day = now.getDay();
  const daysUntil = day === 0 ? 7 : (7 - day);
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil);
  return `${next.getFullYear()}.${next.getMonth() + 1}.${next.getDate()}(일)`;
};

type Props = {
  value: Bulletin;
  onChange: (next: Bulletin) => void;
  initialEditMode?: boolean;
  onPublish?: () => void;
  onUnpublish?: () => void;
  isPublished?: boolean;
  onApplyDesignToAll?: () => void;
};

const computeBgStyle = (bg: Bulletin['background']) => {
  const bgImage = bg?.type === 'default' && bg.value === 'default2' ? '/images/bg2.png'
    : bg?.type === 'default' ? '/images/bg1.png' : null;
  return bgImage
    ? `linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(${bgImage})`
    : bg?.type === 'upload' && bg.dataUrl
      ? `linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(${bg.dataUrl})`
      : 'none';
};

export const WorshipBulletinPreview = ({ value: rawValue, onClose }: { value: Bulletin; onClose: () => void }) => {
  const value: any = toFlat(rawValue);
  const video = useVideo();
  const items = value.items || [];
  const announcements = value.announcements && value.announcements.length > 0 ? value.announcements : [{ title: '광고', content: '' }];
  const bgStyle = computeBgStyle(value.background);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div role="dialog" aria-modal="true" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', position: 'relative', background: 'transparent' }}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 8, right: 12, background: 'rgba(255,255,255,0.85)', border: 'none', fontSize: '1.2rem', cursor: 'pointer', zIndex: 2, borderRadius: 999, width: 32, height: 32 }}>✕</button>
        <div style={{ padding: '1rem 1rem 1rem', borderRadius: 16, backgroundColor: '#fff', backgroundImage: bgStyle, backgroundSize: 'cover', backgroundPosition: 'center', display: 'grid', gap: '0.5rem', position: 'relative' }}>
          {value.churchName && <div style={{ position: 'absolute', top: 10, right: 16, fontSize: '0.8rem', fontWeight: 700, color: '#20CD8D' }}>{value.churchName}</div>}
          <div style={{ padding: '1.25rem 0 0.5rem', textAlign: 'center', display: 'grid', gap: '0.4rem', justifyItems: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.85rem', justifyContent: 'center', width: '100%' }}>
              <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to right, transparent, #182527)' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#20CD8D', letterSpacing: '0.4em', textTransform: 'uppercase' }}>{value.worshipLabel || 'WORSHIP'}</span>
              <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to left, transparent, #182527)' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: '#1E293B', letterSpacing: '-0.01em', lineHeight: 1.2, fontFamily: '"Pretendard", "Plus Jakarta Sans", "Noto Serif KR", serif' }}>{value.theme || '네가 나를 사랑하느냐?'}</h2>
            <div style={{ width: 80, height: 3, background: '#20CD8D', borderRadius: 999 }} />
            <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.02em' }}>
              {value.bulletinName || '주일예배'} | {value.worshipDate || computeNextSundayLabel()} {value.worshipTime || '오전 11:00'} | {value.worshipLocation || '2층 사랑홀'}
            </div>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
            {items.map((item) => (
              <li key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.55rem', borderBottom: '1px dotted #cbd5d0', width: 500, maxWidth: '100%', margin: '0 auto' }}>
                <span style={{ fontWeight: 700, color: '#182527', fontSize: '0.92rem', textAlign: 'left' }}>{item.title}</span>
                <span style={{ color: '#2D4048', fontSize: '0.85rem', textAlign: 'center' }}>{item.description || ''}</span>
                <span style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>{item.presenter || ''}</span>
                {item.songs && item.songs.length > 0 && (
                  <ul style={{ gridColumn: '1 / -1', margin: '0.3rem auto 0.2rem', padding: 0, listStyle: 'none', display: 'grid', gap: '0.3rem', width: 'fit-content', textAlign: 'left' }}>
                    {item.songs.map((song, sIdx) => {
                      const vid = ytId(song.link);
                      return (
                        <li key={sIdx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#475569' }}>
                          <span style={{ color: '#94a3b8', fontSize: '0.85rem', minWidth: 12 }}>•</span>
                          <span style={{ fontWeight: 600, color: '#182527' }}>{song.title || '(제목 없음)'}</span>
                          {vid ? (
                            <button type="button" onClick={() => video.play(vid, song.title || '찬양')} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                              <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="YouTube" style={{ width: 56, height: 32, borderRadius: 4, border: '1px solid #cbd5d0', objectFit: 'cover', display: 'block' }} />
                            </button>
                          ) : <span style={{ width: 56, height: 32 }} />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.7rem', justifyItems: 'center' }}>
            {announcements.map((ann, i) => (
              <div key={i} style={{ width: 500, maxWidth: '100%', textAlign: 'center', padding: ann.noTitle ? '0.5rem 1rem' : '0.75rem 1rem', border: '1px solid #cbd5d0', borderRadius: 14, background: 'rgba(255,255,255,0.55)' }}>
                {!ann.noTitle && <h3 style={{ margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: 800, color: '#182527' }}>{ann.title || '광고'}</h3>}
                {ann.content && <p style={{ margin: 0, fontSize: '0.88rem', color: '#182527', lineHeight: 1.5, whiteSpace: 'pre-wrap', textAlign: ann.noTitle ? 'center' : 'left' }}>{ann.content}</p>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #cbd5d0', textAlign: 'center', fontSize: '0.78rem' }}>
            <div style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 700 }}>ONCELL</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ytId = (url: string): string | null => {
  const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
};

const WorshipBulletinEditor = ({ value: rawValue, onChange, initialEditMode = false, onPublish, onUnpublish, isPublished, onApplyDesignToAll }: Props) => {
  const video = useVideo();
  const isMobile = useIsMobile();
  const editMode = true;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [songDrag, setSongDrag] = useState<{ itemId: string; from: number } | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPresenter, setNewPresenter] = useState('');

  // Flatten nested/legacy input so internal JSX can use flat field access; convert back on update.
  const value: any = toFlat(rawValue);
  const update = (patch: Partial<Bulletin>) => {
    const merged = { ...value, ...patch };
    onChange(toNested(merged));
  };

  const items: BulletinItem[] = value.items || [];
  const announcements: { title: string; content: string; noTitle?: boolean }[] = value.announcements && value.announcements.length > 0 ? value.announcements : [{ title: '광고', content: '' }];
  const updateItems = (items: BulletinItem[]) => update({ items });
  const updateAnnouncements = (anns: { title: string; content: string; noTitle?: boolean }[]) => update({ announcements: anns });

  const addItem = () => {
    if (!newTitle.trim()) return;
    updateItems([...items, { id: `wt-${Date.now()}-${Math.floor(Math.random() * 1000)}`, title: newTitle.trim(), description: newDesc.trim(), presenter: newPresenter.trim() }]);
    setNewTitle(''); setNewDesc(''); setNewPresenter('');
  };

  const updateItem = (id: string, patch: Partial<BulletinItem>) => {
    updateItems(items.map((it) => it.id === id ? { ...it, ...patch } : it));
  };

  const removeItem = (id: string) => updateItems(items.filter((it) => it.id !== id));

  const reorderItem = (id: string, toIdx: number) => {
    const fromIdx = items.findIndex((it) => it.id === id);
    if (fromIdx === -1) return;
    const arr = [...items];
    const [m] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, m);
    updateItems(arr);
  };

  const updateSongs = (itemId: string, songs: { title: string; link: string }[]) => updateItem(itemId, { songs });

  const bgImage = value.background?.type === 'default' && value.background.value === 'default2' ? '/images/bg2.png'
    : value.background?.type === 'default' ? '/images/bg1.png' : null;
  const bgStyle = bgImage
    ? `linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(${bgImage})`
    : value.background?.type === 'upload' && value.background.dataUrl
      ? `linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(${value.background.dataUrl})`
      : 'none';

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <style>{`
        .wbe input::placeholder, .wbe textarea::placeholder { color: #b4c2c7; font-style: italic; font-weight: 400; opacity: 1; }
        .wbe input.wbe-ph-empty, .wbe textarea.wbe-ph-empty { color: #b4c2c7; font-style: italic; font-weight: 400; }
      `}</style>
      <div className="wbe" style={{ display: 'contents' }}>
      {/* 배경 + 편집/미리보기 */}
      <div style={{ padding: '0.75rem 0.85rem', border: '1px solid #E7F3EE', borderRadius: 12, background: '#F9FCFB', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.9rem', color: '#20CD8D' }}>배경</strong>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'nowrap' }}>
          {(['default1', 'default2'] as const).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="radio" name="bg" checked={value.background?.type === 'default' && value.background.value === v} onChange={() => update({ background: { type: 'default', value: v } })} />
              {v === 'default1' ? '기본1' : '기본2'}
            </label>
          ))}
        </div>
        <button type="button" onClick={() => setPreviewOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', marginLeft: 'auto', boxShadow: 'var(--shadow-button)' }}>👁 주보 미리보기</button>
        {onPublish && !isPublished && (
          <button type="button" onClick={onPublish} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-md)', border: 'none', background: '#20CD8D', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', boxShadow: 'var(--shadow-button)' }}>📢 공동체에 배포</button>
        )}
        {onUnpublish && isPublished && (
          <button type="button" onClick={onUnpublish} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-md)', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', boxShadow: 'var(--shadow-button)' }}>↩ 회수</button>
        )}
        {onApplyDesignToAll && (
          <button type="button" onClick={onApplyDesignToAll} title="배경·로고·공동체이름 등 디자인을 모든 예배 주보에 적용" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid #20CD8D', background: '#fff', color: '#20CD8D', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>🎨 디자인 일괄 적용</button>
        )}
      </div>

      {/* 본문 컨테이너 */}
      <div style={{ display: 'grid', gap: '0.5rem', padding: isMobile ? '0.5rem 0.5rem 0' : '0.5rem 1rem 0', borderRadius: 12, width: isMobile ? '100%' : 600, maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box', overflow: 'visible', position: 'relative', backgroundColor: '#fff', backgroundImage: bgStyle, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <input
          type="text"
          value={value.churchName || ''}
          onChange={(e) => update({ churchName: e.target.value })}
          placeholder="공동체 이름"
          style={{ position: 'absolute', top: 10, right: 14, padding: '0.2rem 0.5rem', borderRadius: 6, border: '1px dashed transparent', fontSize: '0.8rem', fontWeight: 700, color: '#20CD8D', background: 'transparent', textAlign: 'right', width: 180, maxWidth: '40%', zIndex: 1 }}
          onFocus={(e) => { e.target.style.border = '1px dashed var(--color-primary)'; e.target.style.background = 'rgba(255,255,255,0.7)'; }}
          onBlur={(e) => { e.target.style.border = '1px dashed transparent'; e.target.style.background = 'transparent'; }}
        />
        <div style={{ padding: '1rem 0.25rem 0.5rem', marginTop: '1rem', display: 'grid', gap: '0.5rem', justifyItems: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.85rem', justifyContent: 'center', width: '100%' }}>
            <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to right, transparent, #182527)' }} />
            <input
              type="text"
              value={value.worshipLabel ?? 'WORSHIP'}
              onChange={(e) => update({ worshipLabel: e.target.value })}
              placeholder="WORSHIP"
              style={{ fontSize: '0.78rem', fontWeight: 800, color: '#20CD8D', letterSpacing: '0.4em', textTransform: 'uppercase', textAlign: 'center', border: 'none', background: 'transparent', padding: '0.1rem 0.3rem', width: 130, fontFamily: 'inherit' }}
            />
            <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to left, transparent, #182527)' }} />
          </div>
          <input
            type="text"
            value={value.theme || ''}
            onChange={(e) => update({ theme: e.target.value })}
            placeholder="네가 나를 사랑하느냐?"
            style={{ padding: isMobile ? '0.3rem 0.5rem' : '0.4rem 0.9rem', borderRadius: 10, border: 'none', fontSize: isMobile ? '1.3rem' : '1.85rem', fontWeight: 800, color: '#1E293B', textAlign: 'center', width: isMobile ? '100%' : 480, maxWidth: '100%', display: 'block', margin: '0 auto', background: 'transparent', letterSpacing: '-0.01em', lineHeight: 1.2, fontFamily: '"Pretendard", "Plus Jakarta Sans", "Noto Serif KR", serif' }}
          />
          <div style={{ width: 80, height: 3, background: '#20CD8D', borderRadius: 999 }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center', fontSize: '0.85rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.02em' }}>
            <input
              type="text"
              value={value.bulletinName || ''}
              onChange={(e) => update({ bulletinName: e.target.value })}
              placeholder="주일예배"
              style={{ padding: '0.15rem 0.3rem', borderRadius: 6, border: 'none', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textAlign: 'center', width: 90, background: 'transparent' }}
            />
            <span style={{ color: '#cbd5d0' }}>|</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
              <input
                type="text"
                value={value.worshipDate || computeNextSundayLabel()}
                onChange={(e) => update({ worshipDate: e.target.value })}
                placeholder="2026.4.19(일)"
                style={{ padding: '0.15rem 0', borderRadius: 6, border: 'none', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textAlign: 'right', width: 100, background: 'transparent' }}
              />
              <input
                type="text"
                value={value.worshipTime ?? '오전 11:00'}
                onChange={(e) => update({ worshipTime: e.target.value })}
                placeholder="오전 11:00"
                style={{ padding: '0.15rem 0', borderRadius: 6, border: 'none', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textAlign: 'left', width: 80, background: 'transparent', marginLeft: 4 }}
              />
            </span>
            <span style={{ color: '#cbd5d0' }}>|</span>
            <input
              type="text"
              value={value.worshipLocation ?? '2층 사랑홀'}
              onChange={(e) => update({ worshipLocation: e.target.value })}
              placeholder="2층 사랑홀"
              style={{ padding: '0.15rem 0.3rem', borderRadius: 6, border: 'none', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textAlign: 'center', width: 110, background: 'transparent' }}
            />
          </div>
        </div>

        <div style={{ padding: '0.25rem', display: 'grid', gap: '0.5rem' }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
            {items.map((item, idx) => (
              <React.Fragment key={item.id}>
                <li
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragIndex === null || dragIndex === idx) { setDragIndex(null); return; } reorderItem(items[dragIndex].id, idx); setDragIndex(null); }}
                  style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.45rem', border: '1px solid #E7F3EE', borderRadius: 8, background: dragIndex === idx ? '#CCF4E5' : '#F9FCFB', opacity: dragIndex !== null && dragIndex !== idx ? 0.85 : 1, width: isMobile ? '100%' : 500, maxWidth: '100%', margin: '0 auto' }}
                >
                  <button type="button" onClick={() => { if (window.confirm(`'${item.title}' 항목을 삭제할까요?`)) removeItem(item.id); }} aria-label="삭제" style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, padding: 0, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                  <span draggable onDragStart={() => setDragIndex(idx)} onDragEnd={() => setDragIndex(null)} style={{ color: '#94a3b8', fontSize: '0.95rem', cursor: 'grab', userSelect: 'none', padding: '0 0.2rem' }} title="드래그">⋮⋮</span>
                  {editMode ? (
                    <>
                      <input type="text" value={item.title} onChange={(e) => updateItem(item.id, { title: e.target.value })} style={{ fontWeight: 700, color: '#182527', fontSize: '0.92rem', textAlign: 'left', padding: '0.15rem 0.4rem', borderRadius: 6, border: '1px solid #cbd5d0', minWidth: 0 }} />
                      <input type="text" value={item.description || ''} placeholder="설명" onChange={(e) => updateItem(item.id, { description: e.target.value })} style={{ color: '#2D4048', fontSize: '0.85rem', textAlign: 'center', padding: '0.15rem 0.4rem', borderRadius: 6, border: '1px solid #cbd5d0', minWidth: 0 }} />
                      <input type="text" value={item.presenter || ''} placeholder="담당자" onChange={(e) => updateItem(item.id, { presenter: e.target.value })} style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'right', padding: '0.15rem 0.4rem', borderRadius: 6, border: '1px solid #cbd5d0', minWidth: 0 }} />
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
                  <li style={{ width: isMobile ? '100%' : 500, maxWidth: '100%', margin: '0 auto', padding: '0.4rem 0.55rem', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5d0', borderRadius: 8, display: 'grid', gap: '0.35rem' }}>
                    {(item.songs || []).map((song, sIdx) => {
                      const vid = ytId(song.link);
                      return (
                        <div key={sIdx} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!songDrag || songDrag.itemId !== item.id || songDrag.from === sIdx) { setSongDrag(null); return; } const arr = [...(item.songs || [])]; const [m] = arr.splice(songDrag.from, 1); arr.splice(sIdx, 0, m); updateSongs(item.id, arr); setSongDrag(null); }} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '0.35rem', alignItems: 'center', background: songDrag?.itemId === item.id && songDrag.from === sIdx ? '#CCF4E5' : 'transparent', padding: '0.15rem 0.25rem', borderRadius: 6 }}>
                          <button type="button" onClick={() => updateSongs(item.id, (item.songs || []).filter((_, i) => i !== sIdx))} aria-label="삭제" style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, padding: 0, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                          <span draggable onDragStart={() => setSongDrag({ itemId: item.id, from: sIdx })} onDragEnd={() => setSongDrag(null)} style={{ color: '#94a3b8', fontSize: '0.85rem', cursor: 'grab', userSelect: 'none' }} title="드래그">⋮⋮</span>
                          <input type="text" value={song.title} placeholder={`찬양제목${sIdx + 1}`} onChange={(e) => updateSongs(item.id, (item.songs || []).map((s, i) => i === sIdx ? { ...s, title: e.target.value } : s))} style={{ padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5d0', fontSize: '0.82rem', fontWeight: 700, minWidth: 0 }} />
                          <input type="url" value={song.link} placeholder={`유튜브링크${sIdx + 1}`} onChange={(e) => updateSongs(item.id, (item.songs || []).map((s, i) => i === sIdx ? { ...s, link: e.target.value } : s))} style={{ padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5d0', fontSize: '0.78rem', color: '#0ea5e9', minWidth: 0 }} />
                          {vid ? (
                            <button type="button" onClick={() => video.play(vid, song.title || '찬양')} title="재생" style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                              <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="YouTube" style={{ width: 56, height: 32, borderRadius: 4, border: '1px solid #cbd5d0', objectFit: 'cover', display: 'block' }} />
                            </button>
                          ) : <span style={{ width: 56, height: 32, borderRadius: 4, border: '1px dashed #cbd5d0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.6rem' }}>썸네일</span>}
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => updateSongs(item.id, [...(item.songs || []), { title: '', link: '' }])} style={{ justifySelf: 'center', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.7rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>+ 찬양 추가</button>
                  </li>
                )}
              </React.Fragment>
            ))}
          </ul>

          {/* 예배항목 추가 */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr auto', gap: '0.4rem', width: isMobile ? '100%' : 500, maxWidth: '100%', margin: '0.5rem auto 0' }}>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="제목" style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem', textAlign: 'left', minWidth: 0 }} />
            <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="설명" style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem', textAlign: 'center', minWidth: 0 }} />
            <input type="text" value={newPresenter} onChange={(e) => setNewPresenter(e.target.value)} placeholder="담당자" style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #cbd5d0', fontSize: '0.85rem', textAlign: 'right', minWidth: 0 }} />
            <button type="button" onClick={addItem} disabled={!newTitle.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.7rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.8rem', cursor: newTitle.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>+ 예배항목 추가</button>
          </div>

          {/* 광고 */}
          <div style={{ marginTop: '1rem', marginBottom: '0.85rem', display: 'grid', gap: '0.85rem', justifyItems: 'center' }}>
            {announcements.map((ann, i) => ann.noTitle ? null : (
              <div key={i} style={{ position: 'relative', width: isMobile ? '100%' : 500, maxWidth: '100%', display: 'grid', gap: '0.3rem', justifyItems: 'center', padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem', border: '1px solid #cbd5d0', borderRadius: 14, background: 'rgba(255,255,255,0.55)' }}>
                <input type="text" value={ann.title} onChange={(e) => updateAnnouncements(announcements.map((a, idx) => idx === i ? { ...a, title: e.target.value } : a))} placeholder="광고" style={{ width: '100%', fontSize: '1.05rem', fontWeight: 800, color: '#182527', textAlign: 'center', border: '1px dashed transparent', borderRadius: 6, padding: '0.1rem 0.4rem', background: 'transparent' }} />
                <textarea value={ann.content} onChange={(e) => updateAnnouncements(announcements.map((a, idx) => idx === i ? { ...a, content: e.target.value } : a))} rows={3} placeholder="내용" style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem', background: 'rgba(255,255,255,0.85)', resize: 'vertical', boxSizing: 'border-box' }} />
                {announcements.length > 1 && (
                  <button type="button" onClick={() => updateAnnouncements(announcements.filter((_, idx) => idx !== i))} aria-label="삭제" style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, padding: 0, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => { const last = [...announcements].reverse().find((a) => !a.noTitle)?.title || '광고'; updateAnnouncements([...announcements, { title: last, content: '' }]); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.75rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>+ 타이틀항목 추가</button>
            {announcements.map((ann, i) => ann.noTitle ? (
              <div key={i} style={{ position: 'relative', width: isMobile ? '100%' : 500, maxWidth: '100%', display: 'grid', gap: '0.3rem', justifyItems: 'center', padding: isMobile ? '0.5rem 0.7rem' : '0.5rem 1rem', border: '1px solid #cbd5d0', borderRadius: 14, background: 'rgba(255,255,255,0.55)' }}>
                <input type="text" value={ann.content} onChange={(e) => updateAnnouncements(announcements.map((a, idx) => idx === i ? { ...a, content: e.target.value } : a))} placeholder="내용을 입력하세요" style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid #cbd5d0', fontSize: '0.9rem', background: 'rgba(255,255,255,0.85)', boxSizing: 'border-box' }} />
                <button type="button" onClick={() => updateAnnouncements(announcements.filter((_, idx) => idx !== i))} aria-label="삭제" style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, padding: 0, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            ) : null)}
            <button type="button" onClick={() => updateAnnouncements([...announcements, { title: '', content: '', noTitle: true }])} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.75rem', borderRadius: 999, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }} title="제목 없는 한줄 항목 추가">+ 한줄 항목추가</button>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div onClick={() => setPreviewOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div role="dialog" aria-modal="true" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', position: 'relative', background: 'transparent' }}>
            <button type="button" onClick={() => setPreviewOpen(false)} style={{ position: 'absolute', top: 8, right: 12, background: 'rgba(255,255,255,0.85)', border: 'none', fontSize: '1.2rem', cursor: 'pointer', zIndex: 2, borderRadius: 999, width: 32, height: 32 }}>✕</button>
            <div style={{ padding: '1rem 1rem 1rem', borderRadius: 16, backgroundColor: '#fff', backgroundImage: bgStyle, backgroundSize: 'cover', backgroundPosition: 'center', display: 'grid', gap: '0.5rem', position: 'relative' }}>
              {value.churchName && <div style={{ position: 'absolute', top: 10, right: 16, fontSize: '0.8rem', fontWeight: 700, color: '#20CD8D' }}>{value.churchName}</div>}
              <div style={{ padding: '1.25rem 0 0.5rem', textAlign: 'center', display: 'grid', gap: '0.4rem', justifyItems: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.85rem', justifyContent: 'center', width: '100%' }}>
                  <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to right, transparent, #182527)' }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#20CD8D', letterSpacing: '0.4em', textTransform: 'uppercase' }}>{value.worshipLabel || 'WORSHIP'}</span>
                  <span style={{ flex: 1, maxWidth: 60, height: 2, background: 'linear-gradient(to left, transparent, #182527)' }} />
                </div>
                <h2 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: '#1E293B', letterSpacing: '-0.01em', lineHeight: 1.2, fontFamily: '"Pretendard", "Plus Jakarta Sans", "Noto Serif KR", serif' }}>{value.theme || '네가 나를 사랑하느냐?'}</h2>
                <div style={{ width: 80, height: 3, background: '#20CD8D', borderRadius: 999 }} />
                <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.02em' }}>
                  {value.bulletinName || '주일예배'} | {value.worshipDate || computeNextSundayLabel()} {value.worshipTime || '오전 11:00'} | {value.worshipLocation || '2층 사랑홀'}
                </div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
                {items.map((item) => (
                  <li key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.55rem', borderBottom: '1px dotted #cbd5d0', width: 500, maxWidth: '100%', margin: '0 auto' }}>
                    <span style={{ fontWeight: 700, color: '#182527', fontSize: '0.92rem', textAlign: 'left' }}>{item.title}</span>
                    <span style={{ color: '#2D4048', fontSize: '0.85rem', textAlign: 'center' }}>{item.description || ''}</span>
                    <span style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>{item.presenter || ''}</span>
                    {item.songs && item.songs.length > 0 && (
                      <ul style={{ gridColumn: '1 / -1', margin: '0.3rem auto 0.2rem', padding: 0, listStyle: 'none', display: 'grid', gap: '0.3rem', width: 'fit-content', textAlign: 'left' }}>
                        {item.songs.map((song, sIdx) => {
                          const vid = ytId(song.link);
                          return (
                            <li key={sIdx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#475569' }}>
                              <span style={{ color: '#94a3b8', fontSize: '0.85rem', minWidth: 12 }}>•</span>
                              <span style={{ fontWeight: 600, color: '#182527' }}>{song.title || '(제목 없음)'}</span>
                              {vid ? (
                                <button type="button" onClick={() => video.play(vid, song.title || '찬양')} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                                  <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="YouTube" style={{ width: 56, height: 32, borderRadius: 4, border: '1px solid #cbd5d0', objectFit: 'cover', display: 'block' }} />
                                </button>
                              ) : <span style={{ width: 56, height: 32 }} />}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '1rem', display: 'grid', gap: '0.7rem', justifyItems: 'center' }}>
                {announcements.map((ann, i) => (
                  <div key={i} style={{ width: 500, maxWidth: '100%', textAlign: 'center', padding: ann.noTitle ? '0.5rem 1rem' : '0.75rem 1rem', border: '1px solid #cbd5d0', borderRadius: 14, background: 'rgba(255,255,255,0.55)' }}>
                    {!ann.noTitle && <h3 style={{ margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: 800, color: '#182527' }}>{ann.title || '광고'}</h3>}
                    {ann.content && <p style={{ margin: 0, fontSize: '0.88rem', color: '#182527', lineHeight: 1.5, whiteSpace: 'pre-wrap', textAlign: ann.noTitle ? 'center' : 'left' }}>{ann.content}</p>}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #cbd5d0', textAlign: 'center', fontSize: '0.78rem' }}>
                <div style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 700 }}>ONCELL</div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default WorshipBulletinEditor;
