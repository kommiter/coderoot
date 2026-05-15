# coderoot

English | [한국어](README.ko.md)

![manifest](https://img.shields.io/badge/manifest-v3-blue)
![platform](https://img.shields.io/badge/platform-Chrome%20Extension-4285F4)
![code license](https://img.shields.io/badge/code-MIT-yellow)
![content license](https://img.shields.io/badge/content-CC%20BY--NC--SA%204.0-green)

Advanced concept notes for Codetree.

**Keep the original lesson. Add a deeper explanation below it.**

[Quick Start](#quick-start) · [Content Files](#content-files) · [Authoring](#authoring-content) · [Licensing](#licensing) · [Publishing](#publishing-notes)

---

## What Is coderoot?

coderoot is a Chrome Extension that appends additional concept notes to supported Codetree `introduction` pages.

It does not replace Codetree's original lesson. When a matching XML file exists, coderoot inserts the rendered note right before Codetree's footer area, such as the "Was this content helpful?" section.

The project is built around two pieces:

- a Chrome Extension under `extension/`
- XML concept notes under `content/`

The extension package stays small because `content/` is loaded from GitHub raw URLs instead of being bundled into the extension.

## Quick Start

### Step 1: Clone or open the project

```bash
git clone https://github.com/kommiter/coderoot.git
cd coderoot
```

If you already have the project locally:

```bash
cd path/to/coderoot
```

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Build the extension assets

```bash
npm run build
```

This creates the files loaded by the manifests:

```text
extension/dist/content-script.js
extension/dist/styles.css
```

### Step 4: Load in Chrome

Open:

```text
chrome://extensions
```

Then:

1. Turn on `Developer mode`.
2. Click `Load unpacked`.
3. Select either the repository root or the `extension/` folder.
4. Open a supported Codetree `introduction` page.

### Step 5: Verify locally

```bash
npm run smoke
```

The smoke test uses local HTML fixtures and checks insertion, editor behavior, footer placement, and unsupported-page handling.

## Supported Pages

coderoot currently targets:

```text
https://www.codetree.ai/{ko|en}/trails/complete/curated-cards/{slug}/introduction
```

Only `intro-*` slugs are treated as one-to-one concept pages.

`challenge-*` and `test-*` slugs may contain multiple base concepts in accordion layouts, so coderoot only shows a static coverage note for those pages.

## Content Files

Content files use this path shape:

```text
content/{codetree-slug}/{content-key}.{site-language}.xml
```

Examples:

```text
content/intro-print-two-numbers/cpp.ko.xml
content/intro-test-print-in-variety/cpp.en.xml
content/intro-some-problem/py.ko.xml
content/intro-some-problem/java.en.xml
```

The URL/canonical concept can be more specific, while the repository filename keeps a short content key.

| Codetree selection | canonical concept | content key |
| --- | --- | --- |
| C++14 | `cpp14` | `cpp` |
| C++20 | `cpp20` | `cpp` |
| Python3 | `python3` | `py` |
| Java | `java` | `java` |
| C | `c` | `c` |
| JavaScript | `javascript` | `javascript` |
| C# | `csharp` | `csharp` |

Only one file is required for the exact site language and selected problem language currently being viewed. To support both Korean and English pages, create both language files, such as `cpp.ko.xml` and `cpp.en.xml`.

## Content Commands

Check the XML path for a Codetree URL:

```bash
npm run content:path -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

The default selected problem language is `C++14`. To calculate a path for another selected language:

```bash
npm run content:path -- --concept-language Python3 "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

Create or update XML from a draft file:

```bash
npm run content:write -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction" ./draft.xml
```

Read existing XML:

```bash
npm run content:read -- "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-print-two-numbers/introduction"
```

## Authoring Content

Use the authoring guides:

- [English guide](docs/content-authoring-guide.md)
- [Korean guide](docs/content-authoring-guide.ko.md)

Each XML file should contain one explanation for one site language and one selected problem language.

The root element is:

```xml
<coderoot version="1" lang="ko">
```

Use a small set of supported tags:

- `<p>`
- `<h3>`, `<h4>`
- `<ul>`, `<ol>`, `<li>`
- `<code>`
- `<code-block language="cpp"><![CDATA[...]]></code-block>`
- `<callout tone="summary">...</callout>`
- `<strong>`, `<em>`, `<br>`
- `<link href="https://...">...</link>`

Long code examples should usually be wrapped in CDATA.

## Editor Flow

When XML exists, coderoot shows an edit button near the inserted note.

When XML is missing, coderoot shows an add button for the current page/language combination.

The editor currently provides:

- XML syntax highlighting
- live preview in the left insertion area
- preview/editor scope linking
- undo and redo buttons
- XML validation
- save-review modal with a diff-style view

The current save flow is a UI stub. Direct GitHub write support would require a GitHub App, OAuth flow, or a separate server/API. A public Chrome Extension should not embed a GitHub write token.

## Publishing Notes

The runtime content URL is currently configured for:

```text
https://raw.githubusercontent.com/kommiter/coderoot/main/content/
```

If the repository owner, repository name, or default branch changes, update:

```text
extension/src/js/config.js
```

Then rebuild:

```bash
npm run build
```

Commit `extension/dist/` because the manifests load the built files.

Do not commit `node_modules/`.

## Licensing

This repository separates software and educational content licensing.

- Source code, build scripts, tests, manifests, and other software files: [MIT License](LICENSE)
- Coderoot-authored XML content and documentation: [CC BY-NC-SA 4.0](CONTENT_LICENSE.md)

Codetree, Branch & Bound, the Codetree website, problem statements, educational materials, logos, trademarks, and related assets remain with their respective owners.

coderoot is not officially affiliated with, endorsed by, or sponsored by Codetree or Branch & Bound.

## Project Shape

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
