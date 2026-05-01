# ONCELL — Claude 작업 가이드

ONCELL — 영적 셀 플랫폼. 셀(큐티/통독/암송)을 통해 친구·공동체와 함께 매일 영적 습관을 만드는 서비스.
이 문서는 Claude가 이 repo에서 작업할 때 지켜야 할 기술 컨텍스트·명령어·규칙·금지사항을 한 곳에 모은다.

---

## 기술 스택

- **프레임워크**: Next.js 16.2.3 (Pages Router + Turbopack)
- **언어**: TypeScript 6.0, React 19.2
- **DB**: Supabase. 테이블 prefix `oncell_*`, KV 키는 `oncell_app_kv`.
- **인증**: OAuth (Kakao / Google). **SSO 즉시 일반회원** (사이트 가입 승인 폐지). 시스템관리자는 `profileId` 또는 `email` 둘 다 허용 (`system_admins` KV).
- **i18n**: react-i18next — ko(기본) / en / zh
- **호스팅**: Vercel (서버리스 함수 타임아웃·콜드스타트 주의)
- **UI 컴포넌트**: shadcn/ui (Card·Avatar·Button) + Tailwind 공존, 기존 inline 스타일과 혼용
- **YouTube 연동**: RSS + playlist RSS (API 키 없음)

### 디자인 시스템 (현재 그레이블루 테마)

- 배경: `#2D3850` (`var(--bg-base)`) + 흰색 0.18 alpha 격자
- 액센트 시안: `#A5F3FC` / `#06B6D4` / `#67E8F9`
- Primary (옛 민트): `#20CD8D` — 카드·아이콘 잔재. 점진 교체 중
- Ink: `var(--color-ink)`, 보조 텍스트: `var(--color-ink-2)` (흰 배경 카드 내부 전용)
- 타이포: Plus Jakarta Sans (영문) / Noto Sans KR · Nanum Gothic 한글 우선
- 레이아웃: 최대 폭 1040px / 모바일 0.6rem padding / 데스크톱 1rem
- 버튼 최소 높이 **40px** (모바일 터치)
- 카드: `borderRadius:16`, 배지는 `borderRadius:999`

---

## 빌드 · 실행 명령어

```bash
npm run dev       # next dev (Turbopack) — 로컬 :3003 (memory 참고)
npm run build     # 프로덕션 빌드
npm run start     # 프로덕션 서버
npx tsc --noEmit -p tsconfig.json   # 타입체크 (PR 전 필수)
```

### 일괄 스크립트

```bash
node scripts/backup-supabase.mjs --execute         # 전 테이블 JSON dump (backups/<stamp>/)
node scripts/restore-supabase.mjs                  # 백업 JSON → DB 복원 (dry-run 기본)
node scripts/seed-reading-plans.mjs --year=2026 --plan=1 --execute  # 통독 계획 시드
node scripts/seed-qt-plan.mjs --year=2026 --execute                 # 매일성경 QT 범위 시드
node scripts/wipe-non-admin-data.mjs               # dry-run (관리자 제외 사용자 데이터 삭제)
```

---

## 핵심 도메인 규칙

### 제품 모델 (`memory/project_product_model.md` 참고)

ONCELL의 4축:
1. **본인 비공개 묵상 노트** — 외부 노출 0
2. **셀 친구 인증 ✓** — 친구 초대 기반 클로즈드 셀
3. **글로벌 익명 카운트** — "오늘 N명이 같은 본문 읽음"
4. **AI 큐레이션 + 사람 Top 10 묵상** — 24h 휘발

피드·DM·외부 링크·인스타식 스크롤 피드 **만들지 않음**.

### 사용자 역할 (셀·공동체 모델)

- **Guest** — 미로그인
- **Member (일반)** — SSO 가입 즉시. `oncell_profiles` 존재
- **셀관리자** — 독립 셀의 owner (셀 1+ 보유)
- **공동체관리자** — `oncell_communities.admin_profile_id == 본인`. 산하 모든 셀 메타 관리 (콘텐츠 비접근)
- **시스템관리자** — `oncell_app_kv['system_admins'].profileIds`

상태 모델:
- 1인 1공동체 (기본). 한도 시스템관리자 설정.
- 공동체 셀 + 독립 셀 혼합 가입 가능 (한도 내).
- 가입 한도 default: 공동체 1, 공동체별 셀 3, 독립 셀 2.

### 가입 흐름 (3가지 경로)

- **Path A**: 메인 → SSO → /dashboard → 공동체 찾기 → 공동체 + 셀 함께 가입
- **Path B**: QR / 초대 링크 → 셀 → (공동체 셀이면) 공동체 가입 동의 → 가입
- **Path C**: 직접 셀 만들기 (독립 셀, 공동체 없음)

공동체 산하 셀은 공동체관리자가 관리하지만 **콘텐츠(묵상·기도제목)는 셀 멤버에게만 노출** (관리자도 못 봄). 신고 시 운영자 검토 흐름은 별도.

### 큐티 본문 출처

- 매일성경 (`pages/api/qt.ts`) — `https://sum.su.or.kr:8888/Ajax/Bible/BodyBible` POST
- 연간 범위 시드 → `oncell_qt_plan` 테이블 (`scripts/seed-qt-plan.mjs`)
- 본문 텍스트 자체는 `data/bible.json` 로컬 번들 (개역한글 + KJV)
- 시간대: Asia/Seoul 자정 기준

### 통독 계획

- `lib/readingPlan.ts` 자체 계산 (1189장을 plan 배수로 연중 분배)
- 연초 시드 → `oncell_reading_plans` 테이블
- API: `/api/reading-plan?plan=1&date=YYYY-MM-DD`

### 일정 (`/schedule`)

