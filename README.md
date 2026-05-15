# coderoot

English | [한국어](README.ko.md)

![manifest](https://img.shields.io/badge/manifest-v3-blue)
![platform](https://img.shields.io/badge/platform-Chrome%20Extension-4285F4)
![code license](https://img.shields.io/badge/code-MIT-yellow)
![content license](https://img.shields.io/badge/content-CC%20BY--NC--SA%204.0-green)

Advanced concept notes for Codetree.

**Keep the original lesson. Add a deeper explanation below it.**

[Quick Start](#quick-start) · [Backend](#backend-deployment) · [Content Files](#content-files) · [Authoring](#authoring-content) · [Licensing](#licensing) · [Publishing](#publishing-notes)

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
extension/dist/background.js
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

## Backend Deployment

The backend is the repository-root `api/` directory. Deploy the repository root to Vercel; the Chrome Extension still lives under `extension/`.

Use two repositories:

- `kommiter/coderoot`: extension, backend source, docs
- `kommiter/coderoot-content`: XML content only

Install the GitHub App only on `kommiter/coderoot-content`. Do not install it on the code/backend repository. GitHub Apps cannot be limited to one folder inside a repository, so repository separation is the real permission boundary.

Vercel settings:

- Root Directory: `.`
- Framework Preset: `Other`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `public`

The repository includes `vercel.json` and `public/index.html` so Vercel has a small static output while serving the API functions under `api/`.

Create a GitHub App before setting environment variables:

1. Open `GitHub Settings > Developer settings > GitHub Apps > New GitHub App`.
2. Homepage URL: your Vercel deployment URL.
3. Callback URL: `https://your-vercel-domain.vercel.app/api/auth/github/callback`.
4. Disable webhook if GitHub asks for a webhook URL.
5. Repository permissions:
   - `Contents`: Read and write
   - `Pull requests`: Read and write
   - `Metadata`: Read-only
6. Create the app, generate a private key, then install the app only on `kommiter/coderoot-content`.

Set these Vercel environment variables:

| Variable | Value |
| --- | --- |
| `GITHUB_APP_ID` | GitHub App settings page > App ID |
| `GITHUB_APP_CLIENT_ID` | GitHub App settings page > Client ID |
| `GITHUB_APP_CLIENT_SECRET` | Generate one under Client secrets |
| `GITHUB_APP_PRIVATE_KEY` | Contents of the downloaded `.pem` private key |
| `GITHUB_APP_INSTALLATION_ID` | Optional; leave empty unless you want to pin one installation |
| `CONTENT_GITHUB_OWNER` | `kommiter` |
| `CONTENT_GITHUB_REPO` | `coderoot-content` |
| `CONTENT_GITHUB_DEFAULT_BRANCH` | `main` |
| `CODEROOT_ALLOWED_GITHUB_LOGINS` | `kommiter` |
| `CODEROOT_PUBLIC_ORIGIN` | `https://www.codetree.ai` |
| `CODEROOT_SESSION_SECRET` | Random 32+ character secret, e.g. `openssl rand -base64 32` |

After deployment succeeds, copy the Vercel URL into `CODEROOT_API_BASE` in `extension/src/js/config.js`, run `npm run build`, and reload the unpacked extension.

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
- GitHub commit history restore dropdown
- GitHub App save flow that creates a branch, commits the XML, opens a pull request, and auto-merges matched `content/**/*.xml` changes

On the first save, coderoot opens GitHub in a popup and asks the deployed Coderoot API to verify the author through a GitHub App OAuth flow. The extension stores only a short-lived Coderoot session token. GitHub App secrets and private keys stay on the backend.

Create a GitHub App for the content repository and install it only on `kommiter/coderoot-content`.

Recommended GitHub App settings:

- Homepage URL: your deployed Coderoot API URL
- User authorization callback URL: `https://your-coderoot-api.example.com/api/auth/github/callback`
- Repository permissions:
  - `Contents`: Read and write
  - `Pull requests`: Read and write
  - `Metadata`: Read-only

Backend environment variables are listed in `.env.example`. At minimum, configure the GitHub App ID, client ID, client secret, private key, repository owner/name, `CODEROOT_SESSION_SECRET`, and `CODEROOT_ALLOWED_GITHUB_LOGINS`.

After deploying the backend, set `CODEROOT_API_BASE` in `extension/src/js/config.js` to that backend URL and run `npm run build`.

The save button runs this workflow:

1. Create a temporary branch from `main`.
2. Create or update the matched XML file.
3. Open a pull request.
4. If the changed file is under `content/` and is an XML content file, squash-merge the pull request.
5. Delete the temporary branch when GitHub allows it.

Only `content/{slug}/{key}.{language}.xml` changes are accepted by the extension save endpoint and attempted for auto-merge. Other repository changes should be made through a normal GitHub pull request and reviewed manually.

If repository rules block direct merging of an eligible content XML change, coderoot keeps the review modal open and shows the GitHub error message.

## Publishing Notes

GitHub Release and Chrome Web Store publishing are separate.

- GitHub Release: distributes a zip that users can download and load manually through `chrome://extensions`.
- Chrome Web Store: distributes the extension through Chrome's normal install/update flow and requires a store listing and review.
- GitHub Packages: not needed for this project unless coderoot later becomes an npm package or container image.

Create a local release zip:

```bash
npm run package
```

The zip is written to `release/` and contains only the Chrome Extension runtime files with `manifest.json` at the zip root.

Create a GitHub Release by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Release` GitHub Actions workflow builds the extension, packages `extension/`, uploads the zip as a workflow artifact, and attaches it to the GitHub Release for tag pushes.

The runtime content URL is currently configured for:

```text
https://raw.githubusercontent.com/kommiter/coderoot-content/main/content/
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
