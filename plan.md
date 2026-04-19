# KCIS 계획서

> 코드 기준 현행화. 지금까지 합의된 모든 룰을 한 곳에 모은다. 구현된 것과 설계만 된 것을 분리.

---

## 0. 제품 정체성

- **브랜드명**: `KCIS` (싱가폴한인교회, Korean Church In Singapore)
- **본문 색상 팔레트**: 민트 계열 primary + 라임 계열 accent
  - Primary: `#20CD8D` (민트)
  - Admin accent: `#65A30D` (라임) / `#ECFCCB`(배경) / `#D9F09E`(테두리)
  - Ink: `var(--color-ink)`, Ink-2(보조 텍스트): `var(--color-ink-2)`
- **다국어**: ko / en / zh (react-i18next)
- **페이지 라우팅**: Next.js Pages Router, Turbopack

---

## 1. 기본 UX 룰

### 1.1 공통 네비게이션
- **TopNav**: 루트 페이지(`/`)에 사용. KCIS 로고 + 브랜드, 로그인/로그아웃, 언어 전환
- **SubHeader**: 루트 외 모든 페이지에 사용. 좌측 브랜드, 중앙 메뉴 (홈 · 주보 · 예배영상 · 장소예약 · 일정 · 큐티), 우측 사용자 칩
- 두 네비 모두 `profileId`/`nickname`/`email`가 쿼리에 없으면 `localStorage`(`kcisProfileId`/`kcisNickname`/`kcisEmail`)에서 복구
- 로그아웃 시 위 localStorage 키 제거

### 1.2 시스템 관리자 탭 바 (`AdminTabBar`)
- 시스템 관리자로 진입한 페이지에서 상단에 **항상** 고정 표시 (`position: sticky; top: 0`)
- 탭: 사용자관리 · 일정관리 · 주보관리 · 장소관리 · 기타설정 (5개, 한 줄)
- `일정관리` 탭은 `/management?...&isAdmin=1&menu=일정관리`로 이동, 진입 시 admin 네비바와 액션이 유지됨

### 1.3 공통 사용성 룰
- 코드 주석은 WHY가 비자명할 때만. 변경/PR 문맥은 쓰지 않는다.
- 불필요한 추상화/백워드 호환 셔틀/기능 플래그는 만들지 않는다.
- 데이터는 `data/*.json`을 단일 소스로 사용 (서버리스 파일 DB).

---

## 2. 페이지 · 라우팅 목록

### 2.1 공개 페이지
| 경로 | 설명 |
| --- | --- |
| `/` | 랜딩. 메뉴 카드(주보/예배영상/장소예약/교회일정/오늘의 큐티/오늘의 성경통독) |
| `/schedule` | 공개 교회일정 (이번주 일정, 월간 캘린더, Google 캘린더 구독(ICS/webcal)) |
| `/qt` | 오늘의 큐티 (YouTube @KoreanChurchInSingapore 이번주 월–금 영상) |
| `/reservation` | 장소예약 캘린더 (조회) |
| `/dashboard` | 로그인 후 기본 착지. 이번주 교회일정, 나의 장소예약, 오늘의 큐티, 오늘의 성경통독, 셀그룹생성 |

### 2.2 인증 흐름
| 경로 | 설명 |
| --- | --- |
| `/api/auth/kakao`, `/api/auth/google` | OAuth 진입 |
| `/auth/[provider]/callback` | 토큰 교환 → `record-login` 호출 → 분기 (아래 규칙) |
| `/auth/complete?fields=...&next=...` | 필수정보(실명/연락처) 입력 화면 |
| `/auth/pending` | 관리자 승인 대기 페이지 |
| `/auth/rejected` | 가입 거부 페이지 |

### 2.3 관리자 페이지
| 경로 | 설명 |
| --- | --- |
| `/admin/system` | 시스템 관리 허브 (섹션: users/bulletinTemplate/venue/etc) |
| `/management?menu=일정관리` | 일정관리 (오늘 날짜 선택된 상태 + `+일정추가` 아이콘 노출) |

---

## 3. 인증 / 가입 룰

### 3.1 `data/settings.json` 스키마 (일부)
```json
{
  "venueSlotMin": 30,
  "signupApproval": "auto",
  "signupRequiredFields": ["realName", "contact"],
  "venueAvailableStart": "06:00",
  "venueAvailableEnd": "22:00"
}
```

