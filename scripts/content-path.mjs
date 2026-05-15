import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const commands = new Set(["path", "read", "write", "update"]);
const rawArgs = process.argv.slice(2);
let conceptLanguage = "C++14";
const args = [];

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === "--concept-language" || arg === "--code-language") {
    conceptLanguage = rawArgs[++i] || conceptLanguage;
  } else {
    args.push(arg);
  }
}

const firstArg = args[0];
const command = commands.has(firstArg) ? firstArg : "path";
const input = command === "path" && firstArg !== "path" ? firstArg : args[1];
const source = command === "path" && firstArg !== "path" ? args[1] : args[2];

if (!input) {
  console.error([
    "Usage:",
    "  node scripts/content-path.mjs <codetree-url-or-path>",
    "  node scripts/content-path.mjs path <codetree-url-or-path>",
    "  node scripts/content-path.mjs read <codetree-url-or-path>",
    "  node scripts/content-path.mjs write <codetree-url-or-path> <source.xml|->",
    "  node scripts/content-path.mjs update <codetree-url-or-path> <source.xml|->",
    "",
    "Options:",
    "  --concept-language <label>  Selected Codetree concept language. Defaults to C++14."
  ].join("\n"));
  process.exit(1);
}

const route = parseRoute(input, conceptLanguage);
const filePath = toContentPath(route);

if (command === "read") {
  if (!existsSync(filePath)) {
    console.error(`Missing content file for ${route.canonicalPath}`);
    console.error(`path: ${filePath}`);
    process.exit(2);
  }

  process.stdout.write(readFileSync(filePath, "utf8"));
} else if (command === "write" || command === "update") {
  if (!source) {
    console.error(`${command} requires <source.xml|->.`);
    process.exit(1);
  }

  const xmlText = source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8");
  const existed = existsSync(filePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, xmlText);

  console.log(`canonical: ${route.canonicalPath}`);
  console.log(`concept language: ${route.conceptLanguage}`);
  console.log(`${existed ? "updated" : "created"}: ${filePath}`);
} else {
  console.log(`canonical: ${route.canonicalPath}`);
  console.log(`concept language: ${route.conceptLanguage}`);
  console.log(`path: ${filePath}`);
}

function parseRoute(value, conceptLanguage) {
  const url = new URL(value, "https://www.codetree.ai");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let language = "ko";
  let offset = 0;

  if (parts[0] === "ko" || parts[0] === "en") {
    language = parts[0];
    offset = 1;
  }

  const isCuratedCard =
    parts[offset] === "trails" &&
    parts[offset + 1] === "complete" &&
    parts[offset + 2] === "curated-cards";

  if (!isCuratedCard) {
    throw new Error("Expected a Codetree curated-card URL/path.");
  }

  const slug = parts[offset + 3];
  const tab = parts[offset + 4];

  if (!slug || !tab) {
    throw new Error("URL/path must include problem slug and tab.");
  }

  const normalizedConcept = normalizeConceptLanguage(conceptLanguage);

  return {
    language,
    slug,
    tab,
    conceptLanguage: normalizedConcept.label,
    conceptLanguageKey: normalizedConcept.key,
    contentConceptKey: getContentConceptKey(normalizedConcept.key),
    canonicalPath: `/${language}/trails/complete/curated-cards/${slug}/${tab}?concept=${normalizedConcept.key}`
  };
}

function toContentPath(route) {
  return `${route.slug}/${route.contentConceptKey}.${route.language}.xml`;
}

function normalizeConceptLanguage(language) {
  const text = String(language || "C++14").replace(/\s+/g, " ").trim();
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  const known = {
    javascript: { key: "javascript", label: "JavaScript" },
    python3: { key: "python3", label: "Python3" },
    c: { key: "c", label: "C" },
    "c++14": { key: "cpp14", label: "C++14" },
    cpp14: { key: "cpp14", label: "C++14" },
    java: { key: "java", label: "Java" },
    "c#": { key: "csharp", label: "C#" },
    csharp: { key: "csharp", label: "C#" }
  };

  return known[normalized] || {
    key: normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown",
    label: text || "Unknown"
  };
}

function getContentConceptKey(conceptLanguageKey) {
  if (conceptLanguageKey === "cpp14") return "cpp";
  if (conceptLanguageKey === "python3") return "py";
  return conceptLanguageKey || "unknown";
}
