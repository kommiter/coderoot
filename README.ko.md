# coderoot

[English](README.md) | 한국어

![manifest](https://img.shields.io/badge/manifest-v3-blue)
![platform](https://img.shields.io/badge/platform-Chrome%20Extension-4285F4)
![code license](https://img.shields.io/badge/code-MIT-yellow)
![content license](https://img.shields.io/badge/content-CC%20BY--NC--SA%204.0-green)

Codetree를 위한 심화 개념 노트 확장 프로그램입니다.

**기존 설명은 유지하고, 그 아래에 더 깊은 설명을 덧붙입니다.**

[빠른 시작](#빠른-시작) · [콘텐츠 파일](#콘텐츠-파일) · [작성 가이드](#콘텐츠-작성) · [라이선스](#라이선스) · [배포 참고](#배포-참고)

---

## coderoot란?

coderoot는 지원되는 Codetree `introduction` 페이지 하단에 추가 개념 노트를 삽입하는 Chrome Extension입니다.

Codetree의 원래 설명을 교체하지 않습니다. 매칭되는 XML 파일이 있으면 렌더링된 노트를 Codetree footer 영역, 예를 들면 "이 콘텐츠가 도움이 되었나요?" 섹션 바로 앞에 삽입합니다.

프로젝트는 크게 두 부분으로 구성됩니다.

- `extension/` 아래의 Chrome Extension
- `content/` 아래의 XML 개념 노트

`content/`는 확장 패키지에 넣지 않고 GitHub raw URL에서 읽기 때문에 확장 배포 파일을 가볍게 유지할 수 있습니다.

## 빠른 시작

### Step 1: 프로젝트 받기 또는 열기

```bash
git clone https://github.com/kommiter/coderoot.git
cd coderoot
```

이미 로컬에 프로젝트가 있다면:

```bash
cd path/to/coderoot
```

### Step 2: 의존성 설치

```bash
npm install
```

### Step 3: 확장 파일 빌드

```bash
npm run build
```

manifest가 실제로 로드하는 파일이 생성됩니다.

```text
extension/dist/content-script.js
extension/dist/styles.css
```

### Step 4: Chrome에 로드

아래 페이지를 엽니다.

```text
chrome://extensions
```

그다음:

1. `Developer mode`를 켭니다.
2. `Load unpacked`를 누릅니다.
3. 레포 root 또는 `extension/` 폴더를 선택합니다.
4. 지원되는 Codetree `introduction` 페이지를 엽니다.

### Step 5: 로컬 검증

```bash
npm run smoke
```

smoke test는 로컬 HTML fixture를 사용해 삽입 위치, 에디터 동작, footer 앞 삽입, 미지원 페이지 안내를 확인합니다.

## 지원 페이지

coderoot는 현재 아래 URL을 감지합니다.

```text
https://www.codetree.ai/{ko|en}/trails/complete/curated-cards/{slug}/introduction
```

`intro-*` slug만 1:1 기본 개념 페이지로 처리합니다.

`challenge-*`, `test-*` slug는 여러 기본 개념이 accordion 형태로 들어갈 수 있어 정적 안내 문구만 표시합니다.

## 콘텐츠 파일

콘텐츠 파일은 아래 구조를 사용합니다.

```text
content/{codetree-slug}/{content-key}.{site-language}.xml
```

예시:

```text
content/intro-print-two-numbers/cpp.ko.xml
content/intro-test-print-in-variety/cpp.en.xml
content/intro-some-problem/py.ko.xml
content/intro-some-problem/java.en.xml
```

URL/canonical concept는 더 구체적일 수 있지만, 레포 파일명은 짧은 content key를 유지합니다.

| Codetree 선택 언어 | canonical concept | content key |
| --- | --- | --- |
| C++14 | `cpp14` | `cpp` |
| C++20 | `cpp20` | `cpp` |
| Python3 | `python3` | `py` |
| Java | `java` | `java` |
| C | `c` | `c` |
| JavaScript | `javascript` | `javascript` |
| C# | `csharp` | `csharp` |

현재 보고 있는 사이트 언어와 선택된 문제 언어 조합에 해당하는 XML 파일 하나만 있으면 동작합니다. 한국어와 영어 페이지를 모두 지원하려면 `cpp.ko.xml`, `cpp.en.xml`처럼 사이트 언어별 파일을 각각 작성합니다.

## 콘텐츠 명령어

Codetree URL에 대응되는 XML 경로를 확인합니다.

```bash
npm run content:path -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

기본 선택 언어는 `C++14`입니다. 다른 선택 언어의 경로를 계산하려면 명시합니다.

```bash
npm run content:path -- --concept-language Python3 "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

초안 XML을 생성하거나 업데이트합니다.

```bash
npm run content:write -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction" ./draft.xml
```

기존 XML을 읽습니다.

```bash
npm run content:read -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

## 콘텐츠 작성

작성 가이드를 참고하세요.

- [영문 가이드](docs/content-authoring-guide.md)
- [한국어 가이드](docs/content-authoring-guide.ko.md)

각 XML 파일은 하나의 사이트 언어와 하나의 선택 문제 언어에 대한 설명만 담습니다.

루트 엘리먼트는 다음 형태입니다.

```xml
<coderoot version="1" lang="ko">
```

지원 태그는 의도적으로 작게 유지합니다.

- `<p>`
- `<h3>`, `<h4>`
- `<ul>`, `<ol>`, `<li>`
- `<code>`
- `<code-block language="cpp"><![CDATA[...]]></code-block>`
- `<callout tone="summary">...</callout>`
- `<strong>`, `<em>`, `<br>`
- `<link href="https://...">...</link>`

긴 코드 예시는 보통 CDATA로 감싸는 편이 안전합니다.

## 에디터 흐름

XML이 있으면 coderoot는 삽입된 노트 주변에 수정 버튼을 표시합니다.

XML이 없으면 현재 페이지와 언어 조합에 맞는 추가 버튼을 표시합니다.

현재 에디터는 다음을 제공합니다.

- XML syntax highlighting
- 좌측 삽입 위치의 실시간 미리보기
- 미리보기와 에디터의 scope 연결
- 뒤로 가기와 앞으로 가기 버튼
- XML validation
- 저장 전 diff 스타일 확인 모달

현재 저장 플로우는 UI stub입니다. 실제 GitHub write를 연결하려면 GitHub App, OAuth flow, 또는 별도 서버/API가 필요합니다. 공개 Chrome Extension에 GitHub write token을 넣으면 안 됩니다.

## 배포 참고

현재 runtime content URL은 아래 레포를 기준으로 설정되어 있습니다.

```text
https://raw.githubusercontent.com/kommiter/coderoot/main/content/
```

레포 owner, 레포 이름, default branch를 바꾸면 아래 파일도 수정해야 합니다.

```text
extension/src/js/config.js
```

수정 후 다시 빌드합니다.

```bash
npm run build
```

manifest는 빌드된 파일을 읽기 때문에 `extension/dist/`도 커밋해야 합니다.

`node_modules/`는 커밋하지 않습니다.

## 라이선스

이 레포는 소프트웨어와 교육 콘텐츠의 라이선스를 분리합니다.

- 소스 코드, 빌드 스크립트, 테스트, manifest 등 소프트웨어 파일: [MIT License](LICENSE)
- Coderoot가 직접 작성한 XML 콘텐츠와 문서: [CC BY-NC-SA 4.0](CONTENT_LICENSE.md)

Codetree, Branch & Bound, Codetree 웹사이트, 문제 본문, 교육 자료, 로고, 상표와 관련 권리는 각 권리자에게 있습니다.

coderoot는 Codetree 또는 Branch & Bound와 공식적으로 제휴하거나 보증받은 프로젝트가 아닙니다.

## 프로젝트 구조

```text
coderoot/
├── CONTENT_LICENSE.md
├── LICENSE
├── README.md
├── README.ko.md
├── content/
├── docs/
├── extension/
│   ├── dist/
│   ├── src/
│   └── manifest.json
├── manifest.json
├── package.json
├── scripts/
└── test/
```
