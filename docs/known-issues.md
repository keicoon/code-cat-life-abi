# Code Cat — 알려진 이슈 (Known Issues)

## ✅ FIXED: Vertical Move Jitter

### 문제
- jump/fall 중 X가 애매한 소폭(`±1` 등)으로 이동하는 경우가 있었다.
- 규칙상 원하는 동작은 `0` 또는 `고정값 2컬럼` 이동뿐인데, near-goal 상황에서 partial stride가 섞였다.

### 수정
- jump/fall 착지를 하나의 규칙으로 통일했다.
- Y 이동 중 X 착지는 항상 `0` 또는 `±2` 후보만 사용한다.
- goal까지 남은 X 차이가 2보다 작으면 Y 이동에서는 X를 움직이지 않고 run에서 마무리한다.
- jump/fall 경로 후보와 실제 착지 계산이 같은 stride 규칙을 공유한다.

### 회귀 테스트
- `testVerticalMovesUseOnlyZeroOrFixedStride`
- `testFarGoalUsesFixedStrideForJumpAndFall`
- `testNearGoalUsesZeroStrideForJumpAndFall`

## ✅ FIXED: Movement Regression Suite Scope

### 문제
- 기존 테스트 스위트는 이동 규칙 외의 세션/스폰/연속 섭취까지 넓게 포함하고 있어서, 실제 이동 회귀 포인트가 흐려졌다.

### 수정
- 이동 규칙에 직접 연결되는 테스트만 남겼다.
- 핵심 회귀는 아래 다섯 가지로 축소했다.
  - 텍스트 위 유지
  - 이동 연속성
  - vertical stride가 `0` 또는 `2`만 사용되는지
  - far-goal에서 jump/fall이 `2`컬럼 stride를 쓰는지
  - near-goal에서 partial stride 없이 `0` stride를 쓰는지
