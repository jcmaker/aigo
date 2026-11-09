"""비밀값 검사 결과를 정리하고, PR이면 댓글을 달거나 고친다 (ADR 0005).

입력(환경 변수)
- REPORT: gitleaks JSON 보고서 경로
- CHANGED_FILES: "상태\t경로" 줄 목록(git diff --name-status). 금지 파일 이름을 본다.
- PR_NUMBER, GITHUB_REPOSITORY, GH_TOKEN: PR 댓글용. PR_NUMBER가 없으면 댓글 없이 결과만 낸다.

비밀값 원문은 어디에도 쓰지 않는다. gitleaks --redact 결과와 파일, 줄, 커밋만 쓴다.
"""
import json
import os
import re
import subprocess
import sys

MARKER = "<!-- aigo-secret-scan -->"
# 올리면 안 되는 파일 이름. .env.example 같은 예시 파일은 괜찮다.
FORBIDDEN = re.compile(r"(^|/)(\.env(\.(?!example$)[^/]+)?|[^/]+\.(keystore|jks|p12|pfx|pem|key)|id_(rsa|ed25519)|signing\.env)$")


def findings(report_path: str) -> list[dict]:
    try:
        with open(report_path) as f:
            return json.load(f) or []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def bad_files(changed: str) -> list[str]:
    out = []
    for line in changed.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2 and not parts[0].startswith("D") and FORBIDDEN.search(parts[-1]):
            out.append(parts[-1])
    return out


def fail_comment(leaks: list[dict], files: list[str]) -> str:
    rows = [f"| `{l.get('File')}` | {l.get('StartLine')} | {l.get('Description') or l.get('RuleID')} | `{(l.get('Commit') or '')[:7]}` |"
            for l in leaks[:30]]
    rows += [f"| `{p}` | - | 올리면 안 되는 파일 | - |" for p in files]
    more = f"\n\n외 {len(leaks) - 30}건이 더 있습니다." if len(leaks) > 30 else ""
    return f"""{MARKER}
## 🚫 비밀값 검사 실패: 아래 항목을 없애 주세요

조준형(@jcmaker)이 비밀키, 비밀번호, `.env` 같은 비밀 파일은 저장소에 올리지 말라고 했습니다.
이 PR에서 비밀값으로 보이는 내용을 찾았습니다. 값 자체는 이 댓글에 적지 않았습니다.

| 파일 | 줄 | 종류 | 커밋 |
|---|---|---|---|
{chr(10).join(rows)}{more}

### 해야 할 일
1. **비밀값을 지워 주세요.** 위 파일의 해당 줄에서 값을 지우거나, 파일 자체를 PR에서 빼 주세요.
2. **커밋 기록에도 남아 있습니다.** 지우는 커밋을 더해도 앞 커밋에 값이 남아서 이 검사는 계속 실패합니다. 이 PR을 닫고, 비밀값이 한 번도 들어가지 않은 새 브랜치로 다시 올려 주세요. 방법을 모르면 이 댓글에 답글로 조준형에게 도움을 요청해 주세요.
3. **진짜 키였다면 이미 공개된 것으로 봐야 합니다.** 저장소가 공개라 누구나 볼 수 있습니다. 그 키를 발급한 곳에서 바로 폐기하고 새로 발급받은 뒤, 조준형에게 알려 주세요.

비밀값이 아닌데 잘못 걸렸다면(예: 공개해도 되는 예시 값) 이 댓글에 답글로 알려 주세요.
"""


PASS_COMMENT = f"""{MARKER}
## ✅ 비밀값 검사 통과

앞에서 찾은 비밀값이 이제 이 PR에 없습니다. 진짜 키였다면 발급한 곳에서 폐기했는지 한 번 더 확인해 주세요.
"""


def gh(*args: str, body: str | None = None) -> str:
    cmd = ["gh", "api", *args]
    if body is not None:
        cmd += ["-f", f"body={body}"]
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def upsert_comment(repo: str, pr: str, body: str | None) -> None:
    """MARKER가 있는 봇 댓글을 고친다. 없으면 새로 단다. body가 None이면 있는 댓글만 '통과'로 바꾼다."""
    comments = json.loads(gh(f"repos/{repo}/issues/{pr}/comments", "--paginate", "--slurp") or "[]")
    flat = [c for page in comments for c in (page if isinstance(page, list) else [page])]
    mine = [c for c in flat if MARKER in (c.get("body") or "")]
    if body is None:
        if mine:
            gh("-X", "PATCH", f"repos/{repo}/issues/comments/{mine[-1]['id']}", body=PASS_COMMENT)
        return
    if mine:
        gh("-X", "PATCH", f"repos/{repo}/issues/comments/{mine[-1]['id']}", body=body)
    else:
        gh("-X", "POST", f"repos/{repo}/issues/{pr}/comments", body=body)


def main() -> int:
    leaks = findings(os.environ.get("REPORT", "report.json"))
    files = bad_files(os.environ.get("CHANGED_FILES", ""))
    for l in leaks:
        print(f"::error file={l.get('File')},line={l.get('StartLine')}::비밀값으로 보이는 내용({l.get('RuleID')}), 커밋 {(l.get('Commit') or '')[:7]}")
    for p in files:
        print(f"::error file={p}::올리면 안 되는 파일입니다")
    pr, repo = os.environ.get("PR_NUMBER"), os.environ.get("GITHUB_REPOSITORY")
    failed = bool(leaks or files)
    if pr and repo:
        upsert_comment(repo, pr, fail_comment(leaks, files) if failed else None)
    print("비밀값 검사 실패" if failed else "비밀값 검사 통과")
    return 1 if failed else 0


def _selftest() -> None:
    changed = "A\tapps/web/.env\nA\tapps/web/.env.example\nM\tapps/app/x.keystore\nD\told/.env.local\nA\tapps/web/.env.local\nA\tREADME.md"
    assert bad_files(changed) == ["apps/web/.env", "apps/app/x.keystore", "apps/web/.env.local"], bad_files(changed)
    c = fail_comment([{"File": "a.ts", "StartLine": 3, "RuleID": "generic-api-key", "Commit": "abcdef123", "Secret": "REDACTED"}], ["apps/web/.env"])
    assert MARKER in c and "`a.ts`" in c and "abcdef1" in c and "REDACTED" not in c


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        _selftest()
        print("selftest ok")
        sys.exit(0)
    sys.exit(main())
