# 외부 의존성 확인 결과 (Task 0)

## Railway
- 워크스페이스: Justin Cho's Projects
- 프로젝트: `dashpi` (환경: production)
- 생성한 서비스: Postgres (볼륨 `postgres-volume` 포함)
- Bucket: `uploads` (리전 sjc, S3 호환, virtual-host 방식)

## 업로드 방식 결정: `direct`
presigned PUT URL에 대해 `Origin: https://example.com`으로 확인했다.

| 조건 | 단계 | 상태 | CORS 응답 헤더 |
|------|------|------|----------------|
| Bucket CORS 규칙 없음 | OPTIONS 프리플라이트 | 200 | 없음 |
| Bucket CORS 규칙 없음 | PUT (1MB) | 200 | 없음 |
| `put_bucket_cors` 설정 후 | OPTIONS 프리플라이트 | 200 | Allow-Origin, Allow-Methods, Allow-Headers, Expose-Headers, Max-Age |
| `put_bucket_cors` 설정 후 | PUT (1MB) | 200 | Allow-Origin, Expose-Headers 등 |

- 기본 상태는 CORS 헤더가 없어 브라우저에서 막힌다. `put_bucket_cors`(boto3)가 Railway Bucket에서 동작하며, 설정 후 프리플라이트와 PUT 모두 올바른 헤더를 반환한다.
- 업로드된 객체 크기 1048576바이트 확인, 테스트 객체는 삭제했다.
- 현재 CORS 규칙은 `AllowedOrigins=["*"]`, 메서드 PUT/GET, `ExposeHeaders=["ETag"]`. 배포 도메인이 정해지면 Origin을 그 도메인으로 좁힌다.

## 브라우저 검증 (실제 Chromium)
- 방법: `http://localhost:8765` 정적 페이지에서 headless Chromium(Playwright)으로 `fetch` PUT. 1MB Blob, `Content-Type: video/mp4`, 같은 content type으로 서명한 presigned URL.
- 결과: 응답 상태 200, 콘솔 CORS 오류 없음. `head_object` 크기 1048576바이트 확인 후 테스트 객체 삭제. 결정 `direct` 유지.
- `Access-Control-Allow-Headers`는 `*`이며 `Content-Type`을 포함한다(실제 브라우저의 `Content-Type: video/mp4` PUT이 통과).
- 최종 CORS 규칙: Origin `*`, 메서드 PUT/GET, 헤더 `*`, ExposeHeaders ETag, MaxAge 3000.

## Clerk
보류. 컨트롤러가 사용자에게 `pk_test_`, `sk_test_` 키와 JWT 공개키를 요청 중이다. 로그인 공급자(이메일/비밀번호, Google, Apple, Facebook) 활성화 여부도 확인 후 기록한다.
