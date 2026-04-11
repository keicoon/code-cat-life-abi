# Code Cat

코드 위를 실제 지형처럼 뛰어다니는 VS Code용 고양이입니다.  
입력이 멈추면 에디터 안에 나타나고, 텍스트 블록을 발판 삼아 달리고 점프하며 생선을 쫓습니다.

![Code Cat preview](media/code-cat-preview.gif)

## What Makes It Fun

- 코드가 그냥 배경이 아니라 실제 지형이 됩니다. 고양이는 공백 라인을 피하고, 텍스트 범위를 따라 run/jump/fall 합니다.
- 생선 추적이 단순 랜덤 애니메이션이 아닙니다. 보이는 코드 범위 안에서 경로를 만들고, 짧은 대각선 이동을 섞어 자연스럽게 접근합니다.
- 먹고 끝나는 캐릭터가 아닙니다. 같은 세션 안에서는 먹기 포즈를 잠깐 유지하고, 설정한 횟수만큼 생선을 먹으면 sleep 상태로 쉬었다가 다시 활동합니다.
- 화면 분위기에 맞게 조절할 수 있습니다. 색상, 등장 시간, 세션 길이, 전체 속도, 발자국 표시를 설정할 수 있습니다.

## Behavior

1. 에디터에서 입력이 멈추면 고양이가 커서 근처의 텍스트 위에 등장합니다.
2. 생선이 나타나면 놀란 표정으로 반응한 뒤, 코드 지형을 따라 추적합니다.
3. 같은 세션 안에서는 생선을 먹고 마지막 먹기 포즈를 잠깐 유지한 채 다음 생선을 기다립니다.
4. `codeCat.fishSessionCount`만큼 연속으로 먹으면 `codeCat.sleepTime` 동안 잠시 sleep 상태로 쉽니다.
5. 사용자가 다시 타이핑하거나 커서를 움직이면 즉시 사라집니다.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `codeCat.enabled` | `true` | 확장 켜기/끄기 |
| `codeCat.catColor` | `#ffffff` | 고양이 색상 |
| `codeCat.idleTimeout` | `2` | 입력이 멈춘 뒤 고양이가 등장하기까지의 시간 (초) |
| `codeCat.sleepTime` | `8` | 한 세션이 끝난 뒤 sleep 상태로 쉬는 시간 (초) |
| `codeCat.fishSessionCount` | `5` | sleep 전에 연속으로 추적하는 생선 수 |
| `codeCat.animationSpeed` | `1.0` | run/jump/fall 및 추적 템포 전체에 적용되는 속도 배수 |
| `codeCat.showFootprints` | `true` | 달리는 동안 발자국 표시 여부 |

## Commands

- `Code Cat: Toggle`: 확장을 즉시 켜거나 끕니다.

## Installation

Marketplace 배포 전에는 VSIX로 바로 설치할 수 있습니다.

```bash
npm run package:vsix
code --install-extension code-cat-<version>.vsix
```

## Development

```bash
npm install
npm test
npm run watch
```

- 이동 규칙 문서: [docs/movement-rules.md](docs/movement-rules.md)
- 배포 가이드: [docs/publishing.md](docs/publishing.md)
- 알려진 이슈 및 회귀 정리: [docs/known-issues.md](docs/known-issues.md)

## Packaging

- 로컬 VSIX 패키징: `npm run package:vsix`
- 마켓플레이스 배포: `npm run publish:vsix`

## License

[MIT](LICENSE)
