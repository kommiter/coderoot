# Coderoot

Coderoot는 Codetree의 `introduction` 탭 하단에 심화 개념을 덧붙이는 Chrome Extension입니다. 기존 Codetree 본문은 교체하지 않고 그대로 유지하며, Coderoot 콘텐츠는 Codetree footer 바로 앞에 삽입합니다.

## 구조

```txt
Coderoot/
  manifest.json      # root에서 Load unpacked 할 때 쓰는 개발용 manifest
  extension/
    manifest.json    # 배포용 Chrome Extension manifest
    dist/            # manifest가 실제로 로드하는 빌드 결과
    src/
      js/            # content script source modules
      styles/        # Tailwind entry + feature CSS
  content/           # GitHub raw로 읽는 문제별 XML 콘텐츠
  docs/              # 콘텐츠 작성 가이드
  scripts/           # build, smoke test, content path/read/write 도구
  test/              # smoke test fixture. 배포 ZIP에는 넣지 않음
```

개발 중에는 root `Coderoot/` 또는 `extension/` 둘 다 `Load unpacked`로 로드할 수 있습니다. 배포 ZIP에는 `extension/` 내부 파일만 포함합니다. `content/`, `docs/`, `scripts/`, `test/`는 공개 레포에서 관리하되 확장 패키지에는 넣지 않습니다.

## 동작 범위

- `https://www.codetree.ai/{ko|en}/trails/complete/curated-cards/{slug}/introduction`만 감지합니다.
- `intro-*` slug만 심화 설명 대상으로 처리합니다.
- `challenge-*`, `test-*` slug는 기본 개념이 여러 개일 수 있어 정적 안내 문구만 표시합니다.
- XML이 있으면 기존 기본 개념 아래, "이 콘텐츠가 도움이 되었나요?" footer 앞에 심화 설명을 삽입합니다.
- XML이 없으면 현재 화면 조합에 맞는 심화 설명 추가 버튼을 표시합니다.
- 에디터는 Codetree 오른쪽 코드 패널 자리에 열리고, XML 하이라이트, 좌측 미리보기, 수정 취소, 저장 전 diff 모달을 제공합니다.

## 콘텐츠 파일명

콘텐츠 파일은 아래 구조를 사용합니다.

```txt
content/{codetree-slug}/{content-key}.{site-language}.xml
```

예시:

```txt
content/intro-print-two-numbers/cpp.ko.xml
content/intro-test-print-in-variety/cpp.en.xml
content/intro-some-problem/py.ko.xml
content/intro-some-problem/java.en.xml
```

`content-key`는 파일 관리를 위한 짧은 언어 key입니다. URL/canonical path에는 선택 언어를 더 자세히 남길 수 있지만, 파일명은 사람이 읽기 쉬운 key를 유지합니다.

| Codetree 선택 언어 | canonical concept | content-key |
| --- | --- | --- |
| C++14 | `cpp14` | `cpp` |
| C++20 | `cpp20` | `cpp` |
| Python3 | `python3` | `py` |
| Java | `java` | `java` |
| C | `c` | `c` |
| JavaScript | `javascript` | `javascript` |
| C# | `csharp` | `csharp` |

즉 C++14 기본값의 한국어 콘텐츠는 `content/intro-print-two-numbers/cpp.ko.xml`입니다. XML 내부의 `<code-block language="cpp">`도 코드 하이라이트용 이름이므로 그대로 `cpp`를 사용합니다.

현재 보고 있는 사이트 언어와 선택된 문제 언어만 지원하려면 XML 파일 하나만 있으면 됩니다. 한국어 페이지와 영어 페이지를 모두 지원하려면 각각 `cpp.ko.xml`, `cpp.en.xml`처럼 사이트 언어별 파일을 둡니다.

## 개발

```bash
npm install
npm run build
```

빌드 결과는 manifest가 실제로 로드하는 아래 파일입니다.

```txt
extension/dist/content-script.js
extension/dist/styles.css
```

