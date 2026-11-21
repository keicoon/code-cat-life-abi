# Code Cat Life Abi — 이동 규칙 (Movement Rules)

모든 이동 로직은 아래 규칙을 준수하며, 세부 아키텍처는 [docs/architecture.md](architecture.md)를 따릅니다.

---

## 규칙 1: 텍스트 바닥 제약 (Floor Constraint) — 최우선

> 고양이는 **항상** 유효한 바닥(`TerrainGrid`) 위에서만 멈추고 걷고 착지할 수 있습니다.

- `TerrainGrid`는 각 가시 라인의 첫 non-space 문자부터 마지막 non-space 문자까지를 바닥으로 색인합니다.
- 단어 사이 짧은 공백(15칸 이하)은 하나의 연속 바닥(`TextSpan`)으로 취급해 그대로 걸어서 통과합니다.
- **16칸 이상** 벌어진 내부 공백(`DEFAULT_MAX_WALKABLE_GAP = 16`)은 별도의 바닥 구간으로 분리되어 걸어서 건널 수 없습니다.
- 공백만 있는 **빈 줄**에는 착지하거나 멈출 수 없습니다.
- 실행 중 텍스트 편집으로 현재 줄이 비거나 짧아지면 `CatStateMachine`이 즉시 가장 가까운 유효 바닥으로 재배치/클램프합니다.

---

## 규칙 2: 이동 연속성 (Movement Continuity)

> 고양이 위치는 매 틱마다 일정 속도 이내로만 변해야 하며, 순간이동을 금지합니다.

- **Walk (`run`):** 매 틱 `runSpeed` (기본 `0.4 col × animationSpeed`) 이내로 이동하며, 부동소수점 오차(`1e-6`)로 인한 미세 지연 없이 목표 열에 정확히 정지합니다.
- **Jump / Fall:** 출발 `(fromLine, fromCol)`에서 목표 `(toLine, toCol)`까지 선형 보간하며, 수직 속도는 `jumpSpeed` / `fallSpeed`, 수평 속도는 `runSpeed × 2`, 최대 30틱으로 제한됩니다.
- **Landing Pause (`land`):** 점프 또는 낙하가 끝난 직후 `landingPauseDuration` (기본 `3`틱) 동안 착지 포즈를 유지합니다.

---

## 규칙 3: 점프 / 낙하 및 경로 탐색 (Grid A* & Dijkstra)

> `Pathfinder`는 줄 단위가 아니라 **`(line, col)` 그리드 상태**에서 직접 탐색합니다.

- **수직 이동 범위:** 위/아래 최대 `maxJumpLines` (기본 `3`줄)까지 점프/낙하할 수 있습니다.
- **수평 이동 폭:** 수직 이동 시 착지 열은 `fromCol` (직선) 또는 `fromCol ± (2 × lineDelta)` (대각선) 중 목표 줄의 유효한 바닥 위 좌표만 허용합니다.
- **수직 장애물 검사:** 출발 줄과 목표 줄 사이의 중간 줄에 고체 문자(`isSolidChar`)가 가로막고 있으면 통과할 수 없으며, 빈 열로 우회하거나 중간 줄을 거쳐 이동해야 합니다.
- **도달 가능성 100% 일치:** 생선 스폰 후보는 단일 Dijkstra 탐색으로 계산하며, 선택된 생선까지는 동일한 그래프 위에서 A*로 `MoveStep[]`를 생성합니다.

---

## 규칙 4: 보이는 영역 제약 (Visible Range)

> 고양이와 생선은 커서/스폰 라인이 속한 **단일 연속 visible segment** 안에서만 동작합니다.

- `visible-range.ts`가 `TextEditor.visibleRanges` 중 현재 포커스 라인이 속한 하나의 연속 구간만 선택합니다.
- 접힌 코드(fold) 등으로 분리된 다른 구간은 이번 세션의 이동/생선 스폰 대상에서 제외됩니다.

---

## 규칙 5: 먹기 후 대기와 수면 (Session Loop)

- 목표 줄에 안착(`|line - fish.line| < 0.01`)하고 생선과 인접(`|col - fish.col| < 1.5`)하면 `eat`(2단계) 상태로 진입합니다.
- 같은 세션 내에서는 `post_eat` 포즈로 다음 생선을 대기합니다.
- `fishSessionCount`만큼 연속으로 먹으면 `sleep` 상태로 전환해 `sleepTime` 동안 휴식한 뒤 다음 세션을 시작합니다.

---

## 테스트 보호 범위

| 대상 | 테스트 파일 |
| :--- | :--- |
| 바닥 색인 / 16칸 공백 분리 / Visible Range | `src/terrain-grid.test.ts`, `src/visible-range.test.ts` |
| A* 경로 / Dijkstra 도달 가능성 일치 | `src/pathfinder.test.ts` |
| 보간 연속성 / 착지 포즈 | `src/step-animator.test.ts` |
| 상태 머신 / 세션 루프 / 리셋 | `src/cat-state-machine.test.ts` |
| 스프라이트 로딩 / 색상 치환 | `src/sprite-manager.test.ts` |
| 종단 간 행동 시나리오 (9종, `demo/*.ts` 포함) | `src/scenarios.test.ts` |
| VS Code Extension Host 통합 테스트 | `src/integration/suite.ts` |
