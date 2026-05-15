# Coderoot Content Authoring Guide

Coderoot는 Codetree의 기존 설명을 대체하지 않고, `introduction` 탭 하단에 심화 설명을 덧붙이는 Chrome Extension입니다. 이 문서는 LLM과 함께 새 문제의 심화 콘텐츠를 작성할 때 쓰는 가이드입니다.

## 지원 범위

Coderoot는 현재 `intro-*` 문제만 심화 콘텐츠 대상으로 봅니다. `challenge-*`, `test-*`는 여러 기본 개념이 accordion으로 들어갈 수 있어 정적 안내 문구만 표시합니다.

파일 매칭은 URL의 문제 slug, Codetree 사이트 언어, 화면에서 선택된 문제 언어(C++14, Python3 등)를 조합해 사람이 읽을 수 있는 경로로 관리합니다. 이 레포에서 `extension/`은 배포 대상이고, `content/`는 GitHub raw로 읽는 원격 콘텐츠 영역입니다.

예를 들어 아래 URL은:

```txt
https://www.codetree.ai/ko/trails/complete/curated-cards/intro-test-print-in-variety/introduction
```

아래 canonical path로 정규화됩니다.

```txt
/ko/trails/complete/curated-cards/intro-test-print-in-variety/introduction?concept=cpp14
```

파일 경로는 CLI로 확인합니다.

```bash
npm run content:path -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-test-print-in-variety/introduction"
```

출력 예시는 다음과 같습니다.

```txt
canonical: /ko/trails/complete/curated-cards/intro-test-print-in-variety/introduction?concept=cpp14
concept language: C++14
path: content/intro-test-print-in-variety/cpp.ko.xml
```

경로 형식은 다음과 같습니다.

```txt
content/{url-slug}/{content-key}.{site-language}.xml
```

예를 들어 `intro-print-two-numbers`의 한국어 C++14 설명은 `content/intro-print-two-numbers/cpp.ko.xml`입니다. URL/canonical concept에는 `cpp14`처럼 선택 언어를 자세히 남기지만, 레포의 파일명은 `cpp`, `py`, `java`처럼 짧은 content key를 유지합니다. XML 내부 코드 블록의 `language="cpp"`도 syntax highlighting용 이름이라 그대로 사용합니다.

현재 사이트 언어와 현재 선택된 문제 언어의 파일 하나만 있으면 해당 화면에서 동작합니다. 영어 페이지나 Python3 선택 상태까지 지원하려면 URL 또는 `--concept-language`를 바꿔 별도 XML 파일을 작성합니다.

## 파일 생성과 수정

초안을 파일로 저장한 뒤 URL 기준 경로에 생성/업데이트합니다.

```bash
npm run content:write -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-.../introduction" ./draft.xml
npm run content:write -- --concept-language Python3 "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-.../introduction" ./draft-python3.xml
```

이미 작성된 XML을 읽을 때도 URL만 사용합니다.

```bash
npm run content:read -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-.../introduction"
```

확장 프로그램 안에서는 XML이 없으면 `심화 설명 추가하기` 버튼을 표시합니다. 이 버튼을 누르면 Codetree 오른쪽 코드 패널 자리에 Coderoot 에디터가 열리고, 현재 사이트 언어와 선택된 문제 언어의 초안을 만들 수 있습니다. 이미 파일이 있으면 `수정하기` 버튼으로 기존 XML을 열 수 있고, 왼쪽 삽입 위치에는 미리보기가 표시됩니다.

작성자가 저장하면 Coderoot는 GitHub 팝업을 열고, 배포된 Coderoot API가 GitHub App OAuth flow로 작성자를 확인합니다. 이후 백엔드가 임시 브랜치를 만들고, 매칭되는 XML 파일을 커밋하고, Pull Request를 생성한 뒤 변경 파일이 `content/{slug}/{key}.{site-language}.xml` 콘텐츠 파일일 때만 squash merge합니다. GitHub App secret과 private key는 백엔드에만 두며, 확장 프로그램에는 짧게 유지되는 Coderoot session token만 저장합니다.

## 작성 목적

- 기존 Codetree 본문을 반복하거나 대체하지 않습니다.
- 기존 설명에서 생략된 배경, 원리, 흔한 실수, C++14 관점의 세부 동작을 보강합니다.
- 초보자가 읽을 수 있는 문장으로 시작하되, 심화 학습자가 만족할 만큼 원리의 원리까지 내려갑니다.
- 한 XML에는 하나의 문제 언어 설명만 작성합니다. C++14와 Python3처럼 Codetree 선택 언어가 다르면 파일도 분리합니다.
- Codetree 원문을 길게 복사하지 않습니다. 필요한 문제 맥락은 짧게 요약하고, Coderoot 고유의 설명을 작성합니다.

