# Code Cat Life Abi — 이동 규칙 (Movement Rules)

모든 이동 로직은 아래 규칙을 반드시 준수해야 한다.
규칙 간 충돌 시 **우선순위가 높은 규칙이 승리**한다.

---

## 규칙 1: 텍스트 제약 (Text Constraint) — 🔴 절대 규칙 (최우선)

> 고양이는 **항상** 텍스트가 존재하는 위치에만 있어야 한다.

- `state.col`은 해당 `state.line`의 `textEdges(line).left` ~ `textEdges(line).right` 범위 내
- 현재 구현은 한 줄 내부를 **segment 단위**로 나누지 않고, 첫 non-space ~ 마지막 non-space 전체를 같은 수평 지형으로 본다
- 따라서 same-y 이동에서는 줄 내부 공백(예: `"abc   def"`)을 별도 gap으로 취급하지 않고 그대로 run 할 수 있다
- **빈 라인**(공백만 있는 라인)에는 착지 불가
- jump/fall **착지 시점**: `targetCol`은 대상 라인 위의 유효한 stride 착지점이어야 한다
- run 시: `targetCol`은 대상 라인의 텍스트 범위 내
- 다른 규칙(per-line cap 등)과 충돌 시 **이 규칙이 항상 우선**

### 적용 지점
| 상태 | col 제약 보장 방법 |
|------|-------------------|
| spawn | `textEdges(line).left`에서 시작 |
| idle/sleep | 위치 변하지 않음 |
| run | `targetCol = clampToTextEdges(line, goalCol)` |
| run_then_jump/fall | 트랜짓 col = `clampToTextEdges(sourceLine, col)` |
| jump/fall 착지 | `targetCol ∈ {startCol, startCol ± (2 × lineDelta)}` 중 대상 라인에 유효한 착지점, 불가능하면 `startCol` |
| jump/fall 중간 | 선형 보간 (start→target, 둘 다 텍스트 위) |

---

## 규칙 2: 이동 연속성 (Movement Continuity)

> 고양이 위치는 매 틱마다 작은 폭으로만 변해야 한다. 순간이동 금지.

- **run**: 매 틱 `runSpeed` (0.4 col) 만큼만 이동
- **jump/fall**: 선형 보간, adaptive speed로 속도 제어
  - 수평 속도 ≤ `runSpeed × 2` (0.8 col/tick)
  - 수직 속도 ≤ `jumpSpeed` / `fallSpeed`
  - 최대 30틱 (≈2.4초)

---

## 규칙 3: 점프/낙하 수평 제한 (Horizontal Cap) — 🟡 최선 노력

> Y축 이동 중 X축 이동은 **jump, fall 모두 가능**하다. 다만 X 이동량은 매 스텝마다 **0 또는 `2 × 이동 라인 수`**만 허용한다.

```
maxH = 2 × lineDelta
```

- jump/fall 모두: X 이동량은 `0` 또는 `2 × lineDelta` 컬럼
- 1줄 점프/낙하: 최대 X = 2 컬럼
- 2줄 점프/낙하: 최대 X = 4 컬럼
- 3줄 점프/낙하: 최대 X = 6 컬럼
- goal 방향으로 stride가 가능하면, goal과의 X 차이가 작아도 Y 이동 중 X를 포함한다
- scaled diagonal 착지가 텍스트 위에 불가능하면 같은 스텝에서는 `0` stride로 fallback 한다
- 같은 추적에서 goal을 지나친 뒤에는 반대 방향 stride 대신 `0` stride만 허용한다
- goal 방향과 반대되는 X stride는 허용하지 않음
- 여러 Y 스텝이 이어지면 매 스텝마다 `2 × lineDelta` 규칙으로 X 이동 → 점진적 접근

### 골 방향 X 분산
- 경로 플래너는 각 vertical step을 현재 위치 기준으로 다시 잡아서, source line에서 과하게 미리 달리지 않는다
- goal 방향 stride가 가능하면 그 방향으로 정확히 `2 × lineDelta` 컬럼 이동한다
- goal과 X가 이미 정렬된 상태에서도, 뒤에 남은 Y 스텝이 있으면 임시 대각선을 한 번 쓰고 다음 스텝에서 다시 goal X로 정렬할 수 있다
- same-X 상황에서 좌우가 모두 가능하면 현재 바라보는 방향을 우선 사용해 고정 편향을 줄인다
- 마지막 vertical step에서는 굳이 억지 대각선을 만들지 않고 goal X에 맞춘다

