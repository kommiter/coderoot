import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "google-chrome",
  "chromium"
].filter(Boolean);

const chrome = chromeCandidates.find((candidate) => candidate.includes("/") ? existsSync(candidate) : true);
if (!chrome) {
  throw new Error("Chrome or Chromium was not found. Set CHROME_BIN to run the smoke test.");
}

const userDataDir = mkdtempSync(resolve(tmpdir(), "coderoot-chrome-"));
let dumpIndex = 0;
const fixtureUrl = pathToFileURL(resolve("test/fixture.html")).toString();
const enFixtureUrl = pathToFileURL(resolve("test/en-fixture.html")).toString();
const missingFixtureUrl = pathToFileURL(resolve("test/missing-fixture.html")).toString();
const unsupportedFixtureUrl = pathToFileURL(resolve("test/unsupported-fixture.html")).toString();
const koReadyPath = contentPath("/ko/trails/complete/curated-cards/intro-test-print-in-variety/introduction?concept=cpp14");
const enReadyPath = contentPath("/en/trails/complete/curated-cards/intro-test-print-in-variety/introduction?concept=cpp14");

try {
  const styles = readFileSync(resolve("extension/dist/styles.css"), "utf8");
  const styleRequired = [
    ".coderoot-card-expanded:after",
    ".coderoot-diagnostics-summary",
    ".coderoot-side-highlight .coderoot-xml-tag",
    ".coderoot-side-highlight .coderoot-xml-attr",
    ".coderoot-side-section[data-coderoot-side-panel=true]"
  ];
  const missingStyles = styleRequired.filter((needle) => !styles.includes(needle));
  if (missingStyles.length) {
    throw new Error(`Smoke test failed. Missing style markers: ${missingStyles.join(", ")}`);
  }
  if (/(^|})\s*\[data-coderoot-side-panel=/.test(styles)) {
    throw new Error("Smoke test failed. Side-panel CSS selector is not scoped to a Coderoot class.");
  }
  if (/\.dark\b/.test(styles)) {
    throw new Error("Smoke test failed. Generic .dark selector should not be emitted.");
  }

  const readyDom = dumpDom(fixtureUrl);

  const readyRequired = [
    'data-coderoot-block="yes"',
    'data-coderoot-expanded="true"',
    'data-coderoot-before-footer="yes"',
    'data-coderoot-article-expanded="true"',
    'data-coderoot-edit="yes"',
    'data-coderoot-editor="yes"',
    'data-coderoot-editor-xml="yes"',
    'data-coderoot-editor-highlight="yes"',
    'data-coderoot-editor-cancel="yes"',
    'data-coderoot-editor-github-href="https://github.com/kommiter/coderoot-content/blob/main/intro-test-print-in-variety/cpp.ko.xml"',
    'data-coderoot-editor-state-tag="DIV"',
    'data-coderoot-preview-cancel="yes"',
    'data-coderoot-toggle="no"',
    'data-coderoot-download="no"',
    'data-coderoot-cancel-restored="yes"',
    'data-coderoot-concept-language="C++14"',
    "고정 출력 문제를 C++14 관점에서 끝까지 보기",
    `data-coderoot-source="${koReadyPath}"`
  ];

  const readyMissing = readyRequired.filter((needle) => !readyDom.includes(needle));
  if (readyMissing.length) {
    throw new Error(`Smoke test failed. Missing ready markers: ${readyMissing.join(", ")}`);
  }

  const enDom = dumpDom(enFixtureUrl);
  const enRequired = [
    'data-coderoot-block="yes"',
    'data-coderoot-expanded="true"',
    'data-coderoot-language="en"',
    'data-coderoot-concept-language="C++14"',
    'data-coderoot-edit="yes"',
    'data-coderoot-toggle="no"',
    "Understanding Fixed Output in C++14",
    `data-coderoot-source="${enReadyPath}"`
  ];

  const enMissing = enRequired.filter((needle) => !enDom.includes(needle));
  if (enMissing.length) {
    throw new Error(`Smoke test failed. Missing English markers: ${enMissing.join(", ")}`);
  }

  const missingDom = dumpDom(missingFixtureUrl);
  const missingRequired = [
    'data-coderoot-block="yes"',
    'data-coderoot-status="missing"',
    'data-coderoot-toggle="no"',
    'data-coderoot-edit="yes"',
    'data-coderoot-editor-cancel="yes"',
    'data-coderoot-editor-save-enabled="yes"',
    'data-coderoot-version-count="1"',
    'data-coderoot-template-options="no"',
    'data-coderoot-cancel-restored="yes"',
    'data-coderoot-concept-language="Python3"',
    "심화 설명 추가하기"
  ];

  const missingMissing = missingRequired.filter((needle) => !missingDom.includes(needle));
  if (missingMissing.length) {
    throw new Error(`Smoke test failed. Missing fallback markers: ${missingMissing.join(", ")}`);
  }

  const unsupportedDom = dumpDom(unsupportedFixtureUrl);
  const unsupportedRequired = [
    'data-coderoot-block="yes"',
    'data-coderoot-status="unsupported"',
    'data-coderoot-kind="challenge"',
    'data-coderoot-toggle="no"',
    "intro-* 페이지에만 심화 설명"
  ];

  const unsupportedMissing = unsupportedRequired.filter((needle) => !unsupportedDom.includes(needle));
  if (unsupportedMissing.length) {
    throw new Error(`Smoke test failed. Missing unsupported markers: ${unsupportedMissing.join(", ")}`);
  }

  console.log("Coderoot smoke test passed.");
} finally {
  rmSync(userDataDir, { force: true, recursive: true });
}

function dumpDom(url) {
  const outputPath = resolve(userDataDir, `dump-${dumpIndex++}.html`);
  const output = openSync(outputPath, "w");
  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--no-first-run",
      "--no-default-browser-check",
      "--allow-file-access-from-files",
      `--user-data-dir=${userDataDir}`,
      "--virtual-time-budget=1800",
      "--dump-dom",
      url
    ],
    { encoding: "utf8", stdio: ["ignore", output, "pipe"], timeout: 10000 }
  );
  closeSync(output);

  const dom = readFileSync(outputPath, "utf8");
  if (dom) return dom;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Chrome exited with ${result.status}: ${result.stderr || ""}`);
  }
  return dom;
}

function contentPath(canonicalPath) {
  const url = new URL(canonicalPath, "https://www.codetree.ai");
  const parts = url.pathname.split("/").filter(Boolean);
  const language = parts[0] === "ko" || parts[0] === "en" ? parts[0] : "ko";
  const offset = parts[0] === "ko" || parts[0] === "en" ? 1 : 0;
  const slug = parts[offset + 3];
  const concept = toContentConceptKey(url.searchParams.get("concept") || "unknown");
  return `${slug}/${concept}.${language}.xml`;
}

function toContentConceptKey(concept) {
  if (concept === "cpp14") return "cpp";
  if (concept === "python3") return "py";
  return concept;
}
