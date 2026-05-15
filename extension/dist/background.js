(() => {
  // extension/src/js/config.js
  var GITHUB_OWNER = "kommiter";
  var GITHUB_REPO = "coderoot";
  var GITHUB_DEFAULT_BRANCH = "main";
  var GITHUB_API_BASE = "https://api.github.com";
  var REMOTE_CONTENT_URL_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_DEFAULT_BRANCH}/content/`;
  var GITHUB_CONTENT_URL_BASE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_DEFAULT_BRANCH}/`;

  // extension/src/js/background.js
  var CODEROOT_SESSION_STORAGE_KEY = "coderoot.githubAppSession";
  var CODEROOT_SESSION_LOGIN_STORAGE_KEY = "coderoot.githubAppLogin";
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(
      (data) => sendResponse({ ok: true, data }),
      (error) => sendResponse({ ok: false, error: serializeError(error) })
    );
    return true;
  });
  async function handleMessage(message) {
    if (!message || typeof message !== "object") {
      throw new Error("Invalid Coderoot message.");
    }
    if (message.type === "coderoot.session.get") {
      const result = await chrome.storage.local.get([CODEROOT_SESSION_STORAGE_KEY, CODEROOT_SESSION_LOGIN_STORAGE_KEY]);
      return {
        hasSession: Boolean(result[CODEROOT_SESSION_STORAGE_KEY]),
        login: result[CODEROOT_SESSION_LOGIN_STORAGE_KEY] || "",
        token: result[CODEROOT_SESSION_STORAGE_KEY] || ""
      };
    }
    if (message.type === "coderoot.session.set") {
      const token = String(message.token || "").trim();
      if (!token) throw new Error("Coderoot session token is empty.");
      await chrome.storage.local.set({
        [CODEROOT_SESSION_LOGIN_STORAGE_KEY]: String(message.login || "").trim(),
        [CODEROOT_SESSION_STORAGE_KEY]: token
      });
      return { hasSession: true };
    }
    if (message.type === "coderoot.session.clear") {
      await chrome.storage.local.remove([CODEROOT_SESSION_STORAGE_KEY, CODEROOT_SESSION_LOGIN_STORAGE_KEY]);
      return { hasSession: false };
    }
    if (message.type === "coderoot.github.api") {
      return requestGitHub(message);
    }
    throw new Error(`Unknown Coderoot message: ${message.type}`);
  }
  async function requestGitHub({ endpoint, method = "GET", body = null, auth = true }) {
    if (!String(endpoint || "").startsWith("/")) {
      throw new Error("GitHub API endpoint must start with '/'.");
    }
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (body !== null && body !== void 0) {
      headers["Content-Type"] = "application/json";
    }
    if (auth) {
      const error = new Error("Authenticated GitHub requests are handled by the Coderoot API.");
      error.status = 401;
      throw error;
    }
    const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      body: body === null || body === void 0 ? void 0 : JSON.stringify(body),
      headers,
      method
    });
    const text = await response.text();
    const data = text ? parseJson(text) : null;
    if (!response.ok) {
      const error = new Error(data?.message || text || `GitHub API request failed with ${response.status}.`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return { data, status: response.status };
  }
  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  function serializeError(error) {
    return {
      data: error?.data || null,
      message: error?.message || String(error),
      status: error?.status || 0
    };
  }
})();