Chrome에서 테스트하려면:

1. `chrome://extensions`를 엽니다.
2. `Developer mode`를 켭니다.
3. `Load unpacked`를 누릅니다.
4. 개발 중이면 `/Users/hani/Projects/Coderoot` 또는 `/Users/hani/Projects/Coderoot/extension`을 선택합니다.
5. Codetree의 지원 페이지를 새로고침합니다.

## 콘텐츠 명령어

URL에 대응되는 파일 경로를 확인합니다.

```bash
npm run content:path -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

기본 선택 언어는 `C++14`입니다. 다른 문제 언어의 파일 경로를 계산하려면 명시합니다.

```bash
npm run content:path -- --concept-language Python3 "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

초안 XML을 URL 기준 경로에 생성하거나 업데이트합니다.

```bash
npm run content:write -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction" ./draft.xml
```

이미 작성된 XML을 읽습니다.

```bash
npm run content:read -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

작성 규칙은 기본 영문 가이드 [docs/content-authoring-guide.md](/Users/hani/Projects/Coderoot/docs/content-authoring-guide.md)와 한국어 가이드 [docs/content-authoring-guide.ko.md](/Users/hani/Projects/Coderoot/docs/content-authoring-guide.ko.md)를 참고합니다.

## GitHub 저장 플로우

확장 프로그램에는 GitHub 쓰기 토큰을 넣지 않습니다. 공개 확장에 토큰을 포함하면 누구나 추출할 수 있기 때문입니다.

현재 브라우저 에디터의 저장 플로우는 UI 더미입니다. 실제 PR 생성과 merge까지 연결하려면 별도 GitHub App, OAuth flow, 또는 작은 서버/API가 필요합니다. 콘텐츠 읽기는 GitHub raw URL로 처리합니다.

## 라이선스

이 레포는 코드와 교육 콘텐츠의 라이선스를 분리합니다.

- 소스 코드, 빌드 스크립트, 테스트, manifest 등 소프트웨어 파일: [MIT License](/Users/hani/Projects/Coderoot/LICENSE)
- Coderoot가 직접 작성한 XML 콘텐츠와 문서: [CC BY-NC-SA 4.0](/Users/hani/Projects/Coderoot/CONTENT_LICENSE.md)

Codetree, Branch & Bound, Codetree 웹사이트, 문제 본문, 교육 자료, 로고, 상표와 관련 권리는 각 권리자에게 있습니다. Coderoot는 Codetree 또는 Branch & Bound와 공식적으로 제휴하거나 보증받은 프로젝트가 아닙니다.

## 공개 전 체크리스트

- GitHub 레포는 `kommiter/coderoot` 이름으로 만들거나, 다른 이름을 쓸 경우 [extension/src/js/config.js](/Users/hani/Projects/Coderoot/extension/src/js/config.js)의 GitHub raw/base URL을 먼저 바꿉니다.
- default branch는 `main`으로 둡니다.
- `npm run build` 후 생성된 `extension/dist/`를 포함해 커밋합니다.
- `node_modules/`는 커밋하지 않습니다.
- 공개 레포로 올리기 전에 `npm run smoke`를 통과시킵니다.
- Codetree/Branch & Bound와 공식 제휴가 없다는 점을 README와 배포 설명에 유지합니다.

## 권리 고지 초안

Coderoot의 소스 코드와 Coderoot가 직접 작성한 XML 콘텐츠는 이 레포에서 정한 라이선스를 따릅니다. Codetree, Codetree 로고, Codetree 웹사이트, 문제 본문, 교육 자료, 상표와 관련 권리는 각 권리자에게 있습니다. 이 프로젝트는 Codetree 또는 Branch & Bound와 공식적으로 제휴하거나 보증받은 프로젝트가 아닙니다.

## 검증

```bash
npm run smoke
```

로컬 fixture에서 삽입 위치, footer 앞 삽입, 에디터, diff 모달, 지원하지 않는 slug 안내를 확인합니다.
