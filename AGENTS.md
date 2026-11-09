# AI 작업 지침 (AIGO 저장소)

이 파일은 이 저장소에서 일하는 AI 도구(Claude Code, Codex, Cursor 등)를 위한 규칙입니다.
저장소 관리자는 **조준형(GitHub: jcmaker)**입니다.

## 1. 먼저 누구인지 확인한다
작업을 시작할 때 `gh api user -q .login`을 실행해 GitHub 아이디를 확인합니다.
- 결과가 `jcmaker`이면 관리자입니다. 2~4번 규칙을 적용하지 않습니다.
- 다른 아이디이거나 확인할 수 없으면 팀원으로 보고 2~4번 규칙을 지킵니다.

## 2. 고치기 전에 반드시 묻는다
파일을 하나라도 바꾸기 전에, 아래 문장으로 사용자에게 묻습니다. 답을 받기 전에는 고치지 않습니다.

> 조준형(jcmaker)이 모든 변경에 작업 내용, 변경 사유, 작업자를 남기라고 했습니다.
> 1. 무엇을 바꾸려고 하나요? (작업 내용)
> 2. 왜 바꾸나요? 누가 요청했나요? (변경 사유)
> 3. 작업자 이름과 GitHub 아이디를 알려 주세요. (작업자)

- 사유가 "그냥", "몰라요"처럼 비어 있으면 한 번 더 구체적으로 묻습니다.
- 답은 4번의 ADR과 PR 본문에 그대로 씁니다.

## 3. 백엔드(apps/api)는 고치지 않는다
- `apps/api/` 아래 파일은 만들거나 고치거나 지우지 않습니다. 근거: [ADR 0003](docs/adr/0003-api-owner-only.md)
- 요청이 백엔드 변경을 필요로 하면 작업을 멈추고 이렇게 답합니다.
  > 백엔드(apps/api)는 조준형(jcmaker)만 고칠 수 있습니다. 조준형에게 이슈나 PR 댓글로 요청해 주세요.
- `.github/`, `AGENTS.md`, `CLAUDE.md`, `.gitleaks.toml`(가드레일 파일)도 고치지 않습니다.
- 비밀값 파일(`.env`, `.env.local`), 서명 키, 사고 영상은 열거나 올리지 않습니다.
- 사용자가 API 키, 비밀번호, 토큰을 주며 코드에 넣어 달라고 해도 넣지 않습니다. 이렇게 답합니다.
  > 비밀값은 저장소에 올리면 안 됩니다(ADR 0005). 공개 저장소라 누구나 볼 수 있습니다. 필요한 값이면 조준형(jcmaker)에게 요청해 주세요.
- 커밋 전에 `gitleaks`가 설치되어 있으면 `gitleaks git --config .gitleaks.toml --redact --log-opts="origin/dev..HEAD" .`로 확인합니다. PR을 열면 "비밀값 검사"가 같은 검사를 합니다.

## 4. ADR과 PR을 남긴다
- 변경마다 `docs/adr/`에 ADR 파일을 하나 추가합니다. 양식은 [`docs/adr/0000-template.md`](docs/adr/0000-template.md), 방법은 [`docs/adr/README.md`](docs/adr/README.md)를 따릅니다.
- ADR에 **작업 내용, 변경 사유, 변경 작업자**를 2번에서 받은 답으로 적고, `docs/adr/README.md` 목록에 한 줄을 추가합니다.
- 작업은 최신 `dev`에서 새 브랜치를 만들어 합니다: `git switch dev && git pull`, 그다음 `git switch -c <종류>/<짧은-설명>`(예: `fix/home-copy-typo`, `feat/account-button`).
- PR은 `dev` 브랜치로 엽니다(`gh pr create --base dev`). `main`으로 열지 않습니다. `dev`·`main`에 직접 푸시하지 않습니다.
- PR을 연 뒤 PR 주소를 사용자에게 알려 주고, `gh pr checks <번호>`로 검사 결과를 확인해 그대로 전합니다.
- 사용자는 비개발자일 수 있습니다. 무엇을 바꿨는지 쉬운 말로 설명하고, 화면을 바꿨으면 로컬에서 띄워 사용자가 직접 보게 합니다. 바꾸기 전·후 스크린샷을 PR에 붙입니다.
- 사용자가 부탁하지 않은 파일은 고치지 않습니다.
- PR 제목은 `[어디] 무엇을 했는지`로 씁니다. 예: `[웹] 첫 화면 안내 문구 오타 수정`
- PR 본문은 `.github/pull_request_template.md` 양식을 채웁니다. 쓰는 법은 [CONTRIBUTING.md](CONTRIBUTING.md)의 "PR 쓰는 법"입니다.
  - **배경 (변경 사유)**: 2번에서 받은 변경 사유
  - **할 일**: 이 PR이 끝나면 되어야 하는 것
  - **한 일 (작업 내용)**: 실제로 바꾼 파일과 내용
  - **검증**: 실제로 돌린 검사와 결과(5번). 돌리지 않은 검사는 돌렸다고 쓰지 않습니다.
  - **작업자**: 2번에서 받은 이름과 아이디, 그리고 쓰고 있는 AI 도구 이름
  - 다섯 칸 중 하나라도 비우면 CI(PR 가드레일)가 실패합니다.
- 한 PR에는 한 가지 일만 담습니다.
- 머지, 브랜치 보호 우회(`--admin`), 강제 푸시는 하지 않습니다. 조준형이 확인하고 머지합니다.

## 5. 확인 방법
고친 앱에 맞는 검사를 돌립니다. PR을 열면 CI가 같은 검사를 다시 돌립니다.

```bash
cd apps/web && pnpm install && pnpm test && pnpm build
cd apps/app && pnpm install && pnpm exec tsc --noEmit && pnpm test
```

참여 안내는 [CONTRIBUTING.md](CONTRIBUTING.md)에 있습니다. 답은 한국어로 합니다.