### 3.2 가입 필수정보
- 관리자가 `기타설정 → 가입시 필수정보`에서 **실명/연락처** 개별 토글 (default 둘 다 체크)
- `connect.tsx` / `RequiredInfoModal`에서:
  - **실명** 입력
  - **연락처**: 국가코드 드롭다운 (default `+65 (SG)`, +82/+1/+86/+60/+81) + `0000-0000` 자동 포맷 텍스트 입력
  - 저장 시 `+65 0000-0000` 형태로 합쳐 DB에 기록

### 3.3 로그인 후 분기 (`callback.tsx`)
1. `/api/auth/record-login` 호출 → `{ approval, approvalMode, requiredFields, missingFields }` 반환
2. **missingFields.length > 0** → `/auth/complete?fields=...&next={status}` (입력 후 다시 분기)
3. `status === 'pending'` → `/auth/pending`
4. `status === 'rejected'` → `/auth/rejected`
5. 그 외 → `/dashboard`

### 3.4 메인 페이지에서 장소예약 클릭 시 (모달 기반)
- 로그인 안 됨 → `/api/auth/kakao` (로그인 화면)
- 로그인 + 필수정보 미입력 → **메인에서 `RequiredInfoModal` 오픈** (메시지: "실명과 연락처를 입력하시면 예약을 진행하실 수 있습니다.")
- 필수정보 입력 완료 + status=pending → **메인에서 "승인 대기 중입니다" 모달 오픈**
- 필수정보 입력 완료 + status=approved → `/reservation`으로 이동

### 3.5 공통 엔드포인트
- `POST /api/auth/record-login`: 가입 기록, 승인 모드 평가, 부족 필드 계산
- `POST /api/auth/complete-signup`: realName/contact 저장
- `GET  /api/auth/missing-fields?profileId=`: 부족 필드 + 현재 status 반환

---

## 4. 일정 · 장소예약 **통합 DB** (핵심 설계)

### 4.1 원칙
- **교회일정(event)과 장소예약(reservation)은 하나의 DB(`data/events.json`)에 `type` 필드로 구분**
- **반복은 단일 row + `rule` 저장**. 읽을 때 기간 범위로 on-demand 펼침 (RRULE 패턴). 2000건을 미리 생성하지 않는다
- 블럭/반복 블럭(`venue-blocks.json`, `venue-block-groups.json`)은 **관리자 차단 목적**으로 별도 유지
- 근거: 동일 엔티티(시간 + 공간 점유) → 충돌 감지/단일 쿼리 가능, drift 버그 제거, 파일 크기·로드 성능 보호

### 4.2 스키마 (`EventRow`)
```ts
{
  id: string;
  communityId: string;
  title: string;
  startAt: string; endAt: string;       // anchor(첫 회차)
  location?: string;        // 표시용 문자열 ("3F Room A(301)")
  venueId?: string;         // 구조적 참조 (있으면 우선)
  description?: string;
  createdBy: string; createdByName?: string;
  createdAt: string;
  scope?: 'community' | 'personal' | 'worship';
  shared?: boolean;
  type?: 'event' | 'reservation';   // default 'event'
  rule?: {
    freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    byDay?: number[];       // 0=일 ... 6=토 (weekly)
    byWeek?: number[];      // 1..5 (monthly: N번째 주)
    byMonth?: number[];     // 1..12 (yearly)
    until?: string;         // YYYY-MM-DD
    count?: number;
  } | null;
  overrides?: Record<string, { cancelled?: boolean; title?: string; location?: string; description?: string; startAt?: string; endAt?: string }>;
}
```

### 4.2.1 공용 유틸 (`lib/recurrence.ts`)
- `expandOccurrences(event, {from, to}) → EventInstance[]`: anchor + rule을 기간 내로 펼침. `overrides[dateKey].cancelled`면 제외, 개별 필드는 override로 치환
- `ruleToRRule(rule) → string`: ICS용 `FREQ=WEEKLY;UNTIL=...` 직렬화
- occurrence.id = `${seriesId}:${dateKey}` — React key 및 UI 유일 식별자. 원본은 `seriesId`로 보존

