---
name: ux-review
description: KCIS 앱의 특정 화면·컴포넌트를 UX 관점에서 점검할 때 사용. 레이아웃, 정보위계, 타이포, 모바일 터치 영역, 색채 체계, 접근성을 7가지 체크리스트로 검토하고 개선 diff를 제시한다. 호출 예 "/ux-review /reservation 모달", "/ux-review components/VenueGrid.tsx".
---

# ux-review — UX 점검 프로토콜

대상 화면/컴포넌트를 **현재 상태 → 문제 → 개선안 → diff** 순으로 검토한다.

## 1) 대상 파악
- 경로 확인 (pages/ 또는 components/). Read로 전체 조회.
- 데스크톱/모바일 양쪽을 상상 (useIsMobile 분기 유무 체크).

## 2) 7가지 체크리스트

1. **한 줄 정보 개수** — 한 행에 3개 이하인가? 라벨/값이 색·굵기로 구분되는가?
2. **터치 영역** — 모바일에서 버튼·탭 ≥ 40px? 간격 ≥ 8px?
3. **팔레트 준수** — 민트 #20CD8D / 라임 #65A30D·#ECFCCB·#D9F09E / Ink 변수. 임의 hex 금지.
4. **타이포** — Noto Sans KR, 최소 12px, 제목/본문/보조 구분.
5. **카드 기본값** — `borderRadius:16, boxShadow:var(--shadow-card)`. 라운드 배지는 `999`.
6. **상태 표시** — 로딩/빈 상태/에러가 **모두** 존재하는가? 회색 대시 박스 또는 라임 박스로 표기.
7. **모바일 세로 우선** — `flex-wrap:wrap`, 전체폭 버튼, 가로 스크롤 회피.

## 3) 접근성
- `aria-label` 누락된 아이콘 버튼 찾기.
- `<label>` 연결된 `<input>`인가?
- 색만으로 의미 전달 금지 (텍스트/아이콘 병행).

## 4) 산출물 형식
- **문제 N개** (핵심만, 10개 이하)
- **각 문제에 대해**: 위치(file:line) · 현재 · 개선 · Edit diff(가능하면 직접 적용)
- 스크린샷 불가 환경 → 텍스트로 레이아웃 묘사 시 **여백/정렬 기준 명시**

## 5) 바꾸지 말 것
- plan.md의 팔레트/카드/Nav 룰 — 룰 자체를 고치려면 plan.md 업데이트 제안을 먼저.
- i18n 키 이름 — 이미 ko/en/zh 전개된 곳은 텍스트만 교체.

## 6) 소속/연계
- **소속 에이전트**: `ux-designer` (`.claude/agents/ux-designer.md`) — 이 스킬은 그 에이전트의 실행 프로토콜.
- **참여 흐름 변경이 필요한 이슈** → `service-planner` 에이전트 / `service-plan` 스킬에 위임.
- **성능 영향 의심** (리렌더·번들 증가) → `tech-optimizer` 에이전트 / `tech-audit` 스킬에 검증 요청.
