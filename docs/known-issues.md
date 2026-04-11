# Code Cat — 알려진 이슈 (Known Issues)

## ⚠️ ISSUE-001: Jump/Fall 중 Goal Shifting 진동 (Oscillation)

### 현상
Y축 이동(jump/fall) 중 X축이 불필요하게 미세 이동한 뒤, 착지 후 반대 방향으로 복귀하는 패턴이 반복됨.

- 시작 위치와 도착 위치의 X가 동일한데도 jump/fall 중 X가 ±2 드리프트
- 착지 후 다음 run에서 반대 방향으로 보정 → 시각적 "떨림"

### 원인 분석

`run_then_jump`/`run_then_fall`에서 **goal shifting** 로직이 문제.

```
maxH = 2 (고정)
goalDir = sign(routeGoalCol - jumpStartCol)
shifted = clampToTextEdges(targetLine, jumpStartCol + goalDir * maxH)
```

**문제 시나리오** (uniform terrain, goal=11, cat=10):

| Step | col | goalDir | shift(maxH=2) | 착지 | 결과 |
|------|-----|---------|---------------|------|------|
| 0    | 10  | +1      | +2            | 12   | **오버슈트** (goal=11) |
| 1    | 12  | -1      | -2            | 10   | 반대 방향 복귀 |
| 2    | 10  | +1      | +2            | 12   | 다시 오버슈트 |
| 3    | 12  | -1      | -2            | 10   | 반복... |

goal까지 거리가 maxH보다 작을 때 오버슈트 → 진동이 발생함.

### 현재 상태

goal shifting을 **완전 제거**한 상태 → 진동은 해결되었으나 **대각선 이동도 사라짐**.

- jump/fall 중 X 이동이 거의 0 (텍스트 범위가 겹칠 때)
- 수평 이동은 run 구간에서만 발생
- 기능적으로는 정상이지만, 이동이 "계단식"으로 보임 (run→수직jump→run→수직fall)

### 제안 해결법

goal shifting을 복원하되, **shift 크기를 goal까지 남은 거리로 제한**:

```typescript
// 기존 (진동 발생):
const shifted = jumpStartCol + goalDir * maxH;

// 수정 (오버슈트 방지):
const remaining = Math.abs(routeGoalCol - jumpStartCol);
const shiftAmount = Math.min(maxH, remaining);
const shifted = jumpStartCol + goalDir * shiftAmount;
```

이렇게 하면:
- goal이 멀 때 (dist > maxH): 기존처럼 maxH만큼 대각선 이동
- goal이 가까울 때 (dist ≤ maxH): 딱 goal까지만 이동, 오버슈트 없음
- goal에 도달했으면 (dist = 0): shift 없음, 순수 수직

**동일한 수정이 3곳에 필요**:
1. `run_then_jump` 내 goal shifting (현재 제거됨)
2. `run_then_fall` 내 goal shifting (현재 제거됨)
3. `optimizeRouteColumns` 내 `estLanding` 계산

### 관련 파일
- `src/cat-physics.ts`: `run_then_jump`, `run_then_fall`, `optimizeRouteColumns`
- `src/cat-physics.test.ts`: `testNoJitterDuringJumpFall` (현재 uniform terrain에서 displacement ≤ 0.5 검증)
- `docs/movement-rules.md`: 규칙 3 (수평 제한)

### 테스트 보강 필요
- 수정 후 대각선 이동이 실제로 발생하는지 검증하는 테스트 추가
- staircase terrain에서 jump/fall 중 X 이동량 > 0 확인
- uniform terrain에서 오버슈트/진동 없음 확인

---

## ✅ FIXED: Jump/Fall X Displacement 초과 (maxH=2)

### 현상 (수정됨)
`getLineNeighbors()`에서 생성한 jump/fall 이웃이 수평 간격 검증 없이 A* 경로에 포함됨.
WIDE_GAP terrain에서 28~36 컬럼 displacement 발생.

### 수정 내용
- `minTextGap()` 헬퍼 추가: 두 라인의 텍스트 범위 간 최소 수평 거리 계산
- jump 루프: `minTextGap > MAX_H_CAP`이면 skip
- fall 루프: `minTextGap > MAX_H_CAP`이면 `continue` (더 아래 라인 탐색)
- `MAX_H_CAP = 2` 상수화 (하드코딩 3곳 → 상수 참조)

### 회귀 테스트
- `testJumpFallMaxHDisplacement`: staircase, wide_gap, basic terrain에서 모든 jump/fall displacement ≤ 2 검증
