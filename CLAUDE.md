# KCIS — Claude 작업 가이드

싱가폴한인교회(Korean Church In Singapore) 관리 시스템. 이 문서는 Claude가 이 repo에서 작업할 때 지켜야 할 기술 컨텍스트·명령어·규칙·금지사항을 한 곳에 모은다. 상세 제품 스펙은 `plan.md` 참고.

---

## 기술 스택

- **프레임워크**: Next.js 16.2.3 (Pages Router + Turbopack)
- **언어**: TypeScript 6.0, React 19.2
- **DB**: Supabase (JSON에서 이관 완료 — commit `34f0182`). 테이블 prefix `kcis_*`, KV 키는 `kcis_app_kv`.
- **인증**: OAuth (Kakao / Google). 관리자는 `profileId` 또는 `email` 둘 다 허용 (`system_admins` KV).
- **i18n**: react-i18next — ko(기본) / en / zh
- **호스팅**: Vercel (서버리스 함수 타임아웃·콜드스타트 주의)
- **PDF 파싱**: `pdf-parse` (구역예배지 첨부 파일 텍스트 추출용)
- **YouTube 연동**: RSS + playlist RSS (API 키 없음)

### 디자인 시스템

- Primary: `#20CD8D` (민트)
- Admin accent: `#65A30D` / `#ECFCCB` / `#D9F09E` / `#F7FEE7` (라임 계열)
- Ink: `var(--color-ink)`, 보조 텍스트: `var(--color-ink-2)`
- 타이포: Noto Sans KR / Nanum Gothic 한글 우선
- 레이아웃: 최대 폭 1040px / 모바일 0.6rem padding / 데스크톱 1rem
- 버튼 최소 높이 **40px** (모바일 터치)
- 카드: `borderRadius:16, boxShadow:var(--shadow-card)`, 배지는 `borderRadius:999`

---

## 빌드 · 실행 명령어

```bash
npm run dev       # next dev (Turbopack) — 기본 :3000
npm run build     # 프로덕션 빌드
npm run start     # 프로덕션 서버
npx tsc --noEmit -p tsconfig.json   # 타입체크만 (권장: PR 전 실행)
```

### 일괄 스크립트

```bash
node scripts/seed-church-events-2026.mjs           # dry-run
node scripts/seed-church-events-2026.mjs --execute # Supabase 실삽입 (upsert)
node scripts/wipe-non-admin-data.mjs               # dry-run (관리자 제외 사용자/예약 전부 삭제)
node scripts/wipe-non-admin-data.mjs --execute
```

---

## 핵심 도메인 규칙 (반드시 준수)

### 네비게이션

- 루트(`/`) = `TopNav`, 나머지 = `SubHeader`, 시스템관리자 페이지 = `AdminTabBar` 고정
- 모든 메뉴는 **로그인 후 접근** (`lib/useRequireLogin` 훅 사용). 예외: `/privacy`, `/auth/*`, `/`
- localStorage 폴백: `kcisProfileId`, `kcisNickname`, `kcisEmail`

### 이벤트 · 예약 통합 DB

- **`data/events.json`(=`kcis_events` 테이블) 하나에 `type: 'event' | 'reservation'` 필드로 구분**
- 반복은 단일 row + `rule` 필드로 저장. 읽을 때 `lib/recurrence.ts`의 `expandOccurrences`로 on-demand 펼침
- 2000건 미리 생성 금지
- 블럭(`venue-blocks`, `venue-block-groups`)은 관리자 차단 목적으로 별도 유지

### 예약 (reservation) 규칙

- 연속 슬롯만 예약 가능 (띄엄띄엄 불가)
- 충돌 셀은 "예약불가" 라벨로 구분 표시
- 인당 한도(`perUser` 모드): 초과 시 모달에서 기존 예약 목록 + 수정/삭제 UI
- 모임구분(부서/구역/기타) 필수 — `description: "[종류] 상세"` 로 저장

### 종일 이벤트 · 연간 일정 시드

