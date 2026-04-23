import { useEffect, useState } from 'react';

/**
 * /reservations/grid 페이지 전용 온보딩 가이드.
 * - 상단 배너 (dismissible, localStorage 로 한번 닫으면 영구 숨김)
 * - '가이드 보기' 클릭 시 3단계 walkthrough 모달 (중앙 정렬, 모바일 full-width)
 *
 * 편집 모드(ReservationSlotPicker mode='edit') 에는 노출되지 않음 — 페이지 레벨에서만 마운트.
 */

const STORAGE_KEY = 'kcisGridGuideHidden';

type Step = {
  emoji: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    emoji: '📅',
    title: '1단계 · 날짜 선택',
    body: '원하시는 날짜를 고르세요. 오늘부터 예약 가능 기간 안에서만 고를 수 있어요.',
  },
  {
    emoji: '🕒',
    title: '2단계 · 시간 선택',
    body: '30분 단위 격자에서 시작 시간 셀을 클릭하고 끝 시간까지 이어서 선택하세요. 연속된 빈 칸만 예약할 수 있어요.',
  },
  {
    emoji: '🎨',
    title: '3단계 · 색상 안내',
    body: '연라임 = 예약 가능   ★ 연민트 = 내 예약   파랑 = 타인 예약   다크 올리브 = 예약 불가. 빈 칸만 새로 예약할 수 있어요.',
  },
];

const GridGuide = () => {
  // 서버/하이드레이션 안정: 초기엔 null → 클라에서 localStorage 읽은 뒤 확정
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setHidden(false);
    }
  }, []);

  const persistDismiss = () => {
    try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setHidden(true);
  };

  const openGuide = () => { setStep(0); setModalOpen(true); };
  const closeGuide = () => setModalOpen(false);

  if (hidden === null) return null;

  return (
    <>
      {!hidden && (
        <div
          role="note"
          aria-label="장소예약 온보딩 안내"
          style={{
            padding: '0.7rem 0.85rem',
            borderRadius: 12,
            background: 'var(--color-primary-tint)',
            border: '1px dashed var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            flexWrap: 'wrap',
          }}
        >
          <span aria-hidden style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>📘</span>
          <span style={{ flex: 1, minWidth: 180, fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-primary-deep)', lineHeight: 1.45, wordBreak: 'keep-all' }}>
            장소 예약이 처음이신가요? 30초 안내를 받아보세요.
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            <button
              type="button"
              onClick={openGuide}
              style={{
                padding: '0.5rem 0.9rem',
                minHeight: 40,
                borderRadius: 8,
                border: 'none',
                background: 'var(--color-primary)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(32, 205, 141, 0.22)',
              }}
            >가이드 보기</button>
            <button
              type="button"
              onClick={persistDismiss}
              aria-label="가이드 다시 보지 않기"
              style={{
                padding: '0.5rem 0.8rem',
                minHeight: 40,
                borderRadius: 8,
                border: '1px solid var(--color-gray)',
                background: '#fff',
                color: 'var(--color-ink-2)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >다시 보지 않기</button>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="장소예약 가이드"
          onClick={closeGuide}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#fff',
              borderRadius: 16,
              padding: '1.3rem 1.15rem 1.1rem',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
              display: 'grid',
              gap: '1rem',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: 'var(--color-ink)' }}>📘 장소예약 가이드</h3>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                {step + 1} / {STEPS.length}
              </span>
            </div>

            {/* 단계 일러스트 + 설명 */}
            <div
              style={{
                padding: '1.4rem 1rem 1.2rem',
                borderRadius: 12,
                background: 'var(--color-primary-tint)',
                border: '1px solid #D9F09E',
                display: 'grid',
                gap: '0.6rem',
                justifyItems: 'center',
                textAlign: 'center',
              }}
            >
              <span aria-hidden style={{ fontSize: '2.8rem', lineHeight: 1 }}>{STEPS[step].emoji}</span>
              <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: 'var(--color-primary-deep)', letterSpacing: '-0.01em' }}>
                {STEPS[step].title}
              </h4>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--color-ink)', lineHeight: 1.65, wordBreak: 'keep-all', maxWidth: 360 }}>
                {STEPS[step].body}
              </p>
            </div>

            {/* 단계 dot 인디케이터 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem' }}>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  style={{
                    width: i === step ? 22 : 8,
                    height: 8,
                    borderRadius: 999,
                    background: i === step ? 'var(--color-primary)' : '#E5E7EB',
                    transition: 'width 0.18s ease, background 0.18s ease',
                  }}
                />
              ))}
            </div>

            {/* 버튼 영역 — 모바일에서 충분한 터치 타겟 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={closeGuide}
                style={{
                  padding: '0.6rem 0.9rem',
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid var(--color-gray)',
                  background: '#fff',
                  color: 'var(--color-ink-2)',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >건너뛰기</button>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    style={{
                      padding: '0.6rem 0.9rem',
                      minHeight: 44,
                      borderRadius: 10,
                      border: '1px solid var(--color-gray)',
                      background: '#fff',
                      color: 'var(--color-ink)',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                    }}
                  >이전</button>
                )}
                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                    style={{
                      padding: '0.6rem 1.15rem',
                      minHeight: 44,
                      borderRadius: 10,
                      border: 'none',
                      background: 'var(--color-primary)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(32, 205, 141, 0.22)',
                    }}
                  >다음 →</button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { persistDismiss(); closeGuide(); }}
                    style={{
                      padding: '0.6rem 1.15rem',
                      minHeight: 44,
                      borderRadius: 10,
                      border: 'none',
                      background: 'var(--color-primary)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(32, 205, 141, 0.22)',
                    }}
                  >예약 시작하기 ✓</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GridGuide;
