# Code Cat — VS Code 마켓플레이스 배포 가이드

## 1. 사전 준비

### Azure DevOps 계정 & Personal Access Token (PAT)

1. [dev.azure.com](https://dev.azure.com) 에서 계정 생성 (Microsoft 계정 필요)
2. **User Settings → Personal Access Tokens → New Token**
   - Name: 원하는 이름 (예: `vscode-vsce`)
   - Organization: **All accessible organizations**
   - Scopes: **Custom defined** → **Marketplace > Manage** 체크
3. 생성된 토큰을 안전한 곳에 복사해 둘 것 (다시 확인 불가)

### 퍼블리셔 등록

1. [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) 접속
2. **Create Publisher** 클릭
3. Publisher ID를 `package.json`의 `"publisher"` 값과 동일하게 설정 (현재: `keicoon15`)

## 2. 로컬 설치 (테스트/공유용)

패키징 후 `.vsix` 파일로 직접 설치하는 방법:

```bash
# 빌드 & 패키징
npm run package:vsix

# 설치
code --install-extension code-cat-<version>.vsix
```

- 현재 저장소 루트에는 최신 패키징 결과인 `code-cat-<version>.vsix`가 생성됨
- 실제 배포 파일에는 `.vscodeignore` 기준으로 `src/`, `docs/`, `demo/`, `prototype/` 등이 제외됨
- 패키징 전에는 항상 `npm test`까지 한 번 통과시키는 편이 안전함

## 3. 마켓플레이스 배포

### 최초 배포

```bash
# 퍼블리셔 로그인 (PAT 입력)
npx @vscode/vsce login keicoon15

# 배포
npm run publish:vsix
```

### 버전 업데이트 배포

```bash
# patch: 0.0.1 → 0.0.2
npx @vscode/vsce publish patch

# minor: 0.1.0 → 0.2.0
npx @vscode/vsce publish minor

# major: 1.0.0 → 2.0.0
npx @vscode/vsce publish major
```

> `@vscode/vsce publish <level>` 명령은 `package.json`의 버전을 자동으로 올리고 배포까지 한번에 처리합니다.

## 4. 배포 전 체크리스트

- [ ] `package.json` — `name`, `displayName`, `description`, `version`, `publisher` 확인
- [ ] `README.md` — 마켓플레이스 상세 페이지에 그대로 표시됨
- [ ] `CHANGELOG.md` — 릴리스 변경 사항 정리
- [ ] `icon.png` — 128x128 이상 권장
- [ ] `LICENSE` — 패키징 경고가 없도록 포함
- [ ] `npm run compile` — 빌드 에러 없는지 확인
- [ ] `npm test` — 이동 회귀 및 먹기 후 대기 포즈 회귀 확인
- [ ] `.vscodeignore` — VSIX에 포함/제외할 파일 확인

## 5. 배포 취소 / 삭제

```bash
# 특정 버전 배포 취소
npx @vscode/vsce unpublish keicoon15.code-cat
```

또는 [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) 에서 직접 관리 가능.