- `start_at` 00:00 **+0800**, `end_at` 23:59 **+0800** 패턴 (싱가폴 시간 고정)
- `lib/events.ts`의 `isAllDayEvent()` / `getSGDateKey()` 로 판별·버킷팅 — **반드시 SG 벽시계 기준**. 브라우저 로컬 TZ(`getHours()` 등)로 계산하면 KST 사용자에게서 다음날로 spillover 발생 (2026-04-21 사고)
- **교회일정을 이미지/표에서 시드할 때는 반드시 `.claude/skills/church-events/SKILL.md` 프로토콜 적용** — 종일 패턴 강제, `구역모임 시작/방학/개강`은 시작일만, 반복은 `rule:`/`days:` 단일 row, dry-run 후 사용자 승인 → `--execute`

### 큐티 · 구역모임교안

- 큐티(`/qt`): YouTube 채널의 "새벽" 제목 영상 / 매일성경 본문 / 3단 묵상노트
- 구역모임교안(`/cell-teaching`): 주일예배 플레이리스트 RSS(`PLSCiGfh6aK3T0eD4sx5mGkSlg1MZ-Egcn`)에서 "주일1부예배/주일2부예배" 매칭 (2부 우선), `koreanchurch.sg` 공지 게시판의 "N월 M째 주_금요 구역예배지" 첨부 PDF 본문 표시

---

## 코딩 규칙

1. **주석**: WHY가 비자명할 때만. 변경 이력·PR 문맥은 절대 쓰지 않는다. "added for task X"·"fixes bug Y" 류 금지.
2. **기존 파일 편집 우선**. 새 파일은 명확히 필요할 때만.
3. **문서 생성 금지** — CLAUDE.md, README, `*.md` 파일은 사용자가 명시 요청할 때만.
4. **불필요한 추상화 / 기능 플래그 / 백워드 호환 셔틀 금지**. 내부 코드는 신뢰하고 바로 고친다.
5. **에러 핸들링은 경계에서만** (사용자 입력, 외부 API). 내부 호출은 과도한 try/catch 금지.
6. **타입 안전**: `any` 사용 자제. `unknown` → narrowing 선호.
7. **i18n**: 새 문자열은 `lib/i18n.ts`의 ko/en/zh 3개 모두 추가.
8. **감정 이모지 자제**. 기능 아이콘(✎·📖·⏰·📅 등)만 허용.
9. **색상**: CSS 변수 또는 팔레트 상수 사용. 임의 hex 최소화.
10. **외부 라이브러리 실제 검증 의무** — 새 npm 패키지 설치 직후 ≤5줄 smoke test (`node -e "..."`)로 **실제 API 동작 확인**. 특히 major 버전(v1→v2)이 바뀐 패키지는 import 방식/클래스/함수 시그니처를 README로 재확인. 가정만으로 코드 작성 금지.
11. **Silent failure 금지** — catch 블록에서 에러를 삼키고 null/fallback만 반환하는 코드 금지. 최소한 `console.error`와 응답에 `error`/`errorReason` 필드 포함해서 클라이언트·로그에서 원인 추적 가능하게.
12. **라이브러리 교체 검토 시**: `cat node_modules/<pkg>/README.md | head -80` 으로 최신 API 확인. `package.json` major version과 내 기억이 다르면 무조건 re-read.
13. **조건부 UI 작성 전 데이터 소스 실측** — "X 테이블에 ~가 있겠지" 식 가정으로 분기 만들지 말 것. Supabase 에서 row 수·샘플 쿼리로 **실제 상태를 확인한 후** 조건 로직. 예: `kcis_users` 가 "가입자 전체" 테이블이라는 가정은 실제 0 rows 와 충돌해 모든 조건이 빈 배열 반환.
14. **SSR props 의 null 경로 필수 검증** — `getServerSideProps` 가 `context.query.X` 에 의존한다면, URL 쿼리 없이 진입(새로고침·직링크) 시의 값·UX 를 항상 확인. SSR 은 `localStorage` 를 못 읽으므로, **SSR 의존 UI 는 클라이언트 localStorage fallback 또는 API 재조회 경로를 반드시 병행**. 대시보드·관리 화면처럼 인증 기반 페이지는 특히 주의.

---

