import { GITHUB_API_BASE, GITHUB_CONTENT_URL_BASE } from "./config.js";

const CODEROOT_SESSION_STORAGE_KEY = "coderoot.githubAppSession";
const CODEROOT_SESSION_LOGIN_STORAGE_KEY = "coderoot.githubAppLogin";

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

  if (message.type === "coderoot.open.url") {
    return openExternalUrl(message.url);
  }

  throw new Error(`Unknown Coderoot message: ${message.type}`);
}

async function openExternalUrl(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  const githubBase = new URL(GITHUB_CONTENT_URL_BASE);
  if (url.origin !== githubBase.origin || !url.pathname.startsWith(githubBase.pathname)) {
    throw new Error("Coderoot can only open configured GitHub content URLs.");
  }

  await chrome.tabs.create({ url: url.href });
  return { opened: true };
}

async function requestGitHub({ endpoint, method = "GET", body = null, auth = true }) {
  if (!String(endpoint || "").startsWith("/")) {
    throw new Error("GitHub API endpoint must start with '/'.");
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const error = new Error("Authenticated GitHub requests are handled by the Coderoot API.");
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
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
