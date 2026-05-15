# coderoot

[English](README.md) | 한국어

![manifest](https://img.shields.io/badge/manifest-v3-blue)
![platform](https://img.shields.io/badge/platform-Chrome%20Extension-4285F4)
![code license](https://img.shields.io/badge/code-MIT-yellow)
![content license](https://img.shields.io/badge/content-CC%20BY--NC--SA%204.0-green)

Codetree를 위한 심화 개념 노트 확장 프로그램입니다.

**기존 설명은 유지하고, 그 아래에 더 깊은 설명을 덧붙입니다.**

[설치](#codetree-사용자-설치) · [개발](#개발-빠른-시작) · [백엔드 배포](#백엔드-배포) · [콘텐츠 파일](#콘텐츠-파일) · [작성 가이드](#콘텐츠-작성) · [라이선스](#라이선스) · [배포 참고](#배포-참고)

---

## coderoot란?

coderoot는 지원되는 Codetree `introduction` 페이지 하단에 추가 개념 노트를 삽입하는 Chrome Extension입니다.

Codetree의 원래 설명을 교체하지 않습니다. 매칭되는 XML 파일이 있으면 렌더링된 노트를 Codetree footer 영역, 예를 들면 "이 콘텐츠가 도움이 되었나요?" 섹션 바로 앞에 삽입합니다.

프로젝트는 크게 세 부분으로 구성됩니다.

- `extension/` 아래의 Chrome Extension
- `api/` 아래의 작은 GitHub App 백엔드
- 별도 `kommiter/coderoot-content` 저장소의 XML 개념 노트

XML 콘텐츠는 확장 패키지에 넣지 않고 GitHub raw URL에서 읽기 때문에 확장 배포 파일을 가볍게 유지할 수 있습니다.

## Codetree 사용자 설치

대부분의 사용자는 이 저장소를 clone할 필요가 없습니다.

| 목적 | 사용하면 되는 것 |
| --- | --- |
| Codetree에서 Coderoot 사용 | Chrome Web Store 심사가 끝나면 스토어 항목으로 설치하거나, 최신 GitHub Release zip을 받습니다. |
| 현재 릴리스를 수동 테스트 | [GitHub Releases](https://github.com/kommiter/coderoot/releases)에서 `coderoot-vX.Y.Z.zip`을 받습니다. |
| 확장/백엔드 코드 수정 | 이 `kommiter/coderoot` 저장소를 clone합니다. |
| XML 노트 작성 또는 리뷰 | Codetree 페이지 안의 Coderoot 에디터를 쓰거나, `kommiter/coderoot-content`에서 작업합니다. |

GitHub Release zip으로 수동 설치하는 방법:

1. [GitHub Releases](https://github.com/kommiter/coderoot/releases)를 엽니다.
2. 최신 `coderoot-vX.Y.Z.zip` asset을 다운로드합니다.
3. zip을 압축 해제합니다.
4. `chrome://extensions`를 엽니다.
5. `Developer mode`를 켭니다.
6. `Load unpacked`를 누릅니다.
7. 압축 해제한 폴더 중 최상단에 `manifest.json`이 있는 폴더를 선택합니다.
8. 지원되는 Codetree `introduction` 페이지를 엽니다.

`coderoot-content` 저장소를 Chrome Extension으로 선택하면 안 됩니다. 그 저장소는 XML 노트만 담습니다.

일반 설치 목적이라면 GitHub의 초록색 `Code > Download ZIP` 버튼도 피하세요. 그 버튼은 개발용 전체 소스 트리를 받습니다. Chrome에 수동 설치하려면 Release asset인 `coderoot-vX.Y.Z.zip`을 받아야 합니다.

## 개발 빠른 시작

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
extension/dist/background.js
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

## 백엔드 배포

백엔드는 레포 root의 `api/` 디렉터리입니다. Vercel에는 레포 root를 배포하고, Chrome Extension은 계속 `extension/` 아래에 둡니다.

레포는 두 개로 나눕니다.

- `kommiter/coderoot`: 확장, 백엔드 코드, 문서
- `kommiter/coderoot-content`: XML 콘텐츠 전용

GitHub App은 `kommiter/coderoot-content`에만 설치하세요. 코드/백엔드 레포에는 설치하지 않습니다. GitHub App은 한 레포 안의 특정 폴더로만 권한을 제한할 수 없어서, 레포 분리가 실제 권한 경계입니다.

Vercel 설정:

- Root Directory: `.`
- Framework Preset: `Other`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `public`

이 레포에는 `vercel.json`과 `public/index.html`이 들어 있습니다. 그래서 Vercel은 작은 정적 출력물을 찾을 수 있고, 동시에 `api/` 아래 serverless API를 배포합니다.

환경변수를 넣기 전에 GitHub App을 먼저 만드세요.

1. `GitHub Settings > Developer settings > GitHub Apps > New GitHub App`을 엽니다.
2. Homepage URL: Vercel 배포 URL
3. Callback URL: `https://your-vercel-domain.vercel.app/api/auth/github/callback`
4. Webhook URL을 요구하면 webhook은 비활성화합니다.
5. Repository permissions:
   - `Contents`: Read and write
   - `Pull requests`: Read and write
   - `Metadata`: Read-only
6. App을 만든 뒤 private key를 생성하고, `kommiter/coderoot-content` 저장소에만 App을 설치합니다.

Vercel에는 아래 환경변수를 넣습니다.

| 변수 | 값 |
| --- | --- |
| `GITHUB_APP_ID` | GitHub App settings page > App ID |
| `GITHUB_APP_CLIENT_ID` | GitHub App settings page > Client ID |
| `GITHUB_APP_CLIENT_SECRET` | Client secrets에서 새로 생성 |
| `GITHUB_APP_PRIVATE_KEY` | 다운로드한 `.pem` private key 전체 내용 |
| `GITHUB_APP_INSTALLATION_ID` | 선택값. 특정 installation을 고정하고 싶을 때만 입력 |
| `CONTENT_GITHUB_OWNER` | `kommiter` |
| `CONTENT_GITHUB_REPO` | `coderoot-content` |
| `CONTENT_GITHUB_DEFAULT_BRANCH` | `main` |
| `CODEROOT_ALLOWED_GITHUB_LOGINS` | `kommiter` |
| `CODEROOT_PUBLIC_ORIGIN` | `https://www.codetree.ai` |
| `CODEROOT_SESSION_SECRET` | 32자 이상 랜덤 문자열. 예: `openssl rand -base64 32` |

배포가 성공하면 Vercel URL을 `extension/src/js/config.js`의 `CODEROOT_API_BASE`에 넣고, `npm run build`를 실행한 뒤 unpacked extension을 다시 로드합니다.

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
{codetree-slug}/{content-key}.{site-language}.xml
```

예시:

```text
intro-print-two-numbers/cpp.ko.xml
intro-test-print-in-variety/cpp.en.xml
intro-some-problem/py.ko.xml
intro-some-problem/java.en.xml
```

URL/canonical concept는 더 구체적일 수 있지만, 레포 파일명은 짧은 content key를 유지합니다.

| Codetree 선택 언어 | canonical concept | content key |
| --- | --- | --- |
| C++14 | `cpp14` | `cpp` |
| Python3 | `python3` | `py` |
| Java | `java` | `java` |
| C | `c` | `c` |
| JavaScript | `javascript` | `javascript` |
| C# | `csharp` | `csharp` |

현재 보고 있는 사이트 언어와 선택된 문제 언어 조합에 해당하는 XML 파일 하나만 있으면 동작합니다. 한국어와 영어 페이지를 모두 지원하려면 `cpp.ko.xml`, `cpp.en.xml`처럼 사이트 언어별 파일을 각각 작성합니다.

## 콘텐츠 명령어

이 명령어들은 로컬 작성용 helper입니다. `content:path`는 이 저장소 어디서든 실행해도 됩니다. `content:read`, `content:write`는 `--content-root` 또는 `CODEROOT_CONTENT_DIR`로 로컬에 clone한 `kommiter/coderoot-content` 경로를 지정해서 사용하세요.

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
npm run content:write -- --content-root ../coderoot-content "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction" ./draft.xml
```

기존 XML을 읽습니다.

```bash
npm run content:read -- --content-root ../coderoot-content "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
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
- GitHub commit history 기반 되돌리기 드롭다운
- 브랜치 생성, XML 커밋, Pull Request 생성, 매칭되는 XML 콘텐츠 변경 자동 merge까지 이어지는 GitHub App 저장 흐름

처음 저장할 때 coderoot는 GitHub 팝업을 열고, 배포된 Coderoot API가 GitHub App OAuth flow로 작성자를 확인합니다. 확장 프로그램에는 짧게 유지되는 Coderoot session token만 저장합니다. GitHub App secret과 private key는 백엔드에만 둡니다.

`kommiter/coderoot-content` 콘텐츠 저장소용 GitHub App을 만들고 해당 저장소에만 설치하세요.

권장 GitHub App 설정:

- Homepage URL: 배포한 Coderoot API URL
- User authorization callback URL: `https://your-coderoot-api.example.com/api/auth/github/callback`
- Repository permissions:
  - `Contents`: Read and write
  - `Pull requests`: Read and write
  - `Metadata`: Read-only

백엔드 환경변수는 `.env.example`에 정리해두었습니다. 최소한 GitHub App ID, client ID, client secret, private key, repository owner/name, `CODEROOT_SESSION_SECRET`, `CODEROOT_ALLOWED_GITHUB_LOGINS`를 설정해야 합니다.

백엔드 배포가 끝나면 `extension/src/js/config.js`의 `CODEROOT_API_BASE`를 배포 URL로 바꾸고 `npm run build`를 실행하세요.

저장 버튼은 아래 흐름을 실행합니다.

1. `main`에서 임시 브랜치를 생성합니다.
2. 현재 URL과 언어에 매칭되는 XML 파일을 생성하거나 업데이트합니다.
3. Pull Request를 생성합니다.
4. 변경 파일이 `{slug}/{key}.{language}.xml` 형식이면 Pull Request를 squash merge합니다.
5. GitHub가 허용하면 임시 브랜치를 삭제합니다.

확장 프로그램의 저장 API는 `{slug}/{key}.{language}.xml` 변경만 받고 자동 merge를 시도합니다. 그 외 저장소 변경은 일반 GitHub Pull Request로 열고 수동 심사를 받는 흐름으로 다룹니다.

저장소 규칙 때문에 자동 merge 대상 콘텐츠 XML도 바로 merge할 수 없으면 review modal을 닫지 않고 GitHub 오류 메시지를 표시합니다.

## 배포 참고

GitHub Release와 Chrome Web Store 게재는 별개입니다.

- GitHub Release: 사용자가 zip을 내려받아 `chrome://extensions`에서 수동으로 로드할 수 있게 배포합니다.
- Chrome Web Store: Chrome의 일반 설치/업데이트 흐름으로 배포하며 스토어 등록, 설명, 심사 과정이 필요합니다.
- GitHub Packages: coderoot를 npm 패키지나 container image로 배포할 계획이 없다면 지금은 필요하지 않습니다.

로컬에서 release zip을 만듭니다.

```bash
npm run package
```

zip은 `release/`에 생성되며, zip root에 `manifest.json`이 있는 Chrome Extension 런타임 파일만 포함합니다.

GitHub Release는 version tag를 push하면 생성됩니다.

```bash
git tag v0.1.0
git push origin v0.1.0
```

`Release` GitHub Actions workflow가 extension을 빌드하고, `extension/`을 zip으로 묶고, workflow artifact로 업로드한 뒤 tag push일 때 GitHub Release asset으로 붙입니다.

현재 runtime content URL은 아래 레포를 기준으로 설정되어 있습니다.

```text
https://raw.githubusercontent.com/kommiter/coderoot-content/main/
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
├── api/
├── docs/
├── extension/
│   ├── dist/
│   ├── src/
│   └── manifest.json
├── manifest.json
├── package.json
├── public/
├── scripts/
└── test/
```
