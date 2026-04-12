# Code Cat Life Abi — Current Implementation Snapshot

## Overview

현재 확장은 다음 흐름으로 동작한다.

1. 사용자가 일정 시간 입력하지 않으면 `extension.ts`가 고양이 스폰을 시도한다.
2. 현재 활성 에디터의 텍스트와 `visibleRanges`를 `cat-physics.ts`에 전달한다.
3. 현재 스폰 위치에서 실제로 도달 가능한 생선 후보가 하나라도 있을 때만 고양이가 활성화된다.
4. 고양이는 보이는 텍스트를 지형처럼 사용해 생선을 추적하고, 세션 수만큼 먹으면 sleep 상태로 쉰다.
5. 타이핑, 커서 이동, 에디터 전환, 스크롤이 발생하면 고양이는 despawn 된다.

## Runtime Structure

```text
src/
├── extension.ts            # VS Code 이벤트 연결, idle timer, spawn/despawn, status bar, debug logs
├── cat-physics.ts          # 지형 파싱, visible range 제약, pathfinding, fish 후보 계산, 상태 머신
├── decoration-renderer.ts  # cat/fish/paw decoration 렌더링과 정리
├── sprite-manager.ts       # SVG 로드, 색상 적용, action/frame 매핑
└── types.ts                # shared types/default physics
```

## Current Behavior

### Visibility

- extension은 `TextEditor.visibleRanges` 중에서 현재 cursor/spawn line이 속한 하나의 연속 구간만 선택한다.
- 따라서 folded/hidden gap을 사이에 둔 다른 visible 구간은 현재 세션의 이동 범위에서 제외된다.
- 현재 스폰 위치에서 유효한 생선 후보가 전혀 없으면 고양이는 에디터에 나타나지 않고 status bar만 sleep 상태로 남는다.

### Terrain Model

- 줄의 첫 non-space부터 마지막 non-space까지를 같은 수평 지형으로 본다.
- 따라서 same-y 이동에서는 줄 내부 공백도 별도 gap으로 취급하지 않는다.
- 공백만 있는 줄이나 visible range 밖 줄에는 착지할 수 없다.

### Movement

- 상태: `idle`, `sleep`, `run`, `jump`, `fall`, `land`, `eat`, `post_eat`, `surprise`, `run_then_jump`, `run_then_fall`
- vertical step의 수평 이동량은 `0` 또는 `2 × lineDelta`
- 큰 수평 이동이 필요하면 같은 줄에서 `run`으로 이동한 뒤 vertical step을 수행한다.
- 생선 후보는 exact `(line, col)` 경로가 성립하는 경우에만 생성된다.

### Session Flow

- 생선을 먹으면 `eat` 2단계를 거친다.
- 세션이 계속되면 `post_eat`으로 마지막 먹기 프레임을 유지한다.
- `fishSessionCount`만큼 먹으면 `sleep` 상태로 들어가 `sleepTime` 동안 쉰다.

## Current Verification

- 테스트 엔트리: `src/cat-physics.test.ts`
- 실행 명령: `npm test`
- 현재 회귀 스위트는 다음을 보호한다.
  - 텍스트 위 유지와 이동 연속성
  - same-y 내부 공백 이동
  - vertical stride 규칙
  - visible segment 선택과 hidden gap 배제
  - exact fish reachability spawn
  - no-fish-candidate spawn skip 전제
  - reset 시 transient state 정리
  - post-eat / sleep 세션 흐름

## Non-Goals For Now

- same-y 1칸 hop 같은 별도 수평 액션은 아직 구현하지 않았다.
- 한 줄 내부를 연속된 segment들로 나누는 지형 모델도 아직 도입하지 않았다.
- multi-editor 동시 지원은 하지 않고 active editor만 대상으로 동작한다.