---

## 규칙 4: 보이는 영역 제약 (Visible Range)

> 고양이와 생선은 에디터의 **실제 visible ranges** 안에서만 동작한다.

- 현재 구현은 단일 `start~end` 구간이 아니라 `TextEditor.visibleRanges`의 **모든 실제 구간**을 그대로 반영한다
- 여러 visible range 사이의 숨겨진 gap line은 보이지 않는 줄로 처리한다
- 보이지 않는 줄은 `isEmptyLine() = true`로 처리
- 생선도 실제로 보이는 줄에서만 생성된다

---

## 규칙 5: 경로 규칙 (Route Rules)

> A* 경로 탐색은 라인 단위, 실제 X 이동은 run으로 수행.

- jump/fall은 수직 이동 + 제한된 수평 이동
- 큰 수평 이동이 필요하면 해당 라인에서 **run**으로 이동 후 jump/fall
- 생선은 실제 목표 `(line, col)`까지 경로가 성립하는 위치에만 생성
- 단순히 같은 line이 reachable한 것만으로는 충분하지 않다
- 현재 위치에서 유효한 생선 후보가 하나도 없으면 고양이는 아예 스폰되지 않는다
- 이미 스폰된 생선이 3회 연속 경로 실패하면 포기

---

## 규칙 6: 먹기 후 대기와 수면

> 같은 세션 안에서는 생선을 먹은 직후 다음 생선이 뜰 때까지 마지막 먹기 포즈를 유지하고, 세션이 끝나면 sleep으로 쉰다.

- `eat` 애니메이션 2단계가 끝나면 `post_eat` 상태로 전환
- `post_eat` 상태에서는 마지막 `eat` 프레임을 고정해 표시
- 세션 카운트(`fishSessionCount`)를 모두 채우면 `sleep` 상태로 전환
- `sleepTime`이 지나 다음 생선이 스폰되면 `surprise`로 넘어가 다시 추적을 시작

---

## 규칙 충돌 해결 순서

1. 🔴 텍스트 제약 (절대)
2. 이동 연속성 (adaptive speed)
3. 🟡 Per-line 수평 제한 (최선 노력)
4. 보이는 영역 제약

---

## 테스트 반영

아래 테스트들이 현재 규칙을 직접 보호한다.

| 규칙 | 테스트 |
|------|--------|
| 텍스트 위 유지 / 연속성 | `testMovementStaysOnTextAndContinuous` |
| same-y 내부 공백 run 허용 | `testSameLineRunTreatsInteriorSpacesAsTraversable` |
| vertical stride = `0` 또는 `2 × lineDelta` | `testVerticalLandingsUseOnlyZeroOrFixedStride` |
| goal 방향 짧은 diagonal 접근 | `testGoalDirectedRouteUsesProgressiveDiagonalStride` |
| same-X 임시 diagonal 후 goal 정렬 | `testAlignedGoalRouteUsesTemporaryDiagonalThenSettles` |
| multi-line scaled stride / zero fallback | `testMultiLineVerticalStrideScalesWithLineDistance`, `testMultiLineVerticalStrideFallsBackToZeroWhenLandingIsImpossible` |
| landing pause | `testLandingPauseSeparatesConsecutiveVerticalMoves` |
| visible range 제약 | `testVisibleRangeConstraint`, `testDisjointVisibleRangesExcludeHiddenLinesFromFishSpawns` |
| exact fish reachability spawn | `testFishSpawnCandidatesRequireExactReachability` |
| no-fish-candidate spawn skip 전제 | `testCanSpawnFishFromCurrentPositionDetectsEmptyChaseCases` |
| post-eat / session sleep | `testPostEatHoldsLastPoseUntilRespawn`, `testSessionEndSleepsUntilRespawn` |
