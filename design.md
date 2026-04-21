# KCIS 디자인 규칙

UI 일관성을 위한 **반드시 준수**할 규칙. 같은 맥락의 카드/컴포넌트는 같은 스타일로. 변형은 의도적 차별화가 필요할 때만.

---

## 1. 색 팔레트 (고정)

| 용도 | 색상 | 토큰 |
|---|---|---|
| Primary (민트) | `#20CD8D` | `var(--color-primary)` |
| Primary deep | `#3F6212` | — |
| Admin accent (라임) | `#65A30D` / `#ECFCCB` / `#D9F09E` / `#F7FEE7` | — |
| Ink (본문) | — | `var(--color-ink)` |
| Ink-2 (보조) | — | `var(--color-ink-2)` |
| Surface (카드 바탕) | `#fff` | `var(--color-surface)` |
| 위험 (삭제·차단·교회행사) | `#DC2626` / `#B91C1C` | — |
| 정보 (주보 등 링크 강조) | `#1E40AF` / `#EFF6FF` / `#BFDBFE` | — |

**금지**: 같은 기능 맥락에서 임의의 다른 hex 사용. 예) 말씀 카드 근처에 amber(`#FDE68A`, `#92400E`) 섞는 것 금지.

---

## 2. 카드(섹션) 컴포넌트 규칙

같은 페이지 안에서 **유사한 역할**의 카드들은 아래 템플릿을 그대로 복사해서 만든다. 변형 시에는 근거를 남긴다.

### 2.1 표준 콘텐츠 카드 (말씀·찬송가·내용 나눔 등 본문형)

```tsx
<section style={{
  padding: isMobile ? '0.9rem' : '1.1rem',
  borderRadius: 16,
  background: '#fff',
  border: '1px solid #D9F09E',       // 고정 라임 테두리
  boxShadow: 'var(--shadow-card)',
  display: 'grid',
  gap: '0.6rem',
}}>
  <h3 style={{
    margin: 0,
    fontSize: '0.98rem',
    fontWeight: 800,
    color: '#3F6212',                 // 고정 라임-딥 제목색
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
  }}>
    <span>아이콘</span>
    <span>섹션명</span>
    {메타데이터 && (
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>
        {메타데이터}
      </span>
    )}
  </h3>
  {/* 본문 */}
</section>
```

**규칙**:
- 같은 페이지에서 여러 카드가 나란히 나오면 padding·gap·border·boxShadow를 **완전히 같게** 유지
- 제목 폰트는 `0.98rem / 800 / #3F6212` 고정, 메타는 `0.78rem / 700 / var(--color-ink-2)` 고정
- 같은 맥락에서 카드 타입을 구분하려는 목적이 아니라면 테두리 색을 바꾸지 않는다

### 2.3 성경 본문 표시 규칙 (필수)

성경 구절 본문을 보여주는 모든 페이지(`/qt`, `/reading`, `/sunday-worship`, `/cell-teaching`, 그리고 향후 추가되는 모든 말씀 관련 화면)는 **반드시 `components/BiblePassageCard.tsx`를 사용**한다. 새 스타일·새 레이아웃 만들지 말 것.

**지원 버전 (고정)**: 개역한글(공공영역) · KJV(공공영역). 두 번째 값이 없을 경우 한 쪽만 보여준다. 저작권 보호된 개역개정/NIV/ESV 등은 지원하지 않는다 — 카드 헤더 pill은 `개역한글 · KJV 만 지원`으로 고정 표기.

