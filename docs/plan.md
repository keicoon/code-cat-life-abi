# Code Cat Life Abi — VS Code Extension Prototyping Plan

## Overview
VS Code extension: 유저가 일정 시간 입력하지 않으면 하얀 고양이가 에디터 위에 나타나서 텍스트를 플랫포머 지형처럼 돌아다니고, 생선을 쫓아가 먹는다. 타이핑 재개 시 고양이가 사라진다.

## Confirmed Assets (26 SVGs)
| Category | Files | Count |
|----------|-------|-------|
| Run | cat_0~4_right/left.svg | 10 |
| Sleep | cat_sleep.svg, cat_sleep_left.svg | 2 |
| Jump | cat_jump_right/left.svg | 2 |
| Fall | cat_fall_right/left.svg | 2 |
| Crouch | cat_crouch_right/left.svg | 2 |
| Eat | cat_eat_0~1_right/left.svg | 4 |
| Surprise | cat_surprise_right/left.svg | 2 |
| Fish | fish.svg | 1 |
| Paw | paw.svg | 1 |

**Deprecated**: walk (품질 부족), climb (비현실적)

## Architecture
```
code-cat-life-abi/
├── src/
│   ├── extension.ts          # activate/deactivate, idle detection
│   ├── cat-physics.ts        # terrain parsing, A* pathfinding, state machine
│   ├── cat-renderer.ts       # ICatRenderer interface
│   ├── decoration-renderer.ts # TextEditorDecorationType 기반 구현
│   ├── sprite-manager.ts     # SVG → data-uri 변환, 프레임 관리
│   └── types.ts              # shared types/enums
├── sprites/                  # SVG assets (26 files)
├── package.json              # extension manifest
└── tsconfig.json
```

## Physics Rules (from HTML demo)
- **States**: idle, run, jump, fall, eat, surprise, crouch, sleep
- **Compound**: run_then_jump, run_then_fall (수평 이동 후 수직 전환)
- **Terrain**: 문자 = solid, 공백/빈줄 = air. 고양이는 텍스트 위에 서있음
- **Jump**: 최대 3줄 위, col±1 통로 필요, 착지 줄에 텍스트 존재 필수
- **Fall**: 무제한 낙하 (중력), 첫 텍스트 줄에 착지
- **Fish**: 도달 가능한 가장 먼 위치 top50%에서 랜덤 스폰 → A*로 추적
- **Speed**: RUN=0.4, JUMP=0.3, FALL=0.5 (chars/tick), tick=80ms

## Implementation Phases

### Phase 1: Extension Scaffolding
- yo code로 TypeScript extension 생성
- package.json: activation event, commands (toggle, settings)
- 기본 activate/deactivate 구조

### Phase 2: Sprite System
- SVG 파일 → base64 data-uri 변환 (빌드 타임 or 런타임)
- SpriteManager: state/direction/frame → data-uri 매핑
- TextEditorDecorationType 생성/교체 로직

### Phase 3: Terrain & Physics
- 현재 에디터 텍스트 → terrain map 변환
- A* pathfinding 포팅 (line-level nodes, jump/fall edges)
- State machine + compound state 로직
- Fish spawn/chase 시스템

### Phase 4: Renderer
- DecorationRenderer: 고양이 위치 → decoration 적용
  - `before` pseudo-element with background-image (data-uri SVG)
  - 매 tick마다 이전 decoration dispose → 새 decoration setDecorations
- Fish decoration (별도 DecorationType)
- Footprint trail (paw.svg, opacity fade, auto-dispose)
- Zzz effect (sleep 시 'z' 문자 decoration)

### Phase 5: Idle Detection & Integration
- onDidChangeTextEditorSelection / onDidChangeTextDocument 리스너
- N초 idle → 고양이 스폰 (sleep 상태)
- 타이핑 재개 → 고양이 즉시 사라짐
- 에디터 전환 시 고양이 위치 리셋

### Phase 6: Polish & Config
- extension settings: idle timeout, animation speed, enable/disable
- StatusBar item (고양이 상태 표시, 잡은 생선 수)
- 에디터 스크롤/리사이즈 대응
- 빈 파일/빈 줄만 있는 파일 처리

## Key Technical Decisions
1. **Decoration API only** (공식 API, Plan A)
2. **SVG as data-uri**: `before` pseudo-element의 `background-image`로 렌더링
3. **Tick 기반 업데이트**: setInterval(80ms)로 물리 엔진 구동
4. **단일 에디터**: activeTextEditor에서만 동작
5. **텍스트 변경 감지**: document 변경 시 terrain 재파싱 + 고양이 위치 유효성 검사

## Risks & Mitigations
- **성능**: decoration 교체 빈번 → dispose/create 최소화, 변경 시에만 업데이트
- **빈줄 문제**: zero-width Range + `before` pseudo로 빈줄에도 렌더링 가능 (검증됨)
- **SVG 크기**: decoration은 line-height에 맞춰짐, 고양이 크기는 CSS로 제어
- **다중 에디터**: 일단 active editor만 지원, 추후 확장
