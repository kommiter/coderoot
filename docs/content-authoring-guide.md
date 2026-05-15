# Coderoot Content Authoring Guide

Coderoot is a Chrome Extension that appends deeper concept notes to the bottom of Codetree `introduction` tabs without replacing the original lesson. Use this guide when writing new Coderoot XML content with an LLM.

## Scope

Coderoot currently targets only `intro-*` problems. `challenge-*` and `test-*` pages can contain multiple concepts inside accordions, so the extension only shows a static unsupported-page note there.

Files are matched by the Codetree URL slug, the Codetree site language, and the selected problem language shown on the page, such as C++14 or Python3. In this repository, `extension/` is the packaged Chrome Extension area, while the separate `kommiter/coderoot-content` repository stores XML files served through GitHub raw URLs.

For this URL:

```txt
https://www.codetree.ai/en/trails/complete/curated-cards/intro-test-print-in-variety/introduction
```

Coderoot normalizes the page to this canonical path:

```txt
/en/trails/complete/curated-cards/intro-test-print-in-variety/introduction?concept=cpp14
```

Use the CLI to check the matching file path:

```bash
npm run content:path -- "https://www.codetree.ai/en/trails/complete/curated-cards/intro-test-print-in-variety/introduction"
```

Example output:

```txt
canonical: /en/trails/complete/curated-cards/intro-test-print-in-variety/introduction?concept=cpp14
concept language: C++14
path: intro-test-print-in-variety/cpp.en.xml
```

The path format is:

```txt
{url-slug}/{content-key}.{site-language}.xml
```

For example, the Korean C++14 note for `intro-print-two-numbers` is `intro-print-two-numbers/cpp.ko.xml`. The URL/canonical concept can still say `cpp14`, but the repository filename uses a short content key such as `cpp`, `py`, or `java`. The XML code block value `language="cpp"` is also used for syntax highlighting.

Only one file is required for the current site language and selected problem language. To support an English page or a Python3 selection, create a separate XML file for that exact combination.

## Creating and Updating Files

Save a draft XML file, then create or update the URL-matched path:

```bash
npm run content:write -- "https://www.codetree.ai/en/trails/complete/curated-cards/intro-.../introduction" ./draft.xml
npm run content:write -- --concept-language Python3 "https://www.codetree.ai/en/trails/complete/curated-cards/intro-.../introduction" ./draft-python3.xml
```

Read an existing XML file with only the URL:

```bash
npm run content:read -- "https://www.codetree.ai/en/trails/complete/curated-cards/intro-.../introduction"
```

When XML does not exist, the extension shows an `Add advanced note` button. Clicking it opens the Coderoot editor in place of Codetree's right-side code panel and lets the author draft content for the current site language and selected problem language. When XML already exists, the `Edit` button opens the current XML, and the left insertion point becomes a live preview.

When the author saves, Coderoot opens GitHub in a popup and asks the deployed Coderoot API to verify the author through the GitHub App OAuth flow. The backend then creates a temporary branch, commits the matched XML file, opens a pull request, and squash-merges it only when the change is a `{slug}/{key}.{site-language}.xml` content file in `kommiter/coderoot-content`. GitHub App secrets and private keys stay on the backend; the extension stores only a short-lived Coderoot session token.

## Writing Goals

- Do not repeat or replace the original Codetree lesson.
- Add background, underlying principles, common mistakes, and C++14-specific details omitted by the original explanation.
- Start in beginner-friendly language, then go deep enough for advanced learners.
- Keep one selected problem language per XML file. C++14 and Python3 notes must be separate files.
- Do not copy long passages from Codetree. Summarize only the minimum problem context and write original Coderoot explanation.

## XML Format

The root element must be `<coderoot>`. Do not include a slug attribute because the URL already identifies the problem.

`<meta><title>` renders as the main heading of the inserted advanced note. `<meta><badge>` renders as the small supporting label above that heading. Inside the body, use `<h3>` for normal section headings.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<coderoot version="1" lang="en">
  <meta>
    <title>Advanced Note Title</title>
    <badge>C++14 deep dive</badge>
  </meta>
  <content>
    <p>This is a paragraph. Use <code>cout</code> for short inline code.</p>

    <h3>Core idea</h3>
    <p>This is another explanation paragraph.</p>

    <ul>
      <li><code>\n</code>: newline character.</li>
      <li><code>endl</code>: newline plus stream flush.</li>
    </ul>

    <code-block language="cpp"><![CDATA[#include <iostream>
using namespace std;

int main() {
    cout << "hello\n";
    return 0;
}
]]></code-block>

    <callout tone="summary">End with the practical rule the learner should remember.</callout>
  </content>
</coderoot>
```

For Korean pages, use `lang="ko"` and write the note in Korean.

## Supported Tags

- `<p>`: paragraph
- `<h3>`, `<h4>`: body headings. Prefer `<h3>` for most sections.
- `<ul>`, `<ol>`, `<li>`: lists
- `<code>`: short inline code
- `<code-block language="cpp"><![CDATA[...]]></code-block>`: multi-line C++ code
- `<callout tone="summary">...</callout>`: final takeaway or warning
- `<strong>`, `<em>`, `<br>`: short emphasis and line breaks
- `<link href="https://...">...</link>`: external links, only when truly useful

## XML Notes

These characters conflict with XML syntax in normal text:

- `<` becomes `&lt;`
- `>` becomes `&gt;`
- `&` becomes `&amp;`

Wrap long C++ examples in CDATA. Here, `language="cpp"` is a syntax-highlighting hint and intentionally matches the `cpp` content key.

```xml
<code-block language="cpp"><![CDATA[if (a < b && b < c) {
    cout << "ok\n";
}
]]></code-block>
```

Escape `<` and `>` even in short inline code:

```xml
<code>cout &lt;&lt; '\n';</code>
```

## Recommended Structure

1. Summarize the core requirement of the problem in one paragraph.
2. Show the simplest safe C++14 solution.
3. Explain the syntax one level deeper than the original lesson.
4. Point out common judging mistakes.
5. Compare a more general principle or alternative only when it helps.
6. End with a `<callout>` that gives the practical rule to remember.

## Prompt for an LLM

```txt
Write one Coderoot advanced-note XML file for the current language of this Codetree URL.

URL:
{codetree_url}

Requirements:
- Write exactly one XML file for the current site language and selected problem language.
- The root must be <coderoot version="1" lang="ko|en">. Do not include a slug attribute.
- Explain only from the selected problem language perspective. Do not mix other language explanations.
- Do not copy the original Codetree explanation. Add deeper principles and common mistakes.
- Use only <p>, <h3>, <ul>, <li>, <code>, <code-block language="cpp"><![CDATA[...]]></code-block>, and <callout>.
- Escape XML special characters <, >, and &, and wrap long C++ code in CDATA.
- Start in beginner-friendly language, but explain the underlying principles verbosely.
```
