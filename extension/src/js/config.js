export const ROOT_SELECTOR = "[data-coderoot-root]";
export const SUPPORTED_TAB = "introduction";
export const ROUTE_CHECK_MS = 700;
export const INSERT_RETRY_MS = 120;
export const CONTENT_DIR = "content";
export const REMOTE_CONTENT_URL_BASE = "https://raw.githubusercontent.com/kommiter/coderoot/main/content/";
export const GITHUB_CONTENT_URL_BASE = "https://github.com/kommiter/coderoot/blob/main/";
export const DEFAULT_CONCEPT_LANGUAGE = "C++14";
export const CONCEPT_LANGUAGE_PATTERNS = [
  { key: "javascript", label: "JavaScript", pattern: /\bjavascript\b/i },
  { key: "python3", label: "Python3", pattern: /\bpython\s*3\b/i },
  { key: "cpp14", label: "C++14", pattern: /\bc\+\+\s*14\b/i },
  { key: "cpp20", label: "C++20", pattern: /\bc\+\+\s*20\b/i },
  { key: "csharp", label: "C#", pattern: /\bc#\b/i },
  { key: "java", label: "Java", pattern: /\bjava\b/i },
  { key: "c", label: "C", pattern: /^c$/i }
];