## XML 형식

루트는 반드시 `<coderoot>`입니다. URL이 이미 언어와 문제를 식별하므로 XML 루트에는 slug를 적지 않습니다.

`<meta><title>`은 삽입된 심화 설명의 큰 제목으로 렌더링됩니다. `<meta><badge>`는 제목 위의 작은 보조 문구로 쓰입니다. 본문 안에서는 보통 `<h3>`으로 소제목을 만듭니다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<coderoot version="1" lang="ko">
  <meta>
    <title>심화 설명 제목</title>
    <badge>C++14 심화 노트</badge>
  </meta>
  <content>
    <p>문단입니다. <code>cout</code> 같은 짧은 코드는 inline code로 감쌉니다.</p>

    <h3>소제목</h3>
    <p>설명 문단입니다.</p>

    <ul>
      <li><code>\n</code>: 줄바꿈 문자입니다.</li>
      <li><code>endl</code>: 줄바꿈 후 flush까지 합니다.</li>
    </ul>

    <code-block language="cpp"><![CDATA[#include <iostream>
using namespace std;

int main() {
    cout << "hello\n";
    return 0;
}
]]></code-block>

    <callout tone="summary">핵심 정리 문장입니다.</callout>
  </content>
</coderoot>
```

영어 URL에 대응되는 파일은 `lang="en"`을 사용합니다.

```xml
<coderoot version="1" lang="en">
  <meta>
    <title>Advanced Note Title</title>
    <badge>C++14 deep dive</badge>
  </meta>
  <content>
    <p>Write the English version here.</p>
  </content>
</coderoot>
```

## 지원 태그

- `<p>`: 문단
- `<h3>`, `<h4>`: 본문 소제목. 보통 `<h3>`을 사용합니다.
- `<ul>`, `<ol>`, `<li>`: 목록
- `<code>`: 문장 안의 짧은 코드
- `<code-block language="cpp"><![CDATA[...]]></code-block>`: 여러 줄 C++ 코드
- `<callout tone="summary">...</callout>`: 마지막 핵심 정리 또는 주의점
- `<strong>`, `<em>`, `<br>`: 짧은 강조와 줄바꿈
- `<link href="https://...">...</link>`: 외부 링크. 꼭 필요할 때만 사용합니다.

## XML 주의사항

일반 텍스트에서 아래 문자는 XML 문법과 충돌합니다.

- `<`는 `&lt;`
- `>`는 `&gt;`
- `&`는 `&amp;`

긴 C++ 코드는 항상 CDATA로 감싸는 편이 안전합니다. 여기서 `language="cpp"`는 syntax highlighting 힌트이며, `cpp` content key와 의도적으로 같은 이름을 사용합니다.

```xml
<code-block language="cpp"><![CDATA[if (a < b && b < c) {
    cout << "ok\n";
}
]]></code-block>
```

짧은 inline code에서도 `<`와 `>`는 escape합니다.

```xml
<code>cout &lt;&lt; '\n';</code>
```

## 권장 구성

1. 이 문제가 요구하는 핵심을 한 문단으로 요약합니다.
2. 가장 단순하고 안전한 C++14 풀이를 보여줍니다.
3. 풀이에 등장하는 문법을 표면 설명에서 한 단계 더 내려가 설명합니다.
4. 채점에서 자주 틀리는 포인트를 짚습니다.
5. 더 일반적인 원리나 대안 풀이가 있으면 비교합니다.
6. 마지막 `<callout>`에서 실전 판단 기준을 정리합니다.

## LLM에게 줄 수 있는 프롬프트

```txt
아래 Codetree URL의 현재 언어에 맞는 Coderoot용 심화 설명 XML을 작성해 주세요.

URL:
{codetree_url}

조건:
- 현재 URL의 사이트 언어와 현재 선택된 문제 언어에 해당하는 XML 한 개만 작성합니다.
- 루트는 <coderoot version="1" lang="ko|en">입니다. slug 속성은 넣지 않습니다.
- 현재 선택된 문제 언어 기준으로만 설명합니다. 다른 언어 설명을 섞지 않습니다.
- 기존 Codetree 설명을 복사하지 말고, 심화 원리와 흔한 실수를 보강합니다.
- <p>, <h3>, <ul>, <li>, <code>, <code-block language="cpp"><![CDATA[...]]></code-block>, <callout>만 사용합니다.
- XML 특수문자 <, >, &는 escape하고, 긴 C++ 코드는 CDATA로 감쌉니다.
- 초보자가 읽을 수 있게 시작하되, 원리의 원리까지 verbose하게 설명합니다.
```
