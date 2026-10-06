# 발표 피드백 (송도지구)

송도지구 지구모임(2026-10-05) 발표 피드백 페이지. 참석자는 휴대폰으로 1~4조 발표에 피드백을 쓰고, 관리자는 `#admin`에서 주제·발표자를 넣고 조별로 모아 본다.

- 참석자: https://inhadissolve.github.io/songdo-feedback/
- 관리자: https://inhadissolve.github.io/songdo-feedback/#admin
- 조별 공개 링크: `https://inhadissolve.github.io/songdo-feedback/feedback.html?group=1` (1~4는 관리자 화면의 조 순서)

관리자는 원본 피드백의 **공개 피드백에 포함**을 체크한 뒤 **공유용 보기**에서 선택한 항목만 확인한다. **이미지로 저장**은 공유창 없이 PNG를 다운로드한다. **선택한 피드백 파일 저장**은 해당 조의 선택 내용만 저장하고, **조별 공개 링크 복사**는 그 조의 링크를 복사한다. 새로고침하면 선택은 초기화된다.

전달받은 선별 파일을 해당 조의 `published-feedback/group-1.json` 등에 반영하고 배포하면 공개 페이지에 나타난다. 선별 전 파일은 비어 있다. 작성자 이름을 포함하며 이름이 비었으면 익명으로 표시한다. 이후 응답은 자동 반영되지 않는다. 조별 링크는 화면을 나누는 용도이며 접근 권한을 제한하지 않는다.

## 서버(Apps Script) 설정

1. 구글 드라이브에서 새 구글 시트를 만든다(이름 예: 송도지구 발표 피드백).
2. 메뉴 **확장 프로그램 > Apps Script**를 연다.
3. 기본 `Code.gs` 내용을 지우고 이 저장소의 `apps-script/Code.gs` 전체를 붙여넣은 뒤 저장(Ctrl+S).
4. 왼쪽 톱니바퀴 **프로젝트 설정 > 스크립트 속성 > 스크립트 속성 추가**: 속성 `ADMIN_PIN`, 값은 6자리 이상 숫자. 저장.
5. 편집기로 돌아와 위쪽 함수 목록에서 `setup`을 고르고 **실행**. 권한 검토 > 계정 선택 > "Google에서 확인하지 않은 앱" 화면에서 **고급 > (프로젝트 이름)(으)로 이동 > 허용**.
6. 시트에 `topics`(1~4조)와 `feedback` 탭이 생겼는지 확인한다.
7. 오른쪽 위 **배포 > 새 배포 > 유형 선택(톱니) > 웹 앱**. 다음 사용자 인증 정보로 실행: **나**, 액세스 권한이 있는 사용자: **모든 사용자** > 배포.
8. 나온 웹 앱 URL(`https://script.google.com/macros/s/.../exec`)을 `config.js`의 `window.API_URL`에 넣는다.

`Code.gs`를 고친 뒤에는 **배포 > 배포 관리 > 연필 > 버전: 새 버전 > 배포**를 해야 반영된다(주소는 그대로).

## 로컬 확인

- 테스트: `node --test`
- 가짜 서버로 화면 보기: `node tests/mock-server.mjs` 후 http://localhost:8787 (관리자 비밀번호는 `tests/mock-server.mjs` 참고)

## 행사 후

- 원본은 구글 시트 `feedback` 탭에 남는다(기기마다 여러 줄. 관리자 화면은 기기별 최신 줄만 보여 준다).
- **배포 > 배포 관리 > 보관**으로 서버를 끈다.

## 다른 모임용으로 복사할 때 바꿀 곳

- `apps-script/Code.gs`의 `TOPICS`와 `logic.js`의 `DEFAULT_TOPICS` (둘이 같아야 한다. `node --test`가 확인)
- `app.js`의 `STORE` (같은 github.io 주소의 다른 사이트와 저장값이 섞이지 않게)
- `index.html` 머리말(모임 이름, 날짜), `config.js`의 서버 주소, `qr.png`
