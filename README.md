# 밭갈이 리허설 피드백

인하지구 지구모임(2026-10-05) 발표 피드백 페이지. 참석자는 휴대폰으로 주제 10개에 피드백을 쓰고, 관리자는 `#admin`에서 조별로 모아 본다.

- 참석자: https://inhadissolve.github.io/inha-feedback/
- 관리자: https://inhadissolve.github.io/inha-feedback/#admin

## 서버(Apps Script) 설정

1. 구글 드라이브에서 새 구글 시트를 만든다(이름 예: 밭갈이 리허설 피드백).
2. 메뉴 **확장 프로그램 > Apps Script**를 연다.
3. 기본 `Code.gs` 내용을 지우고 이 저장소의 `apps-script/Code.gs` 전체를 붙여넣은 뒤 저장(Ctrl+S).
4. 왼쪽 톱니바퀴 **프로젝트 설정 > 스크립트 속성 > 스크립트 속성 추가**: 속성 `ADMIN_PIN`, 값은 6자리 이상 숫자. 저장.
5. 편집기로 돌아와 위쪽 함수 목록에서 `setup`을 고르고 **실행**. 권한 검토 > 계정 선택 > "Google에서 확인하지 않은 앱" 화면에서 **고급 > (프로젝트 이름)(으)로 이동 > 허용**.
6. 시트에 `topics`(주제 10개)와 `feedback` 탭이 생겼는지 확인한다.
7. 오른쪽 위 **배포 > 새 배포 > 유형 선택(톱니) > 웹 앱**. 다음 사용자 인증 정보로 실행: **나**, 액세스 권한이 있는 사용자: **모든 사용자** > 배포.
8. 나온 웹 앱 URL(`https://script.google.com/macros/s/.../exec`)을 `config.js`의 `window.API_URL`에 넣는다.

`Code.gs`를 고친 뒤에는 **배포 > 배포 관리 > 연필 > 버전: 새 버전 > 배포**를 해야 반영된다(주소는 그대로).

## 로컬 확인

- 테스트: `node --test`
- 가짜 서버로 화면 보기: `node tests/mock-server.mjs` 후 http://localhost:8787 (관리자 비밀번호는 `tests/mock-server.mjs` 참고)

## 행사 후

- 원본은 구글 시트 `feedback` 탭에 남는다(기기마다 여러 줄. 관리자 화면은 기기별 최신 줄만 보여 준다).
- **배포 > 배포 관리 > 보관**으로 서버를 끈다.
