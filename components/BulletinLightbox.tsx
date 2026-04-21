import { useEffect, useRef, useState } from 'react';

type LightboxImage = { src: string; alt: string };

type Props = {
  images: LightboxImage[];
  initialIndex?: number;
  onClose: () => void;
  title?: string;
};

/**
 * 주보(또는 유사 이미지) 전체화면 뷰어.
 * - 모바일: 네이티브 pinch-zoom + pan (touch-action: pinch-zoom)
 * - 데스크톱: 더블클릭(또는 버튼)으로 줌 토글, 드래그로 팬
 * - ← / → 키로 페이지 이동, ESC 로 닫기
 */
const BulletinLightbox = ({ images, initialIndex = 0, onClose, title }: Props) => {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement | null>(null);

  const total = images.length;
  const hasMultiple = total > 1;

  const goPrev = () => {
    if (!hasMultiple) return;
    setIndex((i) => (i - 1 + total) % total);
    setZoom(1); setPan({ x: 0, y: 0 });
  };
  const goNext = () => {
    if (!hasMultiple) return;
    setIndex((i) => (i + 1) % total);
    setZoom(1); setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.5, 4));
      else if (e.key === '-') setZoom((z) => { const next = Math.max(z - 0.5, 1); if (next === 1) setPan({ x: 0, y: 0 }); return next; });
    };
    window.addEventListener('keydown', onKey);
    // body scroll lock
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [hasMultiple, total]);

  const toggleZoom = () => {
    if (zoom === 1) setZoom(2);
    else { setZoom(1); setPan({ x: 0, y: 0 }); }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom === 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  };
  const onMouseUp = () => { dragRef.current = null; };

  const img = images[index];
  if (!img) return null;

  return (
    <div
      role="dialog"
      aria-label={title || '주보 뷰어'}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(17, 24, 39, 0.95)',
        display: 'flex', flexDirection: 'column',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 상단 바 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.6rem 0.9rem', gap: '0.5rem',
        color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
          {title || '주보'}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
          {hasMultiple ? `${index + 1} / ${total}` : ''}
        </span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <button
            type="button" onClick={() => setZoom((z) => { const next = Math.max(z - 0.5, 1); if (next === 1) setPan({ x: 0, y: 0 }); return next; })}
            aria-label="축소"
            style={btnStyle}
          >−</button>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button
            type="button" onClick={() => setZoom((z) => Math.min(z + 0.5, 4))}
            aria-label="확대"
            style={btnStyle}
          >+</button>
          <button
            type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            aria-label="초기 크기"
            style={{ ...btnStyle, fontSize: '0.72rem' }}
          >초기화</button>
          <a
            href={img.src} target="_blank" rel="noopener noreferrer"
            title="새 창에서 원본 열기"
            style={{ ...btnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >↗</a>
          <button
            type="button" onClick={onClose}
            aria-label="닫기"
            style={{ ...btnStyle, fontSize: '1.05rem' }}
          >✕</button>
        </div>
      </div>

      {/* 이미지 영역 */}
      <div
        ref={imgContainerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={toggleZoom}
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.5rem',
          touchAction: 'pinch-zoom pan-x pan-y',
          cursor: zoom === 1 ? 'zoom-in' : dragRef.current ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <img
          src={img.src}
          alt={img.alt}
          draggable={false}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: dragRef.current ? 'none' : 'transform 0.18s ease',
            transformOrigin: 'center center',
            background: '#fff',
            borderRadius: 4,
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
          }}
        />
      </div>

      {/* 좌우 네비 (≥2장일 때만) */}
      {hasMultiple && (
        <>
          <button type="button" onClick={goPrev} aria-label="이전 페이지" style={{ ...navStyle, left: 10 }}>‹</button>
          <button type="button" onClick={goNext} aria-label="다음 페이지" style={{ ...navStyle, right: 10 }}>›</button>
        </>
      )}

      {/* 하단 페이지 도트 / 힌트 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '0.7rem', padding: '0.5rem 0.9rem',
        color: 'rgba(255,255,255,0.7)', fontSize: '0.74rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}>
        {hasMultiple && (
          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
            {images.map((_, i) => (
              <button
                key={i} type="button" onClick={() => { setIndex(i); setZoom(1); setPan({ x: 0, y: 0 }); }}
                aria-label={`${i + 1}페이지로 이동`}
                style={{
                  width: 8, height: 8, borderRadius: 999,
                  border: 'none', padding: 0, cursor: 'pointer',
                  background: i === index ? '#fff' : 'rgba(255,255,255,0.35)',
                }}
              />
            ))}
          </div>
        )}
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>
          더블클릭·핀치 확대 / 드래그 이동 / ← → 페이지 / ESC 닫기
        </span>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  minWidth: 32, height: 32, padding: '0 0.5rem',
  borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)', color: '#fff',
  fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
};

const navStyle: React.CSSProperties = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  width: 44, height: 44, borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(17,24,39,0.8)', color: '#fff',
  fontSize: '1.5rem', fontWeight: 800, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 2,
};

export default BulletinLightbox;
