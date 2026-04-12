# Code Cat Life Abi — Known Issues And Fixed Regressions

## ✅ FIXED: Vertical Move Jitter

### 문제

- jump/fall 중 X가 애매한 소폭(`±1` 등)으로 이동하는 경우가 있었다.
- 규칙상 원하는 동작은 `0` 또는 `2 × lineDelta` 이동뿐인데, near-goal 상황에서 partial stride가 섞였다.

### 현재 구현

- jump/fall 착지는 `0` 또는 `±(2 × lineDelta)` 후보만 사용한다.
- goal 방향 stride가 가능하면 우선 사용하고, 불가능하면 `0` stride로 fallback 한다.
- multi-line vertical step에서도 같은 규칙을 그대로 유지한다.

### 회귀 테스트

- `testVerticalLandingsUseOnlyZeroOrFixedStride`
- `testGoalDirectedRouteUsesProgressiveDiagonalStride`
- `testAlignedGoalRouteUsesTemporaryDiagonalThenSettles`
- `testMultiLineVerticalStrideScalesWithLineDistance`
- `testMultiLineVerticalStrideFallsBackToZeroWhenLandingIsImpossible`

## ✅ FIXED: Exact Fish Reachability Mismatch

### 문제

- 예전에는 어떤 line이 reachable하기만 하면 그 line의 unreachable column에도 생선이 스폰될 수 있었다.
- 그래서 생선은 보이는데 실제 추적 route를 만들지 못하는 경우가 있었다.

### 현재 구현

- 생선 후보는 exact `(line, col)` 경로가 성립할 때만 생성된다.
- 현재 위치에서 유효한 생선 후보가 하나도 없으면 고양이는 스폰되지 않는다.

### 회귀 테스트

- `testFishSpawnCandidatesRequireExactReachability`
- `testCanSpawnFishFromCurrentPositionDetectsEmptyChaseCases`

## ✅ FIXED: Visible Range Gap Leakage

### 문제

- 여러 `visibleRanges`를 단일 `start~end` 범위로 합치면, 그 사이의 숨겨진 gap line에서도 생선이 생성될 수 있었다.

### 현재 구현

- physics는 `TextEditor.visibleRanges`의 실제 구간 배열을 그대로 받는다.
- gap line은 보이지 않는 줄로 처리되며, 이동/생성 대상에서 제외된다.

### 회귀 테스트

- `testVisibleRangeConstraint`
- `testDisjointVisibleRangesExcludeHiddenLinesFromFishSpawns`

## ✅ FIXED: Post-Eat Pose And Session Sleep

### 문제

- 같은 세션 안에서도 생선을 먹자마자 sleep/idle 비주얼로 돌아가 동작이 끊겨 보였다.
- 세션이 끝난 뒤 sleep으로 쉬는 흐름도 분명하지 않았다.

### 현재 구현

- 세션이 이어지는 동안에는 `post_eat` 상태로 마지막 먹기 프레임을 유지한다.
- `fishSessionCount`만큼 먹으면 `sleep` 상태로 전환해 `sleepTime` 동안 쉰다.

### 회귀 테스트

- `testPostEatHoldsLastPoseUntilRespawn`
- `testSessionEndSleepsUntilRespawn`

## ✅ FIXED: Reset / Despawn Residual State

### 문제

- reset/despawn 이후 route, target, fish timer, chase state 같은 transient state가 남을 위험이 있었다.

### 현재 구현

- movement state와 fish target state를 공통 정리 로직으로 초기화한다.
- reset 이후에는 현재 line의 left edge로 다시 정렬된다.

### 회귀 테스트

- `testResetClearsTransientMovementAndFishState`