## 금지사항

- **파괴적 Supabase 작업을 사용자 확인 없이 실행 금지** (DROP, TRUNCATE, 대량 DELETE). 스크립트는 항상 dry-run 후 승인 받고 `--execute`.
- **관리자 본인 profileId 삭제 금지** (API에서 이미 차단). 본인 email 삭제 시 경고.
- **`.env.local` 커밋 금지** — 서비스 롤 키 포함.
- **파일 경로 하드코딩 금지** (특히 Windows 경로). 플랫폼 무관 경로로.
- **YouTube Data API key 없이 무제한 스크래핑 금지** — 반드시 30분 메모리 캐시 + 사용자당 rate limit 고려.
- **`koreanchurch.sg` 등 외부 사이트 크롤링 시**: `User-Agent` 명시, 30분+ 캐시, 실패 시 graceful fallback.
- **반복 이벤트 사전 생성 금지** (`rule` 저장 후 `expandOccurrences`로만 펼침).
- **종일 이벤트에 임의 시간 부여 금지** — 00:00~23:59 패턴 유지.
- **로그인 가드 우회 금지** — 모든 보호 페이지는 `useRequireLogin(profileId)` 훅 호출.
- **주보·일정 일괄 업로드 관리자 UI 만들지 않음** (현재 정책). 배치 작업은 스크립트로.

---

## 서브에이전트 · 스킬

- `.claude/agents/{ux-designer,service-planner,tech-optimizer}.md` — 역할 정의
- `.claude/skills/{ux-review,service-plan,tech-audit}/SKILL.md` — 각 역할의 실행 프로토콜

---

## 디렉터리 요약

```
pages/
  index.tsx              # 랜딩 (메뉴 3카드: 장소예약·큐티·구역모임교안)
  dashboard.tsx          # 로그인 후 허브
  reservation.tsx        # 장소예약 (picker 모달·그리드·한도 모달)
  reservations/my.tsx    # 내 예약 목록
  qt/, qt/notes.tsx      # 큐티
  cell-teaching.tsx      # 구역모임교안 (유튜브 주일예배 + 구역예배지 PDF)
  schedule.tsx           # 교회일정
  contact.tsx            # 삭제됨 (재생성 금지)
  privacy.tsx            # 개인정보처리방침 (공개)
  management.tsx         # 관리자 일정관리
  admin/system.tsx       # 시스템 관리자 허브
  api/
    events.ts            # 통합 이벤트 CRUD
    qt*.ts               # 큐티 관련
    cell-worship.ts      # 구역예배지 크롤링 (koreanchurch.sg)
    admin/*              # 관리자 API (토큰 + profileId/email)
    auth/*               # OAuth 흐름

components/
  VenueGrid.tsx          # 공용 시간표 (on-demand 계산)
  VenueManager.tsx       # 장소 차단 관리
  EtcSettings.tsx        # 기타설정 카드들
  SubHeader.tsx / TopNav.tsx / AdminTabBar.tsx
  ScheduleView.tsx       # 월/주 달력
  RequiredInfoModal.tsx  # 실명/연락처 입력
  DateTimePicker.tsx     # 한국어 오전/오후
  MembersCard.tsx / SignupApprovalsCard.tsx / RejectedCard.tsx  # 관리자용

lib/
  dataStore.ts           # Supabase 래퍼 (get*/set* 함수군)
  adminGuard.ts          # system admin 체크 (profileId + email)
  recurrence.ts          # expandOccurrences, ruleToRRule
  events.ts              # isAllDayEvent 유틸
  useRequireLogin.ts     # 로그인 가드 훅
  useIsMobile.ts
  i18n.ts

scripts/
  seed-church-events-2026.mjs   # 2026 교회행사 일괄 삽입
  wipe-non-admin-data.mjs       # 사용자/예약 초기화 (관리자 보존)
  backup-supabase.mjs           # 전 테이블 JSON dump (backups/<stamp>/)
  restore-supabase.mjs          # 백업 JSON → DB 복원 (dry-run 기본)

data/
  bible.json             # 개역한글 66권 (큐티 본문용 번들)
```
