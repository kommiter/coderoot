import {
  CODEROOT_API_BASE,
  CONTENT_GITHUB_DEFAULT_BRANCH,
  CONTENT_GITHUB_OWNER,
  CONTENT_GITHUB_REPO,
  CONCEPT_LANGUAGE_PATTERNS,
  DEFAULT_CONCEPT_LANGUAGE,
  GITHUB_CONTENT_URL_BASE,
  INSERT_RETRY_MS,
  REMOTE_CONTENT_URL_BASE,
  ROOT_SELECTOR,
  ROUTE_CHECK_MS,
  SUPPORTED_TAB
} from "./config.js";
import { buildUnifiedDiff } from "./utils/diff.js";
import {
  createXmlTemplate,
  formatCoderootXml,
  highlightXml,
  isLineInSourceRange,
  isXmlFormattedForSave,
  parseProblemXml
} from "./xml/coderoot-xml.js";
import { escapeHtml, normalizeText } from "./utils/text.js";

(() => {
  const disableWatchers = document.documentElement?.dataset?.coderootDisableWatch === "true";
  const contentCache = new Map();

  let applyTimer = 0;
  let lastRouteKey = "";
  let activeOriginalEditorPanel = null;
  let activeInsertedDivider = null;
  let activeEditorCancel = null;
  let activeEditRouteKey = "";
  let originalFaviconLinks = null;

  function getCurrentUrl() {
    const testUrl = document.documentElement?.dataset?.coderootTestUrl;
    return testUrl || globalThis.location?.href || "";
  }

  function isCodetreeHost(url) {
    const isTest = Boolean(document.documentElement?.dataset?.coderootTestUrl);
    return isTest || url.hostname === "codetree.ai" || url.hostname === "www.codetree.ai";
  }

  function parseRoute() {
    let url;
    try {
      url = new URL(getCurrentUrl(), globalThis.location?.origin || "https://www.codetree.ai");
    } catch {
      return null;
    }

    if (!isCodetreeHost(url)) return null;

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

    if (!isCuratedCard) return null;

    const slug = parts[offset + 3];
    const tab = parts[offset + 4];

    if (!slug || tab !== SUPPORTED_TAB) return null;

    return withConceptLanguage({
      language,
      slug,
      tab,
      kind: getRouteKind(slug),
      canonicalBasePath: `/${language}/trails/complete/curated-cards/${slug}/${tab}`
    }, DEFAULT_CONCEPT_LANGUAGE);
  }

  function getRouteKind(slug) {
    if (slug.startsWith("intro-")) return "intro";
    if (slug.startsWith("challenge-")) return "challenge";
    if (slug.startsWith("test-")) return "test";
    return "unknown";
  }

  function routeKey(route) {
    return route ? route.canonicalPath : "";
  }

  function scheduleApply(delay = INSERT_RETRY_MS) {
    clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyCoderoot, delay);
  }

  function removeStaleRoots(activeKey) {
    document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
      if (root.dataset.coderootKey === activeKey) return;
      const article = root.closest("article");
      root.remove();
      clearArticleState(article);
    });
  }

  function clearArticleState(article) {
    if (!article) return;
    delete article.dataset.coderootExpanded;
    delete article.dataset.coderootEditing;
    article.style.removeProperty("--coderoot-gradient-top");
    article.classList.remove("coderoot-article");

    const card = article.closest(".coderoot-card-expanded");
    card?.classList.remove("coderoot-card-expanded");
  }

  async function applyCoderoot() {
    const baseRoute = parseRoute();
    if (!baseRoute) {
      if (activeEditRouteKey) cancelActiveEditSession();
      removeStaleRoots("");
      lastRouteKey = "";
      return;
    }

    const targets = findContentTargets(baseRoute);
    if (!targets) {
      scheduleApply(INSERT_RETRY_MS * 2);
      return;
    }

    const route = withDetectedConceptLanguage(baseRoute, targets.contentRoot);
    const key = routeKey(route);
    if (activeEditRouteKey && activeEditRouteKey !== key) cancelActiveEditSession();
    removeStaleRoots(key);
    lastRouteKey = key;

    removeDuplicateRoots(key, targets.article);
    const existing = targets.article.querySelector(ROOT_SELECTOR);
    if (existing?.dataset.coderootKey === key) {
      placeRootAtFooter(existing, targets);
      return;
    }

    existing?.remove();
    clearArticleState(targets.article);

    if (route.kind === "unknown") return;

    let root;

    if (route.kind === "intro") {
      const result = await loadProblemContent(route);
      const currentBaseRoute = parseRoute();
      const currentTargets = currentBaseRoute ? findContentTargets(currentBaseRoute) : null;
      const currentRoute = currentBaseRoute && currentTargets ? withDetectedConceptLanguage(currentBaseRoute, currentTargets.contentRoot) : currentBaseRoute;
      if (routeKey(currentRoute) !== key) return;

      const latestTargets = currentTargets || findContentTargets(route) || targets;
      const current = latestTargets.article.querySelector(ROOT_SELECTOR);
      current?.remove();

      root =
        result.status === "ready"
          ? buildReadyRoot(route, result.problem, latestTargets.article)
          : buildMissingRoot(route, result, latestTargets.article);

      placeRootAtFooter(root, latestTargets);
      return;
    } else {
      root = buildUnsupportedRoot(route);
    }

    placeRootAtFooter(root, targets);
  }

  function withDetectedConceptLanguage(route, contentRoot) {
    return withConceptLanguage(route, detectConceptLanguage(contentRoot));
  }

  function withConceptLanguage(route, conceptLanguage) {
    const normalized = normalizeConceptLanguage(conceptLanguage);
    return {
      ...route,
      conceptLanguage: normalized.label,
      conceptLanguageKey: normalized.key,
      contentConceptKey: getContentConceptKey(normalized.key),
      canonicalPath: `${route.canonicalBasePath}?concept=${normalized.key}`
    };
  }

  function detectConceptLanguage(contentRoot) {
    const override = document.documentElement?.dataset?.coderootConceptLanguage;
    if (override) return override;

    const scopes = [contentRoot, document].filter(Boolean);
    for (const scope of scopes) {
      const buttons = Array.from(scope.querySelectorAll('button[role="combobox"], button[data-slot="select-trigger"]'));
      for (const button of buttons) {
        const label = extractConceptLanguage(button.textContent);
        if (label) return label;
      }
    }

    return DEFAULT_CONCEPT_LANGUAGE;
  }

  function extractConceptLanguage(text) {
    const normalizedText = normalizeText(text);
    return CONCEPT_LANGUAGE_PATTERNS.find((item) => item.pattern.test(normalizedText))?.label || "";
  }

  function normalizeConceptLanguage(language) {
    const text = normalizeText(language) || DEFAULT_CONCEPT_LANGUAGE;
    const matched = CONCEPT_LANGUAGE_PATTERNS.find((item) => item.pattern.test(text));
    return matched || { key: text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown", label: text };
  }

  function getContentConceptKey(conceptLanguageKey) {
    if (conceptLanguageKey === "cpp14") return "cpp";
    if (conceptLanguageKey === "python3") return "py";
    return conceptLanguageKey || "unknown";
  }

  function removeDuplicateRoots(activeKey, targetArticle) {
    document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
      if (root.dataset.coderootKey !== activeKey) return;
      if (targetArticle?.contains(root)) return;
      const article = root.closest("article");
      root.remove();
      clearArticleState(article);
    });
  }

  function placeRootAtFooter(root, targets) {
    if (!root || !targets?.insertionParent || !targets.footerStart) return;
    if (root.parentElement === targets.insertionParent && root.nextElementSibling === targets.footerStart) return;
    targets.insertionParent.insertBefore(root, targets.footerStart);
  }

  function findContentTargets(route) {
    const articles = Array.from(document.querySelectorAll("article"));

    for (const article of articles) {
      const contentRoot = findContentRoot(article);
      if (!contentRoot) continue;

      const footer = findFooterTarget(contentRoot, route.language);
      if (!footer) continue;

      return {
        article,
        contentRoot,
        insertionParent: footer.parent,
        footerStart: footer.before
      };
    }

    return null;
  }

  function findContentRoot(article) {
    const directChildren = Array.from(article.children);
    const preferred = directChildren.find((child) => {
      const className = String(child.className || "");
      return child.tagName === "DIV" && className.includes("flex") && className.includes("flex-col") && className.includes("p-32");
    });

    if (preferred) return preferred;

    return directChildren.find((child) => {
      const className = String(child.className || "");
      return child.tagName === "DIV" && className.includes("flex") && className.includes("flex-col");
    });
  }

  function findFooterTarget(contentRoot, language) {
    const feedbackPhrases =
      language === "en"
        ? ["Was this content helpful?", "Did this content help"]
        : ["이 콘텐츠가 도움이 되었나요?", "콘텐츠가 도움이 되었나요?"];

    const descendants = Array.from(contentRoot.querySelectorAll("div, p, section"));
    const feedbackText = descendants
      .filter((node) => {
        const text = normalizeText(node.textContent);
        return feedbackPhrases.some((phrase) => text.includes(phrase));
      })
      .sort((a, b) => normalizeText(a.textContent).length - normalizeText(b.textContent).length)[0];

    const feedback = feedbackText ? findFeedbackContainer(feedbackText, contentRoot) : null;
    if (feedback?.parentElement) {
      return { parent: feedback.parentElement, before: feedback };
    }

    const copyright = descendants.find((node) => {
      const text = normalizeText(node.textContent);
      return text.includes("Copyright") || text.includes("Branch & Bound");
    });

    if (!copyright?.parentElement) return null;

    const siblings = Array.from(copyright.parentElement.children);
    const copyrightIndex = siblings.indexOf(copyright);
    const previous = siblings[copyrightIndex - 1];

    if (previous?.tagName === "DIV") {
      return { parent: copyright.parentElement, before: previous };
    }

    return { parent: copyright.parentElement, before: copyright };
  }

  function findFeedbackContainer(start, boundary) {
    let node = start;

    while (node && node !== boundary) {
      const className = String(node.className || "");
      if (node.tagName === "DIV" && className.includes("justify-center") && className.includes("flex-wrap")) {
        return node;
      }
      node = node.parentElement;
    }

    node = start;
    while (node?.parentElement && node.parentElement !== boundary) {
      node = node.parentElement;
    }

    return node === boundary ? start : node;
  }

  function getUiLanguage() {
    const route = parseRoute();
    if (route?.language === "en") return "en";
    const pageLanguage = String(document.documentElement?.lang || "").toLowerCase();
    return pageLanguage.startsWith("en") ? "en" : "ko";
  }

  async function loadProblemContent(route) {
    const cacheKey = route.canonicalPath;
    if (contentCache.has(cacheKey)) return contentCache.get(cacheKey);

    const resultPromise = (async () => {
      const xmlPath = await getContentPath(route);
      try {
        const xmlText = await fetchTextAsset(xmlPath);
        return {
          status: "ready",
          problem: {
            ...parseProblemXml(xmlText, route, xmlPath),
            xmlText
          },
          xmlPath
        };
      } catch (error) {
        return {
          status: "missing",
          xmlPath,
          reason: error?.message || "Content file was not found."
        };
      }
    })();

    contentCache.set(cacheKey, resultPromise);
    return resultPromise;
  }

  async function getContentPath(route) {
    return `${route.slug}/${route.contentConceptKey || getContentConceptKey(route.conceptLanguageKey)}.${route.language}.xml`;
  }

  async function fetchTextAsset(path) {
    const url = getAssetUrl(path);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load ${path}: ${response.status}`);
    }
    return response.text();
  }

  function getAssetUrl(path) {
    const testBase = document.documentElement?.dataset?.coderootContentBase;
    if (testBase) {
      const base = testBase.endsWith("/") ? testBase : `${testBase}/`;
      return new URL(`${base}${path.replace(/^content\//, "")}`, document.baseURI).href;
    }

    if (isContentXmlPath(path)) {
      return new URL(path.replace(/^content\//, ""), REMOTE_CONTENT_URL_BASE).href;
    }

    if (globalThis.chrome?.runtime?.getURL) {
      return chrome.runtime.getURL(getRuntimeAssetPath(path));
    }

    return new URL(`/${path}`, globalThis.location?.origin || "https://www.codetree.ai").href;
  }

  function getRuntimeAssetPath(path) {
    const iconPath = globalThis.chrome?.runtime?.getManifest?.()?.icons?.["16"] || "";
    if (!iconPath.startsWith("extension/")) return path;
    if (path.startsWith("extension/")) return path;
    return `extension/${path}`;
  }

  function hasExtensionRuntime() {
    return Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.runtime?.sendMessage);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      if (!hasExtensionRuntime()) {
        reject(new Error("Coderoot extension runtime is not available."));
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!response?.ok) {
          const error = new Error(response?.error?.message || "Coderoot background request failed.");
          error.status = response?.error?.status || 0;
          error.data = response?.error?.data || null;
          reject(error);
          return;
        }
        resolve(response.data);
      });
    });
  }

  async function githubApi(endpoint, options = {}) {
    return sendRuntimeMessage({
      auth: options.auth !== false,
      body: options.body ?? null,
      endpoint,
      method: options.method || "GET",
      type: "coderoot.github.api"
    });
  }

  function getCoderootApiBase(language = "ko") {
    const base = String(CODEROOT_API_BASE || "").trim().replace(/\/+$/, "");
    if (!base) {
      throw new Error(
        language === "en"
          ? "Coderoot API is not configured yet. Set CODEROOT_API_BASE after deploying the GitHub App backend."
          : "Coderoot API가 아직 설정되지 않았습니다. GitHub App 백엔드를 배포한 뒤 CODEROOT_API_BASE를 설정해 주세요."
      );
    }
    return base;
  }

  function getCoderootApiOrigin() {
    try {
      return new URL(getCoderootApiBase("en")).origin;
    } catch {
      return "";
    }
  }

  async function coderootApi(path, { body = null, language = "ko", method = "GET", token = "" } = {}) {
    const base = getCoderootApiBase(language);
    const headers = {
      Accept: "application/json"
    };
    if (body !== null && body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${base}${path}`, {
      body: body === null || body === undefined ? undefined : JSON.stringify(body),
      headers,
      method
    });
    const text = await response.text();
    const data = text ? parseMaybeJson(text) : null;

    if (!response.ok) {
      const message = typeof data === "object" && data?.message
        ? data.message
        : (text || (language === "en" ? "Coderoot API request failed." : "Coderoot API 요청에 실패했습니다."));
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data || {};
  }

  function parseMaybeJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async function getCoderootSessionStatus(language) {
    if (!hasExtensionRuntime()) return { hasSession: false, login: "", token: "" };
    const stored = await sendRuntimeMessage({ type: "coderoot.session.get" });
    if (!stored?.hasSession || !stored.token) return { hasSession: false, login: "", token: "" };

    try {
      const session = await coderootApi("/api/auth/session", {
        language,
        method: "GET",
        token: stored.token
      });
      return {
        hasSession: true,
        login: session.login || stored.login || "",
        token: stored.token
      };
    } catch (error) {
      if ([401, 403].includes(Number(error.status))) {
        await clearCoderootSession();
      }
      return { hasSession: false, login: "", token: "" };
    }
  }

  async function setCoderootSession({ login, token }) {
    return sendRuntimeMessage({ login, token, type: "coderoot.session.set" });
  }

  async function clearCoderootSession() {
    if (!hasExtensionRuntime()) return { hasSession: false };
    return sendRuntimeMessage({ type: "coderoot.session.clear" });
  }

  async function ensureCoderootSession(language) {
    const status = await getCoderootSessionStatus(language);
    if (status.hasSession) return status.token;

    const session = await openGitHubAppDialog(language);
    if (!session?.token) return "";
    await setCoderootSession(session);
    return session.token;
  }

  function openGitHubAppDialog(language) {
    return new Promise((resolve) => {
      document.querySelectorAll(".coderoot-token-overlay").forEach((overlay) => overlay.remove());

      const overlay = document.createElement("div");
      overlay.className = "coderoot-review-overlay coderoot-token-overlay";

      const dialog = document.createElement("section");
      dialog.className = "coderoot-token-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");

      const title = document.createElement("h2");
      title.textContent = language === "en" ? "Connect GitHub" : "GitHub 연결";

      const description = document.createElement("p");
      description.textContent =
        language === "en"
          ? "Coderoot opens GitHub in a popup, verifies your account, then asks the Coderoot API to save this XML through the installed GitHub App. No personal access token is stored in the extension."
          : "Coderoot가 팝업으로 GitHub 계정을 확인한 뒤, 설치된 GitHub App 권한으로 Coderoot API에 XML 저장을 요청합니다. 확장 프로그램에는 personal access token을 저장하지 않습니다.";

      const error = document.createElement("p");
      error.className = "coderoot-token-error";

      const footer = document.createElement("div");
      footer.className = "coderoot-token-footer";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "coderoot-token-secondary";
      cancel.textContent = language === "en" ? "Cancel" : "취소";

      const save = document.createElement("button");
      save.type = "button";
      save.className = "coderoot-token-primary";
      save.textContent = language === "en" ? "Continue with GitHub" : "GitHub로 계속하기";

      const cleanup = (value) => {
        window.removeEventListener("message", handleMessage, false);
        document.removeEventListener("keydown", handleKeydown, true);
        overlay.remove();
        resolve(value);
      };

      const submit = () => {
        let apiBase = "";
        try {
          apiBase = getCoderootApiBase(language);
        } catch (baseError) {
          error.textContent = baseError.message;
          return;
        }

        const authUrl = new URL("/api/auth/github/start", apiBase);
        authUrl.searchParams.set("origin", window.location.origin);
        const popup = window.open(authUrl.href, "coderoot-github-auth", "popup=yes,width=720,height=820");
        if (!popup) {
          error.textContent = language === "en" ? "Allow popups, then try again." : "팝업을 허용한 뒤 다시 시도해 주세요.";
          return;
        }
        save.disabled = true;
        save.textContent = language === "en" ? "Waiting for GitHub..." : "GitHub 응답 대기 중...";
      };

      const handleMessage = (event) => {
        if (event.origin !== getCoderootApiOrigin()) return;
        if (event.data?.source !== "coderoot") return;
        if (event.data?.type === "github.error") {
          error.textContent = event.data.error || (language === "en" ? "GitHub connection failed." : "GitHub 연결에 실패했습니다.");
          save.disabled = false;
          save.textContent = language === "en" ? "Continue with GitHub" : "GitHub로 계속하기";
          return;
        }
        if (event.data?.type !== "github.connected") return;
        if (!event.data.token) {
          error.textContent = language === "en" ? "GitHub connection did not return a session." : "GitHub 연결 세션을 받지 못했습니다.";
          save.disabled = false;
          save.textContent = language === "en" ? "Continue with GitHub" : "GitHub로 계속하기";
          return;
        }
        cleanup({
          login: String(event.data.login || ""),
          token: String(event.data.token || "")
        });
      };

      const handleKeydown = (event) => {
        if (!document.body.contains(overlay)) {
          document.removeEventListener("keydown", handleKeydown, true);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup("");
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      };

      cancel.addEventListener("click", () => cleanup(""));
      save.addEventListener("click", submit);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) cleanup("");
      });
      window.addEventListener("message", handleMessage, false);
      document.addEventListener("keydown", handleKeydown, true);

      footer.append(cancel, save);
      dialog.append(title, description, error, footer);
      overlay.append(dialog);
      document.body.append(overlay);
      save.focus({ preventScroll: true });
    });
  }

  async function publishXmlToGitHub(options) {
    const token = await ensureCoderootSession(options.route.language);
    if (!token) {
      throw createSilentCancelError();
    }

    const result = await coderootApi("/api/github/save", {
      body: {
        mode: options.mode,
        route: {
          conceptLanguage: options.route.conceptLanguage,
          conceptLanguageKey: options.route.conceptLanguageKey,
          contentConceptKey: options.route.contentConceptKey,
          language: options.route.language,
          slug: options.route.slug
        },
        sourcePath: options.sourcePath,
        xmlText: options.xmlText
      },
      language: options.route.language,
      method: "POST",
      token
    });

    clearContentCache();
    return result;
  }

  function createSilentCancelError() {
    const error = new Error("cancelled");
    error.coderootSilent = true;
    return error;
  }

  async function loadGitHubVersions({ initialXml, mode, route, sourcePath }) {
    const fallback = getFallbackVersions({ initialXml, mode, route });
    if (!hasExtensionRuntime()) {
      return {
        entries: fallback,
        latestLabel: route.language === "en" ? "local draft" : "로컬 작성본"
      };
    }

    try {
      const params = new URLSearchParams({
        path: sourcePath,
        per_page: "8",
        sha: CONTENT_GITHUB_DEFAULT_BRANCH
      });
      const response = await githubApi(`/repos/${CONTENT_GITHUB_OWNER}/${CONTENT_GITHUB_REPO}/commits?${params.toString()}`, { auth: false });
      const commits = Array.isArray(response.data) ? response.data : [];
      const entries = [fallback[0]];

      for (const commit of commits) {
        const sha = commit.sha;
        if (!sha) continue;
        try {
          const file = await githubApi(`/repos/${CONTENT_GITHUB_OWNER}/${CONTENT_GITHUB_REPO}/contents/${encodeGitHubPath(sourcePath)}?ref=${encodeURIComponent(sha)}`, { auth: false });
          const xml = formatCoderootXml(base64DecodeUtf8(file.data?.content || ""));
          if (!xml.trim()) continue;
          const date = commit.commit?.committer?.date || commit.commit?.author?.date || "";
          entries.push({
            label: `${sha.slice(0, 7)} · ${formatRelativeTime(date, route.language)}`,
            xml
          });
        } catch {
          // A commit may touch the path metadata without an immediately readable blob.
        }
      }

      entries.push(...fallback.slice(1));

      return {
        entries,
        latestLabel: commits[0]?.commit?.committer?.date
          ? formatRelativeTime(commits[0].commit.committer.date, route.language)
          : (route.language === "en" ? "no published history" : "게시 이력 없음")
      };
    } catch {
      return {
        entries: fallback,
        latestLabel: route.language === "en" ? "history unavailable" : "이력 불러오기 실패"
      };
    }
  }

  function clearContentCache() {
    contentCache.clear();
  }

  function getFallbackVersions({ route, initialXml, mode }) {
    const template = formatCoderootXml(createXmlTemplate(route));
    const baseXml = formatCoderootXml(initialXml || template);
    return [
      {
        label: route.language === "en" ? "Current draft" : "현재 작성본",
        xml: baseXml
      },
      {
        label: route.language === "en" ? "Clean template" : "초기 템플릿",
        xml: template
      },
      {
        label: mode === "create" ? (route.language === "en" ? "Empty content shell" : "빈 콘텐츠 틀") : (route.language === "en" ? "Empty rewrite shell" : "빈 재작성 틀"),
        xml: formatCoderootXml(template.replace(/<content>[\s\S]*?<\/content>/, "<content>\n    <p></p>\n  </content>"))
      }
    ];
  }

  function formatRelativeTime(dateText, language) {
    const time = Date.parse(dateText || "");
    if (!time) return language === "en" ? "unknown time" : "시간 알 수 없음";
    const seconds = Math.max(1, Math.round((Date.now() - time) / 1000));
    const units = [
      [31536000, language === "en" ? "year" : "년"],
      [2592000, language === "en" ? "month" : "개월"],
      [86400, language === "en" ? "day" : "일"],
      [3600, language === "en" ? "hour" : "시간"],
      [60, language === "en" ? "minute" : "분"]
    ];
    for (const [unitSeconds, label] of units) {
      if (seconds < unitSeconds) continue;
      const count = Math.floor(seconds / unitSeconds);
      if (language === "en") return `${count} ${label}${count === 1 ? "" : "s"} ago`;
      return `${count}${label} 전`;
    }
    return language === "en" ? "just now" : "방금 전";
  }

  function encodeGitHubPath(path) {
    return String(path).split("/").map(encodeURIComponent).join("/");
  }

  function base64DecodeUtf8(text) {
    const binary = atob(String(text || "").replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function setEditingFavicon(editing) {
    if (!document.head) return;

    if (editing) {
      if (!originalFaviconLinks) {
        originalFaviconLinks = Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]'))
          .map((link) => ({
            href: link.getAttribute("href"),
            rel: link.getAttribute("rel"),
            sizes: link.getAttribute("sizes"),
            type: link.getAttribute("type")
          }));
      }

      document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').forEach((link) => link.remove());
      const icon = document.createElement("link");
      icon.rel = "icon";
      icon.type = "image/x-icon";
      icon.href = getAssetUrl("coderoot-favicon.ico");
      icon.dataset.coderootFavicon = "true";
      document.head.append(icon);
      return;
    }

    document.querySelectorAll('link[data-coderoot-favicon="true"], link[rel~="icon"], link[rel="shortcut icon"]').forEach((link) => link.remove());
    const links = originalFaviconLinks?.length
      ? originalFaviconLinks
      : [{ rel: "icon", type: "image/x-icon", href: getAssetUrl("codetree-favicon.ico") }];

    links.forEach((item) => {
      const link = document.createElement("link");
      link.rel = item.rel || "icon";
      if (item.type) link.type = item.type;
      if (item.sizes) link.sizes = item.sizes;
      link.href = item.href || getAssetUrl("codetree-favicon.ico");
      document.head.append(link);
    });
  }


  function buildReadyRoot(route, problem, article, options = {}) {
    const root = document.createElement("section");
    root.className = "coderoot-shell";
    root.dataset.coderootRoot = "true";
    root.dataset.coderootKey = routeKey(route);
    root.dataset.coderootSlug = route.slug;
    root.dataset.coderootLanguage = problem.language;
    root.dataset.coderootConceptLanguage = route.conceptLanguage;
    root.dataset.coderootSource = problem.sourcePath;
    root.dataset.coderootExpanded = "true";

    const banner = document.createElement("div");
    banner.className = "coderoot-info";

    const icon = document.createElement("div");
    icon.className = "coderoot-info-icon";
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;

    const bannerText = document.createElement("p");
    bannerText.textContent =
      problem.language === "en"
        ? `Coderoot advanced note. This section expands the original concept from the selected ${route.conceptLanguage} perspective.`
        : `Coderoot 심화 개념입니다. 현재 선택된 ${route.conceptLanguage} 기준으로 기존 개념의 배경과 원리를 더 자세히 설명합니다.`;

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "coderoot-edit-button";
    edit.dataset.coderootEdit = "true";
    edit.textContent = problem.language === "en" ? "Edit" : "수정하기";

    banner.append(icon, bannerText, edit);

    const panel = document.createElement("div");
    panel.className = "coderoot-panel";

    const meta = document.createElement("p");
    meta.className = "coderoot-meta";
    meta.textContent = problem.badge;
    decoratePreviewScope(meta, {
      sourceKey: "meta-badge",
      sourceRange: problem.badgeRange,
      sourceTag: "badge"
    });

    const title = document.createElement("h1");
    title.className = "coderoot-title";
    title.textContent = problem.title;
    decoratePreviewScope(title, {
      sourceKey: "meta-title",
      sourceRange: problem.titleRange,
      sourceTag: "title"
    });

    const content = document.createElement("div");
    content.className = "coderoot-content";
    problem.blocks.forEach((block) => content.append(renderBlock(block)));

    panel.append(meta, title, content);
    root.append(banner, panel);

    edit.addEventListener("click", () => {
      void openXmlEditor({
        route,
        article,
        root,
        sourcePath: problem.sourcePath,
        initialXml: problem.xmlText || "",
        mode: "edit",
        onPreview: (nextProblem, cancelEditing, editorApi) => {
          renderPreviewRoot({ root, article, problem: nextProblem, route, onCancel: cancelEditing, editorApi });
        },
        onCancel: () => {
          clearArticleState(article);
          const restored = buildReadyRoot(route, problem, article);
          root.replaceWith(restored);
        }
      });
    });

    article.dataset.coderootExpanded = "true";

    return root;
  }

  function buildMissingRoot(route, missing, article) {
    const root = document.createElement("section");
    root.className = "coderoot-shell coderoot-missing";
    root.dataset.coderootRoot = "true";
    root.dataset.coderootKey = routeKey(route);
    root.dataset.coderootSlug = route.slug;
    root.dataset.coderootLanguage = route.language;
    root.dataset.coderootConceptLanguage = route.conceptLanguage;
    root.dataset.coderootStatus = "missing";

    const panel = document.createElement("div");
    panel.className = "coderoot-missing-panel";

    const badge = document.createElement("p");
    badge.className = "coderoot-missing-badge";
    badge.textContent = route.language === "en" ? "Coderoot note is not ready yet" : "Coderoot 심화 설명 준비 중";

    const title = document.createElement("h1");
    title.className = "coderoot-missing-title";
    title.textContent =
      route.language === "en"
        ? "No advanced note has been written for this problem yet."
        : "아직 이 문제의 심화 설명이 작성되지 않았습니다.";

    const body = document.createElement("p");
    body.className = "coderoot-missing-text";
    body.textContent =
      route.language === "en"
        ? `You can draft an advanced note for ${route.conceptLanguage} and preview it on this page.`
        : `현재 선택된 ${route.conceptLanguage} 기준 심화 설명을 작성하고 이 페이지에서 바로 미리볼 수 있습니다.`;

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "coderoot-edit-button coderoot-edit-button-inline";
    edit.dataset.coderootEdit = "true";
    edit.textContent = route.language === "en" ? "Add Advanced Note" : "심화 설명 추가하기";

    edit.addEventListener("click", () => {
      void openXmlEditor({
        route,
        article,
        root,
        sourcePath: missing.xmlPath,
        initialXml: createXmlTemplate(route),
        mode: "create",
        onPreview: (nextProblem, cancelEditing, editorApi) => {
          renderPreviewRoot({ root, article, problem: nextProblem, route, onCancel: cancelEditing, editorApi });
        },
        onCancel: () => {
          clearArticleState(article);
          const restored = buildMissingRoot(route, missing, article);
          root.replaceWith(restored);
        }
      });
    });

    panel.append(badge, title, body, edit);
    root.append(panel);

    return root;
  }

  function buildUnsupportedRoot(route) {
    const root = document.createElement("section");
    root.className = "coderoot-shell coderoot-unsupported";
    root.dataset.coderootRoot = "true";
    root.dataset.coderootKey = routeKey(route);
    root.dataset.coderootSlug = route.slug;
    root.dataset.coderootLanguage = route.language;
    root.dataset.coderootConceptLanguage = route.conceptLanguage;
    root.dataset.coderootStatus = "unsupported";
    root.dataset.coderootKind = route.kind;

    const panel = document.createElement("div");
    panel.className = "coderoot-missing-panel coderoot-unsupported-panel";

    const badge = document.createElement("p");
    badge.className = "coderoot-missing-badge";
    badge.textContent = route.language === "en" ? "Coderoot coverage note" : "Coderoot 지원 범위 안내";

    const title = document.createElement("h1");
    title.className = "coderoot-missing-title";
    title.textContent =
      route.language === "en"
        ? "This page type is not covered by Coderoot yet."
        : "이 유형은 아직 Coderoot 심화 설명을 제공하지 않습니다.";

    const body = document.createElement("p");
    body.className = "coderoot-missing-text";
    body.textContent =
      route.language === "en"
        ? "Coderoot currently supports only intro-* pages where one problem maps to one basic concept. challenge-* and test-* pages can contain multiple concepts in accordions, so this extension shows this note instead of an expandable deep dive."
        : "Coderoot는 현재 하나의 문제와 하나의 기본 개념이 1:1로 대응되는 intro-* 페이지에만 심화 설명을 붙입니다. challenge-*와 test-* 페이지는 여러 기본 개념이 accordion으로 묶일 수 있어, 지금은 접히는 심화 콘텐츠 대신 이 안내만 표시합니다.";

    panel.append(badge, title, body);
    root.append(panel);

    return root;
  }

  async function openXmlEditor({ route, article, root, sourcePath, initialXml, mode, onPreview, onCancel }) {
    cancelActiveEditSession();
    activeEditRouteKey = routeKey(route);
    setEditingFavicon(true);

    const language = route.language;
    const panel = await createSideEditorPanel(article);
    const shell = document.createElement("div");
    shell.className = "coderoot-side-shell";
    shell.dataset.coderootEditor = "true";

    const topbar = document.createElement("div");
    topbar.className = "coderoot-side-topbar";

    const leftTools = document.createElement("div");
    leftTools.className = "coderoot-side-left-tools";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "coderoot-side-icon-button coderoot-side-close-button";
    close.setAttribute("aria-label", language === "en" ? "Collapse editor panel" : "에디터 패널 접기");
    close.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-right" aria-hidden="true"><path d="m6 17 5-5-5-5"></path><path d="m13 17 5-5-5-5"></path></svg>`;

    const modePill = document.createElement("span");
    modePill.className = "coderoot-side-pill";
    modePill.textContent = "XML";

    const updated = document.createElement("span");
    updated.className = "coderoot-side-muted";
    updated.textContent = language === "en" ? "loading history..." : "이력 불러오는 중...";

    leftTools.append(close, modePill, updated);

    const github = document.createElement("a");
    github.className = "coderoot-side-link";
    github.href = `${GITHUB_CONTENT_URL_BASE}${sourcePath}`;
    github.target = "_blank";
    github.rel = "noreferrer noopener";
    github.title = language === "en" ? "Open GitHub file" : "GitHub 파일 열기";
    github.setAttribute("aria-label", github.title);
    github.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>`;

    const versions = document.createElement("select");
    versions.className = "coderoot-side-select";
    versions.setAttribute("aria-label", language === "en" ? "Restore version" : "되돌릴 버전 선택");
    let versionEntries = getFallbackVersions({ route, initialXml, mode });
    const renderVersionOptions = (selectedIndex = 0) => {
      versions.replaceChildren();
      versionEntries.forEach((version, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = version.label;
        versions.append(option);
      });
      versions.value = String(Math.min(selectedIndex, Math.max(0, versionEntries.length - 1)));
    };
    renderVersionOptions();

    const state = document.createElement("button");
    state.type = "button";
    state.className = "coderoot-side-state";
    state.dataset.state = "clean";
    state.innerHTML = `<span></span><p>${language === "en" ? "Original" : "원본"}</p>`;

    topbar.append(leftTools, github, versions, state);

    const editorWrap = document.createElement("div");
    editorWrap.className = "coderoot-side-editor-wrap";

    const gutter = document.createElement("pre");
    gutter.className = "coderoot-side-gutter";

    const codeArea = document.createElement("div");
    codeArea.className = "coderoot-side-code-area";

    const highlight = document.createElement("pre");
    highlight.className = "coderoot-side-highlight";

    const textarea = document.createElement("textarea");
    textarea.className = "coderoot-side-textarea";
    textarea.spellcheck = false;
    let originalXml = formatCoderootXml(initialXml || createXmlTemplate(route));
    textarea.value = originalXml;

    codeArea.append(highlight, textarea);
    editorWrap.append(gutter, codeArea);

    const status = document.createElement("p");
    status.className = "coderoot-side-status";

    const footbar = document.createElement("div");
    footbar.className = "coderoot-side-footbar";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "coderoot-side-footer-button";
    back.title = language === "en" ? "Back (⌘+Z)" : "뒤로 가기 (⌘+Z)";
    back.setAttribute("aria-label", back.title);
    back.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left" aria-hidden="true"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg><span>${language === "en" ? "Back" : "뒤로 가기"}</span>`;

    const forward = document.createElement("button");
    forward.type = "button";
    forward.className = "coderoot-side-footer-button";
    forward.title = language === "en" ? "Forward (⌘+⇧+Z)" : "앞으로 가기 (⌘+⇧+Z)";
    forward.setAttribute("aria-label", forward.title);
    forward.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg><span>${language === "en" ? "Forward" : "앞으로 가기"}</span>`;

    const contribute = document.createElement("button");
    contribute.type = "button";
    contribute.className = "coderoot-side-submit";
    contribute.title = language === "en" ? "Save (⌘+↵)" : "저장하기 (⌘+↵)";
    contribute.setAttribute("aria-label", contribute.title);
    contribute.innerHTML = `<span>${language === "en" ? "Save" : "저장하기"}</span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-upload" aria-hidden="true"><path d="M12 13v8"></path><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="m8 17 4-4 4 4"></path></svg>`;

    footbar.append(back, forward, contribute);
    shell.append(topbar, editorWrap, status, footbar);
    panel.replaceChildren(shell);

    const cancelEditing = (options = {}) => {
      const activeCancel = activeEditorCancel;
      activeEditorCancel = null;
      activeCancel?.();
      closeExistingSideEditor(options);
    };

    activeEditorCancel = () => {
      onCancel?.();
    };

    let currentPreviewProblem = null;
    let currentEditorError = null;
    let previewHoverScopeKey = null;
    let revealPreviewOnNextRender = false;
    let history = [originalXml];
    let historyIndex = 0;

    const syncScroll = () => {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
    };

    const updateStateIndicator = (kind) => {
      state.dataset.state = kind;
      contribute.disabled = kind !== "dirty";
      const label = state.querySelector("p");
      if (!label) return;
      const labels = {
        clean: language === "en" ? "Original" : "원본",
        dirty: language === "en" ? "Editing" : "수정 중",
        error: language === "en" ? "Error" : "오류"
      };
      label.textContent = labels[kind] || labels.clean;
    };

    const refreshHistoryButtons = () => {
      back.disabled = historyIndex <= 0;
      forward.disabled = historyIndex >= history.length - 1;
    };

    const pushHistory = () => {
      const nextValue = textarea.value;
      if (history[historyIndex] === nextValue) return;
      history = history.slice(0, historyIndex + 1).concat(nextValue);
      historyIndex = history.length - 1;
      refreshHistoryButtons();
    };

    const setEditorValue = (value, options = {}) => {
      textarea.value = value;
      if (options.record !== false) pushHistory();
      sync();
    };

    const applyHistory = (nextIndex) => {
      if (nextIndex < 0 || nextIndex >= history.length) return;
      historyIndex = nextIndex;
      textarea.value = history[historyIndex];
      refreshHistoryButtons();
      sync();
    };

    const formatEditorValue = () => {
      const formattedXml = formatCoderootXml(textarea.value);
      if (formattedXml === textarea.value) return false;
      textarea.value = formattedXml;
      pushHistory();
      sync();
      return true;
    };

    const togglePanelCollapse = () => {
      const collapsed = panel.dataset.coderootCollapsed !== "true";
      panel.dataset.coderootCollapsed = String(collapsed);
      shell.dataset.coderootCollapsed = String(collapsed);
      if (collapsed) {
        panel.style.setProperty("flex", "0 0 40px", "important");
        panel.style.setProperty("max-width", "40px", "important");
        panel.style.setProperty("min-width", "40px", "important");
        panel.style.setProperty("width", "40px", "important");
      } else {
        panel.style.setProperty("flex", "0 0 clamp(520px, 48vw, 920px)", "important");
        panel.style.setProperty("max-width", "clamp(520px, 48vw, 920px)", "important");
        panel.style.setProperty("min-width", "min(520px, calc(100vw - 24px))", "important");
        panel.style.setProperty("width", "clamp(520px, 48vw, 920px)", "important");
      }
      close.setAttribute("aria-label", collapsed ? (language === "en" ? "Expand editor panel" : "에디터 패널 펼치기") : (language === "en" ? "Collapse editor panel" : "에디터 패널 접기"));
      close.innerHTML = collapsed
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-left" aria-hidden="true"><path d="m11 17-5-5 5-5"></path><path d="m18 17-5-5 5-5"></path></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-right" aria-hidden="true"><path d="m6 17 5-5-5-5"></path><path d="m13 17 5-5-5-5"></path></svg>`;
    };

    const requestPreviewReveal = () => {
      revealPreviewOnNextRender = true;
    };

    const renderEditorSurface = (options = {}) => {
      const xmlText = textarea.value;
      const activeLine = getActiveLine(textarea);
      const activeScope = findScopeByLine(currentPreviewProblem, activeLine);
      const hoverScope = getScopeByKey(currentPreviewProblem, previewHoverScopeKey);
      const scope = hoverScope || activeScope;
      const shouldRevealPreview = options.revealPreview || revealPreviewOnNextRender;
      revealPreviewOnNextRender = false;
      highlight.innerHTML = highlightXml(xmlText, activeLine, scope, currentEditorError);
      gutter.innerHTML = createLineNumbers(xmlText, activeLine, scope, currentEditorError);
      textarea.title = currentEditorError?.message || "";
      highlightPreviewBlock(root, scope?.sourceKey);
      if (shouldRevealPreview) revealPreviewBlock(root, scope?.sourceKey);
      syncScroll();
    };

    const revealEditorLine = (line) => {
      const targetLine = Math.max(1, Number(line) || 1);
      textarea.scrollTop = Math.max(0, (targetLine - 4) * 21);
      syncScroll();
      renderEditorSurface();
    };

    const goToEditorLine = (line) => {
      const targetLine = Math.max(1, Number(line) || 1);
      const offset = offsetForLine(textarea.value, targetLine);
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(offset, offset);
      revealEditorLine(targetLine);
    };

    const editorApi = {
      clearScopeIndex(index) {
        if (previewHoverScopeKey !== String(index)) return;
        previewHoverScopeKey = null;
        renderEditorSurface();
      },
      goToLine: goToEditorLine,
      revealLine: revealEditorLine,
      setScopeIndex(index) {
        previewHoverScopeKey = String(index);
        renderEditorSurface();
      }
    };

    const sync = () => {
      const xmlText = textarea.value;
      const problem = validateEditorXml(xmlText, route, sourcePath, status, { silent: true });
      currentPreviewProblem = problem;
      currentEditorError = problem ? null : editorErrorFromStatus(status);
      const formattedXml = problem ? formatCoderootXml(xmlText) : xmlText;
      const dirty = Boolean(problem && !isXmlFormattedForSave(formattedXml, originalXml));

      updateStateIndicator(problem ? (dirty ? "dirty" : "clean") : "error");
      renderEditorSurface();

      if (problem) {
        onPreview?.(problem, cancelEditing, editorApi);
        renderEditorSurface();
      } else {
        renderInvalidPreviewRoot({ root, article, route, message: status.textContent, onCancel: cancelEditing });
      }
    };

    const refreshVersionHistory = async () => {
      versions.disabled = true;
      updated.textContent = language === "en" ? "loading history..." : "이력 불러오는 중...";
      const result = await loadGitHubVersions({ initialXml: originalXml, mode, route, sourcePath });
      versionEntries = result.entries;
      renderVersionOptions(0);
      updated.textContent = result.latestLabel;
      versions.disabled = false;
    };

    const insertIndent = () => {
      const value = textarea.value;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || start;
      const indent = "  ";

      if (start !== end && value.slice(start, end).includes("\n")) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const selected = value.slice(lineStart, end);
        const replacement = selected.split("\n").map((line) => `${indent}${line}`).join("\n");
        textarea.value = value.slice(0, lineStart) + replacement + value.slice(end);
        textarea.setSelectionRange(start + indent.length, lineStart + replacement.length);
      } else {
        textarea.value = value.slice(0, start) + indent + value.slice(end);
        textarea.setSelectionRange(start + indent.length, start + indent.length);
      }

      pushHistory();
      sync();
    };

    const removeIndent = () => {
      const value = textarea.value;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || start;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const selected = value.slice(lineStart, end);
      const replacement = selected.split("\n").map((line) => line.replace(/^( {1,2}|\t)/, "")).join("\n");
      textarea.value = value.slice(0, lineStart) + replacement + value.slice(end);
      textarea.setSelectionRange(Math.max(lineStart, start - 2), lineStart + replacement.length);
      pushHistory();
      sync();
    };

    textarea.addEventListener("input", () => {
      requestPreviewReveal();
      pushHistory();
      sync();
    });
    textarea.addEventListener("scroll", syncScroll);
    textarea.addEventListener("click", () => renderEditorSurface({ revealPreview: true }));
    textarea.addEventListener("focus", () => renderEditorSurface({ revealPreview: true }));
    textarea.addEventListener("blur", () => {
      if (validateProblemXmlSilently(textarea.value, route, sourcePath)) {
        formatEditorValue();
      }
    });
    textarea.addEventListener("keyup", () => renderEditorSurface({ revealPreview: true }));
    textarea.addEventListener("mouseup", () => renderEditorSurface({ revealPreview: true }));
    textarea.addEventListener("select", () => renderEditorSurface({ revealPreview: true }));
    textarea.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!contribute.disabled) contribute.click();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!contribute.disabled) contribute.click();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        applyHistory(historyIndex + (event.shiftKey ? 1 : -1));
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        if (event.shiftKey) {
          removeIndent();
        } else {
          insertIndent();
        }
        return;
      }

      window.requestAnimationFrame(() => renderEditorSurface({ revealPreview: true }));
    });

    versions.addEventListener("change", () => {
      const version = versionEntries[Number(versions.value)];
      if (!version) return;
      setEditorValue(version.xml);
      status.dataset.state = "success";
      status.textContent = "";
    });

    close.addEventListener("click", togglePanelCollapse);
    back.addEventListener("click", () => applyHistory(historyIndex - 1));
    forward.addEventListener("click", () => applyHistory(historyIndex + 1));
    contribute.addEventListener("click", () => {
      if (contribute.disabled) return;
      formatEditorValue();
      if (textarea.value === originalXml) {
        sync();
        updateStateIndicator("clean");
        return;
      }
      const problem = validateEditorXml(textarea.value, route, sourcePath, status);
      if (!problem) return;
      currentPreviewProblem = problem;
      renderEditorSurface();
      onPreview?.(problem, cancelEditing, editorApi);
      renderEditorSurface();
      openSaveReviewModal({
        afterProblem: problem,
        afterXml: textarea.value,
        beforeProblem: validateProblemXmlSilently(originalXml, route, sourcePath),
        beforeXml: originalXml,
        language,
        onConfirm: async () => {
          const result = await publishXmlToGitHub({
            mode,
            route,
            sourcePath,
            xmlText: textarea.value
          });
          originalXml = textarea.value;
          history = [originalXml];
          historyIndex = 0;
          refreshHistoryButtons();
          sync();
          updateStateIndicator("clean");
          status.dataset.state = "success";
          status.textContent =
            result.prUrl && result.requiresManualReview
              ? (language === "en" ? `Pull request created for manual review: ${result.prUrl}` : `수동 심사용 Pull Request 생성됨: ${result.prUrl}`)
              : result.prUrl
                ? (language === "en" ? `Saved and merged: ${result.prUrl}` : `저장 및 머지 완료: ${result.prUrl}`)
              : "";
          await refreshVersionHistory();
        },
        route
      });
    });

    refreshHistoryButtons();
    sync();
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
    renderEditorSurface();
    textarea.focus({ preventScroll: true });
    void refreshVersionHistory();
  }

  function cancelActiveEditSession() {
    const cancel = activeEditorCancel;
    activeEditorCancel = null;
    cancel?.();
    closeExistingSideEditor();
  }

  function closeExistingSideEditor(options = {}) {
    activeEditorCancel = null;
    activeEditRouteKey = "";
    setEditingFavicon(false);
    document.querySelectorAll(".coderoot-review-overlay").forEach((overlay) => overlay.remove());
    document.querySelectorAll('.coderoot-side-section[data-coderoot-created-panel="true"]').forEach((panel) => panel.remove());
    activeInsertedDivider?.remove();
    activeInsertedDivider = null;

    if (activeOriginalEditorPanel) {
      const state = activeOriginalEditorPanel;
      const panel = state.panel;
      panel.replaceChildren(...state.children);
      panel.className = state.className;
      if (state.style === null) {
        panel.removeAttribute("style");
      } else {
        panel.setAttribute("style", state.style);
      }
      delete panel.dataset.coderootSidePanel;
      activeOriginalEditorPanel = null;

      if (options.triggerOriginalClose) {
        window.setTimeout(() => state.closeButton?.click(), 0);
      }
    }
  }

  async function createSideEditorPanel(article) {
    const base = findBaseLayout(article);
    let original = base ? findOriginalEditorPanel(base) : null;

    if (base && (!original || isEditorPanelCollapsed(original))) {
      const opener = findOriginalEditorOpenButton(base);
      opener?.click();
      if (opener) {
        await sleep(180);
        original = findOriginalEditorPanel(base) || original;
      }
    }

    if (original) {
      activeOriginalEditorPanel = {
        panel: original,
        children: Array.from(original.childNodes),
        className: original.className,
        style: original.getAttribute("style"),
        closeButton: findOriginalEditorCloseButton(original)
      };
      original.classList.add("coderoot-side-host-panel");
      original.dataset.coderootSidePanel = "true";
      original.style.setProperty("flex", "0 0 clamp(520px, 48vw, 920px)", "important");
      original.style.setProperty("max-width", "clamp(520px, 48vw, 920px)", "important");
      original.style.setProperty("min-width", "min(520px, calc(100vw - 24px))", "important");
      original.style.setProperty("transform", "translateX(0px)", "important");
      original.style.setProperty("width", "clamp(520px, 48vw, 920px)", "important");
      delete original.dataset.coderootCollapsed;
      original.replaceChildren();
      return original;
    }

    const panel = document.createElement("section");
    panel.className = "coderoot-side-section";
    panel.dataset.coderootSidePanel = "true";
    panel.dataset.coderootCreatedPanel = "true";

    const divider = document.createElement("div");
    divider.className = "coderoot-side-divider";
    activeInsertedDivider = divider;

    if (base) {
      base.append(divider, panel);
      return panel;
    }

    const fallbackParent = article?.parentElement || document.body;
    fallbackParent.append(panel);
    return panel;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isEditorPanelCollapsed(panel) {
    if (!panel) return true;
    const rect = panel.getBoundingClientRect();
    const style = window.getComputedStyle(panel);
    return (
      style.display === "none" ||
      style.visibility === "hidden" ||
      rect.width < 260 ||
      rect.right < 80 ||
      rect.left > window.innerWidth - 80
    );
  }

  function findOriginalEditorOpenButton(base) {
    const candidates = Array.from(document.querySelectorAll("button"))
      .filter((button) => !button.closest("[data-coderoot-root]") && !button.closest("[data-coderoot-editor]"));

    const textMatch = candidates.find((button) => {
      const text = normalizeText(button.textContent);
      const label = normalizeText(button.getAttribute("aria-label"));
      return text === "에디터" || text === "Editor" || label.includes("에디터") || label.toLowerCase().includes("editor");
    });
    if (textMatch) return textMatch;

    const baseButtons = Array.from(base.querySelectorAll("button"));
    return baseButtons.find((button) => {
      const html = String(button.innerHTML || "");
      const text = normalizeText(button.textContent);
      return text === "에디터" || html.includes("chevron-left") || html.includes("chevrons-left");
    }) || null;
  }

  function findOriginalEditorCloseButton(panel) {
    const buttons = Array.from(panel.querySelectorAll("button"));
    return buttons.find((button) => {
      const text = normalizeText(button.textContent);
      const label = normalizeText(button.getAttribute("aria-label"));
      const svgText = String(button.innerHTML || "");
      return label.includes("닫") || label.toLowerCase().includes("close") || text === "»" || svgText.includes("chevrons-right");
    }) || buttons[0] || null;
  }

  function findBaseLayout(article) {
    let node = article;
    while (node) {
      if (node.tagName === "SECTION" && node.id === "base") return node;
      node = node.parentElement;
    }

    const section = article?.closest("section");
    if (section?.parentElement?.tagName === "SECTION") return section.parentElement;

    return null;
  }

  function findOriginalEditorPanel(base) {
    const sections = Array.from(base.children).filter((child) => child.tagName === "SECTION");
    return sections.find((section) => {
      if (section.classList.contains("coderoot-side-section")) return false;
      const text = normalizeText(section.textContent);
      return section.querySelector(".monaco-editor") || section.querySelector("[data-mode-id]") || text.includes("코드 초기화") || text.includes("Code Reset");
    }) || null;
  }

  function renderPreviewRoot({ root, article, problem, route, onCancel, editorApi }) {
    root.className = "coderoot-shell coderoot-live-preview";
    root.dataset.coderootRoot = "true";
    root.dataset.coderootKey = routeKey(route);
    root.dataset.coderootSlug = route.slug;
    root.dataset.coderootLanguage = problem.language;
    root.dataset.coderootConceptLanguage = route.conceptLanguage;
    root.dataset.coderootSource = problem.sourcePath;
    root.dataset.coderootExpanded = "true";
    root.dataset.coderootStatus = "preview";

    const banner = document.createElement("div");
    banner.className = "coderoot-info coderoot-preview-banner";

    const icon = document.createElement("div");
    icon.className = "coderoot-info-icon";
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;

    const bannerText = document.createElement("p");
    bannerText.textContent =
      problem.language === "en"
        ? "Preview mode. XML edits are reflected live, and clicking a preview block jumps to the matching tag."
        : "미리보기 모드입니다. XML 수정 내용이 실시간으로 반영되며, 블록을 클릭하면 연결된 태그로 이동합니다.";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "coderoot-edit-button coderoot-preview-cancel";
    cancel.dataset.coderootCancel = "true";
    cancel.textContent = problem.language === "en" ? "Cancel Edit" : "수정 취소";
    cancel.addEventListener("click", () => onCancel?.());

    banner.append(icon, bannerText, cancel);

    const panel = document.createElement("div");
    panel.className = "coderoot-panel";

    const meta = document.createElement("p");
    meta.className = "coderoot-meta";
    meta.textContent = problem.badge;
    decoratePreviewScope(meta, {
      sourceKey: "meta-badge",
      sourceRange: problem.badgeRange,
      sourceTag: "badge"
    });

    const title = document.createElement("h2");
    title.className = "coderoot-title";
    title.textContent = problem.title;
    decoratePreviewScope(title, {
      sourceKey: "meta-title",
      sourceRange: problem.titleRange,
      sourceTag: "title"
    });

    const content = document.createElement("div");
    content.className = "coderoot-content";
    problem.blocks.forEach((block) => content.append(renderBlock(block)));

    panel.append(meta, title, content);
    root.replaceChildren(banner, panel);
    wirePreviewBlockInteractions(root, problem, editorApi);

    article.classList.add("coderoot-article");
    article.dataset.coderootExpanded = "true";
    article.dataset.coderootEditing = "true";
    article.closest("div")?.classList.add("coderoot-card-expanded");
    requestAnimationFrame(() => updateGradientTop(root, article));
  }

  function renderInvalidPreviewRoot({ root, article, route, message, onCancel }) {
    root.className = "coderoot-shell coderoot-live-preview coderoot-preview-invalid";
    root.dataset.coderootRoot = "true";
    root.dataset.coderootKey = routeKey(route);
    root.dataset.coderootSlug = route.slug;
    root.dataset.coderootLanguage = route.language;
    root.dataset.coderootConceptLanguage = route.conceptLanguage;
    root.dataset.coderootStatus = "invalid-preview";

    const panel = document.createElement("div");
    panel.className = "coderoot-missing-panel";

    const badge = document.createElement("p");
    badge.className = "coderoot-missing-badge";
    badge.textContent = route.language === "en" ? "Preview paused" : "미리보기 대기 중";

    const title = document.createElement("h2");
    title.className = "coderoot-missing-title";
    title.textContent =
      route.language === "en"
        ? "Fix the XML to render the preview."
        : "XML을 수정하면 이곳에 미리보기가 표시됩니다.";

    const body = document.createElement("p");
    body.className = "coderoot-missing-text";
    body.textContent = message || (route.language === "en" ? "The current XML is not renderable yet." : "현재 XML은 아직 렌더링할 수 없습니다.");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "coderoot-edit-button coderoot-edit-button-inline";
    cancel.dataset.coderootCancel = "true";
    cancel.textContent = route.language === "en" ? "Cancel Edit" : "수정 취소";
    cancel.addEventListener("click", () => onCancel?.());

    panel.append(badge, title, body, cancel);
    root.replaceChildren(panel);

    article.classList.add("coderoot-article");
    article.dataset.coderootExpanded = "true";
    article.dataset.coderootEditing = "true";
    article.closest("div")?.classList.add("coderoot-card-expanded");
    requestAnimationFrame(() => updateGradientTop(root, article));
  }

  function wirePreviewBlockInteractions(root, problem, editorApi) {
    if (!editorApi) return;

    root.querySelectorAll("[data-coderoot-preview-block]").forEach((element) => {
      const sourceKey = element.dataset.coderootPreviewKey || element.dataset.coderootPreviewBlock;
      const scope = getScopeByKey(problem, sourceKey);
      if (!scope?.sourceRange) return;

      element.addEventListener("mouseenter", () => {
        editorApi.setScopeIndex(sourceKey);
        editorApi.revealLine?.(scope.sourceRange.startLine);
      });
      element.addEventListener("mouseleave", () => editorApi.clearScopeIndex(sourceKey));
      element.addEventListener("click", (event) => {
        if (event.target?.closest?.("button, a")) return;
        editorApi.goToLine(scope.sourceRange.startLine);
      });
    });
  }

  function highlightPreviewBlock(root, sourceKey) {
    root.querySelectorAll("[data-coderoot-preview-block]").forEach((element) => {
      const key = element.dataset.coderootPreviewKey || element.dataset.coderootPreviewBlock;
      const active = sourceKey !== null && sourceKey !== undefined && key === String(sourceKey);
      element.dataset.coderootScopeActive = active ? "true" : "false";
    });
  }

  function revealPreviewBlock(root, sourceKey) {
    if (sourceKey === null || sourceKey === undefined) return;
    const target = Array.from(root.querySelectorAll("[data-coderoot-preview-block]")).find((element) => {
      const key = element.dataset.coderootPreviewKey || element.dataset.coderootPreviewBlock;
      return key === String(sourceKey);
    });
    if (!target || isMostlyInViewport(target)) return;
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }

  function isMostlyInViewport(element) {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const verticalPadding = Math.min(120, viewportHeight * 0.18);
    return (
      rect.top >= verticalPadding &&
      rect.bottom <= viewportHeight - verticalPadding &&
      rect.left >= 0 &&
      rect.right <= viewportWidth
    );
  }

  function getActiveLine(textarea) {
    const value = textarea.value || "";
    const selectionStart = Math.max(0, Math.min(value.length, textarea.selectionStart || 0));
    return value.slice(0, selectionStart).split("\n").length;
  }

  function createLineNumbers(xmlText, activeLine = 1, scopeBlock = null, editorError = null) {
    const count = Math.max(1, String(xmlText).split("\n").length);
    return Array.from({ length: count }, (_value, index) => {
      const line = index + 1;
      const classNames = ["coderoot-side-gutter-line"];
      if (isLineInSourceRange(line, scopeBlock?.sourceRange)) classNames.push("coderoot-side-gutter-line-scope");
      if (line === editorError?.line) classNames.push("coderoot-side-gutter-line-error");
      if (line === activeLine) classNames.push("coderoot-side-gutter-line-active");
      const className = classNames.join(" ");
      const title = line === editorError?.line ? ` title="${escapeHtml(editorError.message)}"` : "";
      return `<span class="${className}"${title}>${line}</span>`;
    }).join("");
  }

  function offsetForLine(text, line) {
    const targetLine = Math.max(1, Number(line) || 1);
    if (targetLine === 1) return 0;

    let offset = 0;
    for (let currentLine = 1; currentLine < targetLine; currentLine += 1) {
      const nextBreak = String(text).indexOf("\n", offset);
      if (nextBreak === -1) return String(text).length;
      offset = nextBreak + 1;
    }
    return offset;
  }

  function getPreviewScopes(problem) {
    if (!problem) return [];
    const scopes = [];

    if (problem.badgeRange) {
      scopes.push({
        sourceKey: "meta-badge",
        sourceRange: problem.badgeRange,
        sourceTag: "badge"
      });
    }

    if (problem.titleRange) {
      scopes.push({
        sourceKey: "meta-title",
        sourceRange: problem.titleRange,
        sourceTag: "title"
      });
    }

    return scopes.concat(problem.blocks || []);
  }

  function getScopeByKey(problem, sourceKey) {
    if (!problem || sourceKey === null || sourceKey === undefined) return null;
    const key = String(sourceKey);
    return getPreviewScopes(problem).find((scope) => String(scope.sourceKey ?? scope.sourceIndex) === key) || null;
  }

  function findScopeByLine(problem, line) {
    if (!problem) return null;
    return getPreviewScopes(problem).find((scope) => isLineInSourceRange(line, scope.sourceRange)) || null;
  }

  function validateEditorXml(xmlText, route, sourcePath, status, options = {}) {
    try {
      const problem = {
        ...parseProblemXml(xmlText, route, sourcePath),
        xmlText
      };
      status.dataset.state = "success";
      delete status.dataset.errorLine;
      delete status.dataset.errorColumn;
      status.textContent = "";
      return problem;
    } catch (error) {
      status.dataset.state = "error";
      if (error.line) {
        status.dataset.errorLine = String(error.line);
      } else {
        delete status.dataset.errorLine;
      }
      if (error.column) {
        status.dataset.errorColumn = String(error.column);
      } else {
        delete status.dataset.errorColumn;
      }
      status.textContent = error.message || (route.language === "en" ? "The XML is not valid." : "XML이 올바르지 않습니다.");
      return null;
    }
  }

  function editorErrorFromStatus(status) {
    const line = Number(status.dataset.errorLine || 0);
    if (!line) return null;
    return {
      column: Number(status.dataset.errorColumn || 0) || null,
      line,
      message: status.textContent || ""
    };
  }

  function validateProblemXmlSilently(xmlText, route, sourcePath) {
    try {
      return {
        ...parseProblemXml(xmlText, route, sourcePath),
        xmlText
      };
    } catch {
      return null;
    }
  }


  function openSaveReviewModal({ afterProblem, afterXml, beforeProblem, beforeXml, language, onConfirm, route }) {
    document.querySelectorAll(".coderoot-review-overlay").forEach((overlay) => overlay.remove());

    const overlay = document.createElement("div");
    overlay.className = "coderoot-review-overlay";

    const dialog = document.createElement("section");
    dialog.className = "coderoot-review-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const header = document.createElement("div");
    header.className = "coderoot-review-header";

    const heading = document.createElement("div");
    heading.className = "coderoot-review-heading";
    const title = document.createElement("h2");
    title.textContent = language === "en" ? "Review before saving" : "저장 전 변경사항 확인";
    const subtitle = document.createElement("p");
    subtitle.textContent =
      language === "en"
        ? "Check the exact diff, then switch to the rendered preview before saving."
        : "정확한 변경점을 확인한 뒤 렌더링된 미리보기도 함께 확인하세요.";
    heading.append(title, subtitle);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "coderoot-review-icon-button";
    close.title = language === "en" ? "Close (Esc)" : "닫기 (Esc)";
    close.setAttribute("aria-label", close.title);
    close.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
    header.append(heading, close);

    const filePath = afterProblem?.sourcePath || beforeProblem?.sourcePath || getRouteContentPath(route);

    const xmlPane = document.createElement("div");
    xmlPane.className = "coderoot-review-pane";
    xmlPane.dataset.active = "true";

    const previewPane = document.createElement("div");
    previewPane.className = "coderoot-review-pane";
    previewPane.dataset.active = "false";

    const body = document.createElement("div");
    body.className = "coderoot-review-body";
    body.append(xmlPane, previewPane);

    const footer = document.createElement("div");
    footer.className = "coderoot-review-footer";

    const error = document.createElement("p");
    error.className = "coderoot-review-save-error";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "coderoot-review-primary";
    save.title = language === "en" ? "Save (⌘+↵ / Ctrl+↵)" : "저장하기 (⌘+↵ / Ctrl+↵)";
    save.setAttribute("aria-label", save.title);
    save.innerHTML = `<span>${language === "en" ? "Save" : "저장하기"}</span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 13v8"></path><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="m8 17 4-4 4 4"></path></svg>`;
    footer.append(error, save);

    const setActivePane = (target) => {
      const showXml = target === "xml";
      xmlPane.dataset.active = String(showXml);
      previewPane.dataset.active = String(!showXml);
    };

    xmlPane.append(renderXmlDiff(beforeXml, afterXml, filePath, language, () => setActivePane("preview")));
    previewPane.append(renderPreviewDiff(beforeProblem, afterProblem, language, route, () => setActivePane("xml")));

    const closeModal = () => {
      document.removeEventListener("keydown", handleModalKeydown, true);
      overlay.remove();
    };
    let saving = false;
    const confirmSave = async () => {
      if (saving) return;
      saving = true;
      error.textContent = "";
      save.disabled = true;
      save.querySelector("span").textContent = language === "en" ? "Saving..." : "저장 중...";
      try {
        await onConfirm?.();
        closeModal();
      } catch (saveError) {
        error.textContent = saveError?.coderootSilent ? "" : (saveError?.message || (language === "en" ? "Save failed." : "저장에 실패했습니다."));
        save.disabled = false;
        save.querySelector("span").textContent = language === "en" ? "Save" : "저장하기";
        saving = false;
      }
    };
    const handleModalKeydown = (event) => {
      if (!document.body.contains(overlay)) {
        document.removeEventListener("keydown", handleModalKeydown, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        confirmSave();
      }
    };

    close.addEventListener("click", closeModal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModal();
    });
    save.addEventListener("click", confirmSave);
    document.addEventListener("keydown", handleModalKeydown, true);

    dialog.append(header, body, footer);
    overlay.append(dialog);
    document.body.append(overlay);
  }

  function getRouteContentPath(route) {
    return `${route.slug}/${route.contentConceptKey || getContentConceptKey(route.conceptLanguageKey)}.${route.language}.xml`;
  }

  function isContentXmlPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/").replace(/^content\//, "");
    return /^[^/]+\/[^/]+\.xml$/.test(normalized) && !normalized.includes("..");
  }

  function createReviewModeButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "coderoot-review-mode-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderXmlDiff(beforeXml, afterXml, filePath, language, onPreview) {
    const wrapper = document.createElement("div");
    wrapper.className = "coderoot-review-diff";

    const file = document.createElement("div");
    file.className = "coderoot-review-file-header";

    const fileName = document.createElement("p");
    fileName.className = "coderoot-review-file-name";
    fileName.textContent = filePath;
    file.append(fileName, createReviewModeButton(language === "en" ? "Preview" : "미리보기", onPreview));

    const code = document.createElement("div");
    code.className = "coderoot-review-code";
    const lines = document.createElement("div");
    lines.className = "coderoot-review-code-lines";
    lines.append(...buildUnifiedDiff(beforeXml, afterXml).map(renderUnifiedDiffRow));
    code.append(lines);

    wrapper.append(file, code);
    return wrapper;
  }

  function renderUnifiedDiffRow(row) {
    const line = document.createElement("div");
    line.className = `coderoot-review-line coderoot-review-line-${row.type}`;

    if (row.type === "hunk") {
      const hunk = document.createElement("span");
      hunk.className = "coderoot-review-hunk";
      hunk.textContent = row.text;
      line.append(hunk);
      return line;
    }

    const oldNumber = document.createElement("span");
    oldNumber.className = "coderoot-review-line-number";
    oldNumber.textContent = row.oldLine ? String(row.oldLine) : "";

    const newNumber = document.createElement("span");
    newNumber.className = "coderoot-review-line-number";
    newNumber.textContent = row.newLine ? String(row.newLine) : "";

    const marker = document.createElement("span");
    marker.className = "coderoot-review-marker";
    marker.textContent = row.type === "add" ? "+" : row.type === "remove" ? "-" : "";

    const code = document.createElement("span");
    code.className = "coderoot-review-line-code";
    appendDiffText(code, row.fragments, row.text);

    line.append(oldNumber, newNumber, marker, code);
    return line;
  }

  function appendDiffText(parent, fragments, fallbackText) {
    const list = fragments?.length ? fragments : [{ text: fallbackText ?? "", changed: false }];
    list.forEach((fragment) => {
      if (!fragment.changed) {
        parent.append(document.createTextNode(fragment.text));
        return;
      }

      const span = document.createElement("span");
      span.className = "coderoot-review-inline-change";
      span.textContent = fragment.text;
      parent.append(span);
    });
  }

  function renderPreviewDiff(beforeProblem, afterProblem, language, route, onXml) {
    const wrapper = document.createElement("div");
    wrapper.className = "coderoot-review-preview-shell";

    const header = document.createElement("div");
    header.className = "coderoot-review-file-header coderoot-review-preview-header";

    const labels = document.createElement("div");
    labels.className = "coderoot-review-preview-heading-grid";

    const beforeLabel = document.createElement("p");
    beforeLabel.textContent = language === "en" ? "Before" : "이전";

    const afterLabel = document.createElement("p");
    afterLabel.textContent = language === "en" ? "After" : "이후";

    labels.append(beforeLabel, afterLabel);
    header.append(labels, createReviewModeButton(language === "en" ? "XML diff" : "XML 변경점", onXml));

    const grid = document.createElement("div");
    grid.className = "coderoot-review-preview-grid";
    grid.append(
      renderPreviewSnapshot(beforeProblem, route),
      renderPreviewSnapshot(afterProblem, route)
    );

    wrapper.append(header, grid);
    return wrapper;
  }

  function renderPreviewSnapshot(problem, route) {
    const section = document.createElement("section");
    section.className = "coderoot-review-preview";

    if (!problem) {
      const empty = document.createElement("p");
      empty.className = "coderoot-review-empty";
      empty.textContent = route.language === "en" ? "No previous renderable preview." : "이전에 렌더링할 수 있는 미리보기가 없습니다.";
      section.append(empty);
      return section;
    }

    const meta = document.createElement("p");
    meta.className = "coderoot-meta";
    meta.textContent = problem.badge;

    const title = document.createElement("h2");
    title.className = "coderoot-title";
    title.textContent = problem.title;

    const content = document.createElement("div");
    content.className = "coderoot-content";
    problem.blocks.forEach((block) => content.append(renderBlock(block)));

    section.append(meta, title, content);
    return section;
  }


  function updateGradientTop(root, article) {
    const rootBox = root.getBoundingClientRect();
    const articleBox = article.getBoundingClientRect();
    const scrollTop = article.scrollTop || 0;
    const top = Math.max(0, rootBox.top - articleBox.top + scrollTop - 2);
    article.style.setProperty("--coderoot-gradient-top", `${top}px`);
  }

  function renderBlock(block) {
    let element;

    if (block.type === "heading") {
      const level = block.level === 4 ? "h4" : "h3";
      const heading = document.createElement(level);
      heading.className = "coderoot-heading";
      heading.textContent = block.text;
      element = heading;
      return decoratePreviewBlock(element, block);
    }

    if (block.type === "list") {
      const list = document.createElement(block.ordered ? "ol" : "ul");
      list.className = "coderoot-list";
      block.items.forEach((item) => {
        const li = document.createElement("li");
        appendInline(li, item);
        list.append(li);
      });
      element = list;
      return decoratePreviewBlock(element, block);
    }

    if (block.type === "code") {
      element = renderCodeBlock(block);
      return decoratePreviewBlock(element, block);
    }

    if (block.type === "callout") {
      const callout = document.createElement("div");
      callout.className = "coderoot-callout";
      callout.dataset.tone = block.tone || "default";
      appendInline(callout, block.children);
      element = callout;
      return decoratePreviewBlock(element, block);
    }

    const paragraph = document.createElement("p");
    paragraph.className = "coderoot-paragraph";
    appendInline(paragraph, block.children);
    element = paragraph;
    return decoratePreviewBlock(element, block);
  }

  function decoratePreviewBlock(element, block) {
    return decoratePreviewScope(element, {
      sourceKey: block.sourceKey || `content-${block.sourceIndex ?? ""}`,
      sourceRange: block.sourceRange,
      sourceTag: block.sourceRange?.tagName || block.type || ""
    });
  }

  function decoratePreviewScope(element, scope) {
    element.dataset.coderootPreviewBlock = String(scope.sourceKey || "");
    element.dataset.coderootPreviewKey = String(scope.sourceKey || "");
    element.dataset.coderootSourceTag = scope.sourceTag || scope.sourceRange?.tagName || "";
    if (scope.sourceRange) {
      element.dataset.coderootSourceStart = String(scope.sourceRange.startLine);
      element.dataset.coderootSourceEnd = String(scope.sourceRange.endLine);
    }
    return element;
  }

  function appendInline(parent, children = []) {
    children.forEach((child) => {
      if (typeof child === "string") {
        parent.append(document.createTextNode(child));
        return;
      }

      if (child?.type === "code") {
        const code = document.createElement("code");
        code.textContent = child.text;
        parent.append(code);
        return;
      }

      if (child?.type === "strong") {
        const strong = document.createElement("strong");
        appendInline(strong, child.children);
        parent.append(strong);
        return;
      }

      if (child?.type === "em") {
        const em = document.createElement("em");
        appendInline(em, child.children);
        parent.append(em);
        return;
      }

      if (child?.type === "br") {
        parent.append(document.createElement("br"));
        return;
      }

      if (child?.type === "link") {
        const href = child.href || "";
        const link = document.createElement("a");
        link.rel = "noreferrer noopener";
        link.target = "_blank";
        link.href = /^(https?:)?\/\//.test(href) ? href : "#";
        appendInline(link, child.children);
        parent.append(link);
      }
    });
  }

  function renderCodeBlock(block) {
    const wrapper = document.createElement("div");
    wrapper.className = "coderoot-code-block mt-8 bg-neutral-50 dark:bg-neutral-800 rounded-8 border border-stroke-lighter dark:border-neutral-600 relative group";

    const copyWrap = document.createElement("div");
    copyWrap.className = "coderoot-copy-wrap";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "coderoot-copy";
    const copyLabel = getUiLanguage() === "en" ? "Copy" : "복사";
    copy.title = copyLabel;
    copy.setAttribute("aria-label", copyLabel);
    copy.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`;
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(block.code);
        copy.dataset.copied = "true";
        window.setTimeout(() => {
          delete copy.dataset.copied;
        }, 900);
      } catch {
        copy.dataset.failed = "true";
        window.setTimeout(() => {
          delete copy.dataset.failed;
        }, 900);
      }
    });

    const flex = document.createElement("div");
    flex.className = "flex";

    const pre = document.createElement("pre");
    pre.className = "py-12 px-16 pr-20 flex w-fit whitespace-pre break-keep";

    const code = document.createElement("code");
    code.className = block.language ? `language-${block.language} code-highlight` : "code-highlight";
    code.innerHTML = highlightCodeBlock(block.code, block.language);

    pre.append(code);
    flex.append(pre);
    copyWrap.append(copy);
    wrapper.append(copyWrap, flex);

    return wrapper;
  }

  function highlightCodeBlock(code, language = "") {
    const isCpp = /^(c\+\+|cpp|cc|cxx)$/i.test(language || "");
    return String(code || "").split("\n").map((line) => {
      const highlighted = isCpp ? highlightCppLine(line) : escapeHtml(line);
      return `<span class="code-line">${highlighted}\n</span>`;
    }).join("");
  }

  function highlightCppLine(line) {
    const escaped = escapeHtml(line);
    const leading = escaped.match(/^\s*/)?.[0] || "";
    const trimmed = escaped.slice(leading.length);

    if (trimmed.startsWith("#include")) {
      return `${leading}<span class="token macro property"><span class="token directive-hash">#</span><span class="token directive keyword">include</span>${trimmed.slice("#include".length).replace(/(&lt;.*?&gt;|&quot;.*?&quot;)/, '<span class="token string">$1</span>')}</span>`;
    }

    const protectedParts = [];
    const protect = (className) => (match) => {
      const token = `\uE000${String.fromCharCode(0xE100 + protectedParts.length)}\uE001`;
      protectedParts.push(`<span class="${className}">${match}</span>`);
      return token;
    };

    return escaped
      .replace(/\/\/.*$/g, protect("token comment"))
      .replace(/(&quot;(?:\\.|[^\\])*?&quot;|'(?:\\.|[^\\])*?')/g, protect("token string"))
      .replace(/\b(int|long|double|float|char|bool|void|return|if|else|for|while|using|namespace|include|const|auto|std)\b/g, protect("token keyword"))
      .replace(/\b(\d+(?:\.\d+)?)\b/g, protect("token number"))
      .replace(/\b([A-Za-z_]\w*)(?=\s*\()/g, protect("token function"))
      .replace(/(&lt;&lt;|&gt;&gt;|==|!=|&lt;=|&gt;=|\+\+|--|\+|-|\*|\/|=|&lt;|&gt;)/g, protect("token operator"))
      .replace(/([{}()[\];,.])/g, protect("token punctuation"))
      .replace(/\uE000([\uE100-\uEFFF])\uE001/g, (_match, marker) => protectedParts[marker.charCodeAt(0) - 0xE100] || "");
  }

  if (!disableWatchers) {
    const observer = new MutationObserver(() => scheduleApply());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener("popstate", () => scheduleApply(0));
    window.addEventListener("hashchange", () => scheduleApply(0));

    window.setInterval(() => {
      const baseRoute = parseRoute();
      const targets = baseRoute ? findContentTargets(baseRoute) : null;
      const key = routeKey(baseRoute && targets ? withDetectedConceptLanguage(baseRoute, targets.contentRoot) : baseRoute);
      if (key !== lastRouteKey) scheduleApply(0);
    }, ROUTE_CHECK_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleApply(0), { once: true });
  } else {
    scheduleApply(0);
  }
})();
