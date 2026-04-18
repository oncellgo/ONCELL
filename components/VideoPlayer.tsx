import { createContext, ReactNode, useContext, useState } from 'react';

type Ctx = {
  vid: string | null;
  label: string;
  play: (videoId: string, label?: string) => void;
  close: () => void;
};

const VideoCtx = createContext<Ctx | null>(null);

export const useVideo = (): Ctx => {
  const c = useContext(VideoCtx);
  if (!c) throw new Error('useVideo must be used within VideoProvider');
  return c;
};

export const VideoProvider = ({ children }: { children: ReactNode }) => {
  const [vid, setVid] = useState<string | null>(null);
  const [label, setLabel] = useState<string>('');
  const [minimized, setMinimized] = useState(false);

  const play = (videoId: string, lbl?: string) => {
    setVid(videoId);
    setLabel(lbl || '');
    setMinimized(false);
  };

  const close = () => {
    setVid(null);
    setLabel('');
  };

  return (
    <VideoCtx.Provider value={{ vid, label, play, close }}>
      {children}
      {vid && (
        minimized ? (
          <div style={{ position: 'fixed', right: 16, bottom: 96, zIndex: 9998, width: 280, maxWidth: 'calc(100vw - 32px)', background: '#000', borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 32px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.5rem', background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || '재생 중'}</span>
              <span style={{ display: 'inline-flex', gap: '0.3rem' }}>
                <button type="button" onClick={() => setMinimized(false)} aria-label="확대" style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 0.2rem', fontSize: '0.85rem' }}>⤢</button>
                <button type="button" onClick={close} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 0.2rem', fontSize: '0.95rem' }}>✕</button>
              </span>
            </div>
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
              <iframe
                src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
                title="YouTube player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
              />
            </div>
          </div>
        ) : (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ width: '100%', maxWidth: 800, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ color: '#fff', fontSize: '0.88rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingRight: '0.5rem' }}>{label || ''}</span>
                <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
                  <button type="button" onClick={() => setMinimized(true)} aria-label="작게 보기" title="작게 보기" style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>⤡</button>
                  <button type="button" onClick={close} aria-label="닫기" title="닫기" style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
                </span>
              </div>
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
                  title="YouTube player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                />
              </div>
              <div style={{ marginTop: '0.4rem', textAlign: 'center', color: '#cbd5d0', fontSize: '0.72rem' }}>
                다른 페이지로 이동해도 영상은 계속 재생됩니다.
              </div>
            </div>
            <div style={{ position: 'absolute', inset: 0, zIndex: -1 }} onClick={() => setMinimized(true)} />
          </div>
        )
      )}
    </VideoCtx.Provider>
  );
};