### 4.3 가시성 룰
- **교회일정 캘린더** (`/schedule`, `/management 일정관리`, `calendar.ics`): `type === 'event'`만. 페이지 진입 시 기본 범위 ±2~6개월 펼침
- **장소예약 캘린더** (`/reservation`): `venueId` 또는 매칭되는 `location`이 있는 모든 occurrence (type 무관). SSR에서 ±1~3개월 펼침
- 모든 읽는 쪽은 **`expandOccurrences`를 거쳐야** 반복 일정이 화면에 보인다
- 일반 사용자의 reservation은 다른 사용자의 교회일정에 노출되지 않음
- `/api/events?type=event|reservation&from=YYYY-MM-DD&to=YYYY-MM-DD`로 필터/범위 지정 가능

### 4.4 권한
- `type=event` + `scope=community|worship` → **관리자만** POST 가능
- `type=reservation` → 로그인 사용자 누구나 (단, `venueId` 또는 `location` 필수)

### 4.5 삭제/수정 API
- **시리즈 전체 삭제**: `DELETE /api/events?id=<seriesId>&scope=all`
- **특정 회차 삭제**: `DELETE /api/events?id=<seriesId>&occurrenceDate=YYYY-MM-DD&scope=one` → `overrides[date].cancelled=true`
- **특정 회차 수정**: `PATCH /api/events` body `{ seriesId, occurrenceDate, fields }` → `overrides[date]` 부분 병합
- `ICS` export는 `RRULE:...` 문자열로 구독자 측에서 펼침

---

## 5. 장소관리 (`VenueManager`)

