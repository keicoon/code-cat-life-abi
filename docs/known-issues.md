# Code Cat Life Abi — 알려진 이슈 (Known Issues)

## ✅ FIXED: Vertical Move Jitter

### 문제
- jump/fall 중 X가 애매한 소폭(`±1` 등)으로 이동하는 경우가 있었다.
- 규칙상 원하는 동작은 `0` 또는 `고정값 2컬럼` 이동뿐인데, near-goal 상황에서 partial stride가 섞였다.

### 수정
- jump/fall 착지를 하나의 규칙으로 통일했다.
- Y 이동 중 X 착지는 항상 `0` 또는 `±(2 × lineDelta)` 후보만 사용한다.
- goal 방향 stride가 가능하면, goal과의 X 차이가 작아도 Y 이동에 X를 포함한다.
- 2줄/3줄 이동에서는 각각 `4컬럼/6컬럼` diagonal을 우선 시도한다.
- scaled diagonal 착지가 텍스트 위에 불가능하면 `0` stride로 fallback 한다.
- goal과 X가 이미 맞아도 남은 Y 스텝이 있으면 임시 대각선을 허용하고, 마지막 스텝에서 다시 goal X로 정렬한다.
- 같은 경로 안에서는 미리 source line에서 크게 run하지 않고, 현재 위치에서 짧은 Y 이동과 대각선 기회를 우선 사용한다.
- jump/fall 경로 후보와 실제 착지 계산이 같은 stride 규칙을 공유한다.
- `fallSpeed`를 `jumpSpeed`와 동일하게 맞췄다.

### 회귀 테스트
- `testVerticalLandingsUseOnlyZeroOrFixedStride`
- `testGoalDirectedRouteUsesProgressiveDiagonalStride`
- `testAlignedGoalRouteUsesTemporaryDiagonalThenSettles`
- `testMultiLineVerticalStrideScalesWithLineDistance`
- `testMultiLineVerticalStrideFallsBackToZeroWhenLandingIsImpossible`

## ✅ FIXED: Post-Eat Pose And Session Sleep

### 문제
- 같은 세션 안에서도 생선을 먹자마자 sleep/idle 비주얼로 돌아가서 동작이 끊겨 보였다.
- 반대로 세션이 끝난 뒤에는 실제로 sleep으로 쉬어야 하는데 그 흐름이 분명하지 않았다.

### 수정
- 세션이 이어지는 동안에는 `post_eat` 상태로 들어가 마지막 먹기 프레임을 유지한다.
- `fishSessionCount`만큼 먹으면 `sleep` 상태로 전환해 `sleepTime` 동안 쉰다.
- 다음 생선이 생성되면 `post_eat` 또는 `sleep`에서 바로 `surprise`로 넘어간다.

### 회귀 테스트
- `testPostEatHoldsLastPoseUntilRespawn`
- `testSessionEndSleepsUntilRespawn`

## ✅ FIXED: Movement Regression Suite Scope

### 문제
- 기존 테스트 스위트는 이동 규칙 외의 세션/스폰/연속 섭취까지 넓게 포함하고 있어서, 실제 이동 회귀 포인트가 흐려졌다.

### 수정
- 이동 규칙에 직접 연결되는 테스트만 남겼다.
- 핵심 회귀는 아래 여섯 가지로 축소했다.
  - 텍스트 위 유지
  - 이동 연속성
  - vertical stride가 `0` 또는 `2 × lineDelta`만 사용되는지
  - goal 방향 route가 짧은 diagonal step을 연속 사용해 접근하는지
  - same-X route가 임시 diagonal 후 다시 goal X에 정렬되는지
  - multi-line jump/fall에서 scaled stride와 `0` fallback이 맞는지
  - 생선 먹은 뒤 post-eat 포즈가 유지되는지