**렌더 규격 (BiblePassageCard가 보장):**
- 헤더: 좌측에 📖 아이콘 + "성경말씀" + **참조(reference)**, 우측에 언어 토글(한글/ENG/한·영) + 출처 pill
- 언어 토글: `useBibleLang` 훅(localStorage + `kcis-bible-lang` 커스텀 이벤트)로 전역 동기화. 한 페이지의 모든 성경 카드가 같은 언어를 표시한다.
- 장 구분: `[N장]` 라인을 **라임(#65A30D) 원형 배지**로 치환
- 절: `절번호(0.7~0.75rem / #65A30D / 우측정렬)` + `본문(0.92~0.97rem / line-height 1.75~1.85)` 2열 그리드
- 연속 절 사이 **점선 구분선**(`1px dotted rgba(101,163,13,0.3)`)
- 카드: `border: 1px solid #D9F09E`, `background: #fff`, `borderRadius: 10`
- "한·영" 모드: 데스크톱에서 2열(ko/en), 모바일에서 세로로 스택

**입력 props**:
- `reference: string` — 예: "요한복음 20:1-14"
- `koText?: string | null` — 개역한글 본문 (포맷 아래 참조)
- `enText?: string | null` — KJV 본문
- `passageText?: string | null` — 구버전 호환용 단일(한글 취급)

**입력 포맷** (각 언어 본문):
```
[N장]
1 태초에 하나님이 천지를 창조하시니라
2 땅이 혼돈하고 ...
```

서버 측에서 본문을 만들 때 `lib/bible.ts`의 `formatVerses(verses, true)`로 이 포맷을 생성한다. 한/영 둘 다 요청하는 경우 `lookupPassage(ref, 'ko')` + `lookupPassage(ref, 'en')`을 병렬로 호출한다. `includeChapter=false`는 금지.

**본문 소싱 경로 (화면별)**:
- `/qt` — 매일성경 크롤링 결과의 reference → `/api/qt`가 `passageText`(ko) + `passageTextEn`(en) 반환
- `/reading` — readingPlan 범위 → `/api/bible-text?lang=both` 각 범위별 호출
- `/sunday-worship` — 주보 게시글에서 성경봉독 구절 추출 → `/api/sunday-bulletin`이 `bibleText`/`bibleTextEn` 반환 (구역예배지 API 사용 금지)
- `/cell-teaching` — 구역예배지 PDF 파일명의 괄호 참조 → `/api/cell-worship`이 `bibleText`/`bibleTextEn` 반환

**금지 사항:**
- `whiteSpace: 'pre-wrap'`만 쓰는 텍스트 덩어리 렌더 금지
- 임의의 배경/테두리/폰트 조합으로 커스텀 Bible 카드 만들기 금지
- 페이지마다 본문 UI를 다르게 만들지 말 것 — 네 페이지(큐티/성경통독/주일예배/구역모임교안)의 말씀 카드는 **완전히 동일한 모양**이어야 한다
- 이 규칙에 맞지 않는 본문 UI를 도입하려면 **먼저 BiblePassageCard를 확장**하고 모든 사용처를 동시에 업데이트

### 2.2 구분이 필요한 카드

정말로 시각적 구분이 필요한 경우만:

| 카드 유형 | 테두리 | 제목색 | 바탕 |
|---|---|---|---|
| 콘텐츠(말씀/찬송가/구역나눔 등) | `#D9F09E` | `#3F6212` | `#fff` |
| 정보 링크(주보보기 등) | `#BFDBFE` | `#1E40AF` | `#EFF6FF` or `#fff` |
| 경고(예약 불가·한도 등) | `#FBBF24` | `#92400E` | `#FEF3C7` |
| 위험(교회일정 블럭 등) | `#DC2626` | `#fff` | `#DC2626` |

**규칙**: 이 네 가지 외의 조합은 생성 금지. 새 유형이 필요하면 **design.md에 먼저 추가 후** 코드 작성.

---

## 3. 타이포 · 간격 스케일

- **제목**: `0.98rem / 800` (카드 제목) · `1.05rem / 800` (섹션 헤더) · `1.2rem / 800` (페이지 헤더)
- **본문**: `0.9rem / 400-500` · line-height `1.6~1.8`
- **메타/라벨**: `0.78rem / 700` · `var(--color-ink-2)`
- **뱃지**: `0.72rem / 800` · padding `0.1rem 0.55rem` · radius `999`

간격:
- 카드 내부 섹션 간: `0.6~0.75rem`
- 카드 사이: `1rem` (desktop) / `0.75rem` (mobile)
- 버튼 최소 터치: `height ≥ 40px`

---

## 4. 반복되는 스타일 감지 체크리스트

새 카드·컴포넌트 작성 시 **코드 작성 전에 아래 확인**:

1. 같은 페이지에 이미 유사 역할 카드가 있는가? → 있으면 **스타일 복사**
2. 유사 카드와 색상·폰트가 다르다면 그 이유가 설명 가능한가? → 안 되면 맞춰라
3. 메타 텍스트(예: 성경구절·찬송가 번호)는 `#ink-2 · 0.78rem`으로 일관되게?
4. 아이콘 + 제목 + 메타의 `inline-flex` 구조를 유지했는가?

---

## 5. 실수 기록 (재발 방지 사례)

### 2026-04-21 — 찬송가 카드 색상 불일치
- **문제**: 찬송가 카드를 말씀 카드 바로 위에 배치했는데, 찬송가를 amber(`#FDE68A`/`#92400E`) 계열로, 말씀을 lime(`#D9F09E`/`#3F6212`) 계열로 만들어 **같은 콘텐츠 맥락인데 색상 테마가 달랐음**. 사용자가 직접 지적.
- **교훈**: 인접 카드는 스타일을 복사한다. "찬송가 = 노랑·amber" 같은 고정관념으로 새 색상을 만들지 않는다.
- **적용 규칙**: §2.1 표준 콘텐츠 카드 템플릿 사용. 구분이 필요하면 §2.2 허용 조합에서만.

### 2026-04-21 — 성경 본문 UI 중복 구현
- **문제**: 큐티 페이지는 장 헤더·절 2열 그리드·점선 구분 등 정교한 본문 렌더가 있는데, 통독·예배 및 모임교안 페이지는 단순 `whiteSpace: pre-wrap` 텍스트 덩어리로만 표시해서 같은 사이트 내 성경 본문 형식이 달랐음.
- **교훈**: 성경 본문 같이 반복 등장하는 도메인 콘텐츠는 **공용 컴포넌트 강제**. 첫 번째 구현이 기준점이 되도록 즉시 `components/` 로 추출.
- **적용 규칙**: §2.3 신설 — 모든 성경 본문은 `BiblePassageCard` 필수 사용.

---

## 6. 체크 프로세스

- 화면 변경 후 같은 페이지 스크롤하며 **카드 간 테두리·폰트·색상 비교**
- 팔레트 외 hex가 섞여있으면 팔레트로 교체
- 디자인 시스템 확장이 필요하면 `design.md`에 **먼저 항목 추가** → 그 다음 코드
