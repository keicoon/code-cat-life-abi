# Code Cat 🐱

코드 에디터에 사는 귀여운 고양이. 코드를 플랫포머 지형처럼 돌아다니며 생선을 쫓아 먹습니다.

## Features

- 🐱 **Idle Detection** — 일정 시간 입력이 없으면 고양이가 나타남
- 🐟 **Fish Chase** — 랜덤 위치에 생선 스폰 → A* 경로 탐색 → 추적 → 먹기
- 🏃 **Platformer Movement** — 코드 텍스트를 지형으로 인식, run/jump/fall
- 🐾 **Footprints** — 달리는 경로에 발자국 표시
- 🎨 **Customizable** — 고양이 색상, 속도, idle 시간 등 설정 가능

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `codeCat.enabled` | `true` | 켜기/끄기 |
| `codeCat.catColor` | `#ffffff` | 고양이 색상 (hex) |
| `codeCat.idleTimeout` | `5` | idle 대기 시간 (초) |
| `codeCat.fishInterval` | `8` | 생선 스폰 간격 (초) |
| `codeCat.animationSpeed` | `1.0` | 애니메이션 속도 (0.5~2.0) |
| `codeCat.showFootprints` | `true` | 발자국 표시 |

## Commands

- `Code Cat: Toggle` — 고양이 켜기/끄기

## How It Works

1. 에디터에서 일정 시간 입력이 없으면 고양이가 커서 근처에 스폰
2. 잠시 후 생선이 나타나면 놀란 표정 → 추적 → 먹기
3. 4~7마리 연속 먹은 후 다시 잠듦
4. 타이핑 재개 시 즉시 사라짐
