# Code Cat — 이동 규칙 (Movement Rules)

모든 이동 로직은 아래 규칙을 반드시 준수해야 한다.
규칙 간 충돌 시 **우선순위가 높은 규칙이 승리**한다.

---

## 규칙 1: 텍스트 제약 (Text Constraint) — 🔴 절대 규칙 (최우선)

> 고양이는 **항상** 텍스트가 존재하는 위치에만 있어야 한다.

- `state.col`은 해당 `state.line`의 `textEdges(line).left` ~ `textEdges(line).right` 범위 내
- **빈 라인**(공백만 있는 라인)에는 착지 불가
- jump/fall **착지 시점**: `targetCol`은 반드시 대상 라인의 `clampToTextEdges` 결과
- run 시: `targetCol`은 대상 라인의 텍스트 범위 내
- 다른 규칙(per-line cap 등)과 충돌 시 **이 규칙이 항상 우선**

### 적용 지점
| 상태 | col 제약 보장 방법 |
|------|-------------------|
| spawn | `textEdges(line).left`에서 시작 |
| idle/sleep | 위치 변하지 않음 |
| run | `targetCol = clampToTextEdges(line, goalCol)` |
| run_then_jump/fall | 트랜짓 col = `clampToTextEdges(sourceLine, col)` |
| jump/fall 착지 | `targetCol = clampToTextEdges(destLine, col)` |
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

## 규칙 3: 점프/낙하 수평 제한 (Per-line Horizontal Cap) — 🟡 최선 노력

> Y축 이동 중 X축 이동량은 수직 거리에 비례하여 제한한다.

```
maxH = min(maxJumpCols, max(2, vertDist × 2))
```

- 1줄 이동: 최대 X = 2 컬럼
- 2줄 이동: 최대 X = 4 컬럼
- 3줄 이동: 최대 X = 6 컬럼
- 절대 상한: `maxJumpCols` (기본 20)

### 보장 방식
1. **경로 플래너** (`optimizeRouteColumns`): 트랜짓 col을 도착 텍스트 근처로 조정
   → 고양이가 먼저 달려서 가까이 간 후 짧은 점프/낙하
2. **실행 시점**: cap 초과 시 `clampToTextEdges(destLine, cappedCol)` 시도
   → 결과가 원래보다 가까우면 채택, 아니면 텍스트 제약 우선 (규칙 1)

---

## 규칙 4: 보이는 영역 제약 (Visible Range)

> 고양이는 `visibleStart` ~ `visibleEnd` 범위 내에서만 이동한다.

- 범위 밖 라인은 `isEmptyLine() = true`로 처리
- 생선도 보이는 영역 내에서만 생성

---

## 규칙 5: 경로 규칙 (Route Rules)

> A* 경로 탐색은 라인 단위, 실제 X 이동은 run으로 수행.

- jump/fall은 수직 이동 + 제한된 수평 이동
- 큰 수평 이동이 필요하면 해당 라인에서 **run**으로 이동 후 jump/fall
- 생선은 A*로 도달 가능한 위치에만 생성 (3회 실패 시 포기)

---

## 규칙 충돌 해결 순서

1. 🔴 텍스트 제약 (절대)
2. 이동 연속성 (adaptive speed)
3. 🟡 Per-line 수평 제한 (최선 노력)
4. 보이는 영역 제약