- `oncell_events` 테이블, `community_id` scope
- KCIS 일정만 남음 (예약·주보·구역모임교안 메뉴 폐지)
- 반복은 `rule` jsonb 단일 row + `expandOccurrences` on-demand 펼침
- 종일: `start_at` 00:00 +0800, `end_at` 23:59 +0800 (Asia/Singapore 벽시계 기준)

---

## 코딩 규칙

1. **주석**: WHY가 비자명할 때만. 변경 이력·PR 문맥 금지.
2. **기존 파일 편집 우선**. 새 파일은 명확히 필요할 때만.
3. **문서 생성 금지** — `*.md` 파일은 사용자 명시 요청 시만.
4. **불필요한 추상화 / 기능 플래그 / 백워드 호환 셔틀 금지**.
5. **에러 핸들링은 경계에서만** (사용자 입력, 외부 API).
6. **타입 안전**: `any` 자제. `unknown` → narrowing 선호.
7. **i18n**: 새 문자열은 `lib/i18n.ts`의 ko/en/zh 3개 모두 추가.
8. **감정 이모지 자제**. 기능 아이콘만.
9. **색상**: CSS 변수 또는 팔레트 상수. 임의 hex 최소화.
10. **외부 라이브러리 실제 검증** — 새 패키지 설치 직후 ≤5줄 smoke test.
11. **Silent failure 금지** — catch 블록에서 에러 삼키지 말 것. `console.error` + 응답에 `error`/`errorReason` 포함.
12. **라이브러리 교체 검토 시** README 재확인.
13. **조건부 UI 작성 전 데이터 소스 실측** — 가정 금지, 실제 행 확인.
14. **SSR props null 경로 검증** — `getServerSideProps`가 query에 의존하면 직링크·새로고침 시 UX 확인. localStorage fallback 또는 API 재조회 병행.

---

## 금지사항

- **파괴적 Supabase 작업 사용자 확인 없이 실행 금지** (DROP, TRUNCATE, 대량 DELETE). 스크립트는 dry-run → 승인 → `--execute`.
- **시스템관리자 본인 profileId 삭제 금지** (API 차단).
- **`.env.local` 커밋 금지** — 서비스 롤 키 포함.
- **파일 경로 하드코딩 금지** (특히 Windows 경로).
- **YouTube Data API key 없이 무제한 스크래핑 금지** — 30분 메모리 캐시 + rate limit.
- **외부 사이트 크롤링** (`sum.su.or.kr` 등): `User-Agent` 명시, 30분+ 캐시, graceful fallback, 1.5s+ 호출 간격.
- **반복 이벤트 사전 생성 금지** (`rule` 저장 후 `expandOccurrences`).
- **종일 이벤트 임의 시간 부여 금지** — 00:00~23:59 패턴.
- **로그인 가드 우회 금지** — 보호 페이지는 `useRequireLogin(profileId)` 훅.
- **셀 콘텐츠 (묵상·기도제목) 공동체관리자에게 노출 금지** — 관리자는 메타만.

---

## 서브에이전트 · 스킬

- `.claude/agents/{ux-designer,service-planner,tech-optimizer}.md` — 역할 정의
- `.claude/skills/{ux-review,service-plan,tech-audit,operation,church-events}/SKILL.md` — 실행 프로토콜

---

## 디렉터리 요약 (정리 후)

```
pages/
  index.tsx              # 랜딩 (hero + 4축 + 비교 + 안전 + 메뉴 라벨)
  dashboard.tsx          # 로그인 후 (스텁 — 셀 시스템 구축 후 재작성 예정)
  qt/, qt/notes.tsx      # 큐티
  reading.tsx            # 성경통독
  schedule.tsx           # 일정 (community_id scope)
  privacy.tsx, terms.tsx # 법적 문서
  feed-preview.tsx       # 묵상 피드 prototype (shadcn/ui)
  admin/system.tsx       # 시스템 관리자 (스텁)
  api/
    events.ts            # 일정 CRUD (reservation 분기 잔재 정리 예정)
    qt.ts, qt-notes.ts   # 큐티
    reading-plan.ts      # 통독 계획
    auth/*               # OAuth 흐름 (signup 즉시 approved)
    admin/*              # 관리자 API

components/
  ui/{card,avatar,button}.tsx  # shadcn/ui
  TopNav.tsx, SubHeader.tsx, AdminTabBar.tsx
  ScheduleView.tsx
  RequiredInfoModal.tsx
  MembersCard.tsx (관리자)

lib/
  dataStore.ts           # Supabase 래퍼
  adminGuard.ts          # system admin 체크
  recurrence.ts, events.ts  # 일정 유틸
  readingPlan.ts         # 통독 계산
  bible.ts               # 본문 조회 (data/bible.json)
  useRequireLogin.ts, useIsMobile.ts, i18n.ts
  utils.ts               # cn() — shadcn 헬퍼

scripts/
  backup-supabase.mjs / restore-supabase.mjs
  seed-reading-plans.mjs
  seed-qt-plan.mjs       # 매일성경 연간 QT 범위
  wipe-non-admin-data.mjs

data/
  bible.json             # 개역한글 66권 + KJV

middleware/
  proxy.ts               # 베타 게이트 (NEXT_PUBLIC_BETA_GATE 환경변수)
```

## 셀 시스템 (구축 예정)

다음 단계로 추가될 항목:
- `oncell_cells`, `oncell_cell_members`, `oncell_community_members`
- `/cells/*`, `/join/[token]`, `/community/[id]/*` 라우트
- 모드별 설정 (`qt_settings`, `reading_settings`, `memorize_settings`)
- 암송 테스트 인터페이스 (빈칸 / 음성 인식)

자세한 모델 결정은 `memory/project_product_model.md`, `project_cult_defense.md`, `project_ai_moderation.md` 참고.
