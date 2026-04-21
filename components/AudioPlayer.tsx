import { createContext, ReactNode, useContext, useRef, useState } from 'react';

type Ctx = {
  src: string | null;
  isOpen: boolean;
  play: (url: string, label?: string) => void;
  close: () => void;
};

const AudioCtx = createContext<Ctx | null>(null);

export const useAudio = (): Ctx => {
  const c = useContext(AudioCtx);
  if (!c) throw new Error('useAudio must be used within AudioProvider');
  return c;
};

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [label, setLabel] = useState<string>('오늘의 큐티');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // BottomNav 제거됨 — 모든 페이지에서 하단 여백 동일

  const play = (url: string, lbl?: string) => {
    if (lbl) setLabel(lbl);
    setSrc(url);
  };

  const close = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setSrc(null);
  };

  return (
    <AudioCtx.Provider value={{ src, isOpen: Boolean(src), play, close }}>
      {children}
      {src && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 16, zIndex: 9999, padding: '0 0.75rem', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ width: '100%', maxWidth: 960, display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.5rem 0.75rem', borderRadius: 12, background: 'rgba(24, 37, 39, 0.96)', color: '#ffffff', boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)', pointerEvents: 'auto' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>{label}</span>
            <audio ref={audioRef} controls autoPlay preload="auto" src={src} style={{ flex: 1, height: 36 }} />
            <button
              type="button"
              onClick={close}
              aria-label="재생 종료"
              title="재생 종료"
              style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem 0.4rem' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </AudioCtx.Provider>
  );
};