- **층별 정렬**: `data/floors.json` 참조 (1F–4F)
- **자동 코드 생성**: 1F=101-199, 2F=201-299, ... (floor prefix + 01~99)
- **주간 블럭 UI (3-step)**: 장소선택 → 시간선택(요일×시간 그리드) → 반복선택(없음/N주/종료일/영구)
- **반복 블럭 저장**: `slots: Array<{dow, startMin}>` (집합을 raw로 보관; days+startMin+endMin 레거시 지원)
- **표시 색상**: 블럭/반복블럭 = 빨강(#DC2626) / 예약가능 = 연녹(#F7FEE7) / 예약불가 시간대 = 회색(#E5E7EB)
- **반복블럭 성능**: 사전 생성 대신 **on-demand 계산** (`computeBlockedSlotsForDate`) — Map<venueId, Set<startMin>>

### 5.1 `기타설정` 연동
- `venueSlotMin` (30 / 60) → `VenueGrid`, `VenueManager`의 시간 그리드 칸 크기
- `venueAvailableStart`/`venueAvailableEnd` → 그리드 세로축(시간) 범위. 30분 단위 드롭다운(00:00~23:30), default 06:00–22:00

---

## 6. 새 일정 등록 UI 룰 (`/management 일정관리`)

- **오늘 날짜가 디폴트 선택** (`selectedCalDay = YYYY-MM-DD`) — 진입 즉시 해당 셀에 `+` 아이콘 표시
- "공동체 멤버에게 공유" 체크박스는 **삭제**됨
- **장소 필드**: 드롭다운 1개만 (장소2 제거). **"직접입력"이 맨 위 옵션** → 선택 시 텍스트박스로 전환, 옆에 "목록에서 선택" 버튼
- 반복설정: 없음/N주/종료일/영구
- **DateTimePicker 표시 포맷**: `2026-04-17 오전 09:00` (내부 value는 ISO)

---

## 7. 오늘의 큐티 (`/qt`)

- 유튜브 채널: `@KoreanChurchInSingapore`
- SSR: 채널 ID 자동 해석(24h 캐시) → RSS 피드 파싱(30m 캐시) → 이번주 일~토 영상
- **영상 필터 규칙**: 채널의 모든 영상 중 **제목에 "새벽"이 포함된 것만** 표시 (`/새벽/.test(title)`)
  - 새벽기도/새벽예배 영상만 노출 — 주일예배·수요예배·금요기도회 같은 일반 예배 영상은 의도적으로 제외
  - 이유: 큐티(QT)는 새벽 묵상의 맥락 — 다른 예배 영상은 별도 섹션에서 다룸
- **상단 7일 캘린더**: 영상 유무와 무관하게 항상 일~토 표시. ‹ › 좌우 버튼으로 주 단위 이동
- **영상 영역**: 선택 날짜에 새벽 영상 있으면 iframe, 없으면 "영상 없음" 박스
- **오늘의 큐티말씀 박스**: 매일성경(`sum.su.or.kr`) 구절·본문을 항상 표시
  - 1차: 메모리 캐시(30분 TTL) → 2차: Supabase `kcis_app_kv` 영구 캐시 (`qt_YYYY-MM-DD`) → 3차: upstream fetch
- 썸네일: `default.jpg` (120×90, ≤10KB), `loading="lazy"`
- **오늘 영상**: 2칸 강조(녹색 테두리 + "오늘" 뱃지), 디폴트 선택
- 클릭 → 하단 iframe 플레이어

---

## 8. 기타설정 카드 구성

| 카드 | default | 설명 |
| --- | --- | --- |
| 장소예약 가능시간 | 06:00~22:00 | 30분 단위 드롭다운 2개 |
| 장소예약 시간그리드 단위 | 30분 | 30분/1시간 토글 |
| 신규 사용자 가입 승인 | 로그인 즉시 가입 | auto/admin |
| 가입시 필수정보 | 실명 + 연락처 | 토글 버튼(체크) |

---

## 9. 디렉터리 / 데이터 소스

```
data/
  events.json                  # type: 'event' | 'reservation' 통합
  venues.json                  # 장소 정의
  venue-blocks.json            # 관리자 adhoc 차단
  venue-block-groups.json      # 관리자 반복 차단 (on-demand 계산)
  floors.json                  # 층 정의
  settings.json                # 슬롯/승인/필수필드/가용시간
  signup-approvals.json        # 로그인·승인 기록 (realName, contact 포함)
  profiles.json / users.json   # 사용자
  communities.json             # 공동체
  worship-services.json        # 예배 일정(별도 유지)
```

컴포넌트 주요 파일:
- `components/VenueGrid.tsx` — 공용 시간표(on-demand 계산)
- `components/VenueManager.tsx` — 관리자 차단 UI (WeeklyBlockCard, BlockGroupsCard)
- `components/EtcSettings.tsx` — 기타설정 카드 3종
- `components/SubHeader.tsx` / `TopNav.tsx` — 네비
- `components/AdminTabBar.tsx` — 관리자 탭 바
- `components/ScheduleView.tsx` — 캘린더/주간 일정 공용
- `components/RequiredInfoModal.tsx` — 필수정보 입력 모달
- `components/DateTimePicker.tsx` — 한국어 오전/오후 표시
- `lib/adminGuard.ts` — `getSystemAdminHref`, `requireSystemAdminApi`
- `lib/i18n.ts` — ko/en/zh + HMR 자원 번들 재적용 워크어라운드

---

## 10. 진행 상태

- [x] KCIS 리브랜드 / 민트·라임 팔레트
- [x] SubHeader / TopNav / AdminTabBar 공통 네비
- [x] 시스템 관리자 5탭
- [x] 장소관리: 자동 코드, 주간 블럭, 반복 블럭 그룹(on-demand)
- [x] 기타설정: 가입승인, 필수정보 토글, 슬롯 단위, 가용시간
- [x] 인증 흐름: realName/contact(+65) 수집, pending/rejected/complete 분기
- [x] 메인 장소예약 클릭 모달 흐름 (미입력/승인대기/미로그인)
- [x] `/qt` YouTube 이번주 영상 페이지
- [x] DateTimePicker 한국어 오전/오후
- [x] 일정·예약 통합 DB (type 필드, venueId, reservation SSR 머지)
- [x] **반복 일정 rule-based 저장** (`lib/recurrence.ts`, on-demand expand). 2000건 사전 생성 제거. 기존 이벤트 데이터 초기화
- [x] ICS export → `RRULE:...` 직렬화
- [x] plan.md 현행화

### 남은 작업
- [ ] `/reservation`에 **예약 생성 UI** (빈 슬롯 클릭 → 제목/시간 → POST `/api/events` with `type: 'reservation'`)
- [ ] 예약 시 교회일정과의 **충돌 감지** (동일 venueId + 시간 겹침 확인, 409 반환)
- [ ] 관리자 이벤트를 venue grid에 **시각적으로 구분** 표시 (사용자 예약 vs 교회 행사)
- [ ] 대시보드의 "나의 장소예약"을 통합 DB에서 조회
- [ ] management.tsx 캘린더가 뷰 월에 맞춰 **동적 range**로 `/api/events?from=&to=` 재조회 (현재 default ±2/±3개월)
- [ ] worship-services.json을 events.json으로 통합 마이그레이션 (bulletin template은 worship-services 유지)
