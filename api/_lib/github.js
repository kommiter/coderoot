import { createSign } from "node:crypto";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_WEB_BASE = "https://github.com";
const GITHUB_API_VERSION = "2022-11-28";

export function getRepositoryConfig() {
  return {
    branch: process.env.GITHUB_DEFAULT_BRANCH || "main",
    owner: process.env.GITHUB_OWNER || "kommiter",
    repo: process.env.GITHUB_REPO || "coderoot"
  };
}

export function ensureAllowedLogin(login) {
  const raw = process.env.CODEROOT_ALLOWED_GITHUB_LOGINS || "kommiter";
  const allowed = raw.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowed.includes("*") || allowed.includes(String(login || "").toLowerCase())) return;
  const error = new Error("This GitHub account is not allowed to save Coderoot content.");
  error.status = 403;
  throw error;
}

export function getGitHubAuthorizeUrl({ redirectUri, state }) {
  const url = new URL("/login/oauth/authorize", GITHUB_WEB_BASE);
  url.searchParams.set("client_id", requiredEnv("GITHUB_APP_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.href;
}

export async function exchangeCodeForUser(code, redirectUri) {
  const response = await fetch(`${GITHUB_WEB_BASE}/login/oauth/access_token`, {
    body: JSON.stringify({
      client_id: requiredEnv("GITHUB_APP_CLIENT_ID"),
      client_secret: requiredEnv("GITHUB_APP_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const data = await parseGitHubResponse(response);
  const token = data.access_token;
  if (!token) {
    const error = new Error(data.error_description || data.error || "GitHub did not return a user access token.");
    error.status = 401;
    throw error;
  }

  const user = await githubRequest("/user", {
    token
  });
  return {
    login: user.login || "",
    token
  };
}

export async function publishXmlWithGitHubApp({ actor, mode, route, sourcePath, xmlText }) {
  const { branch, owner, repo } = getRepositoryConfig();
  validateContentPath(sourcePath);
  const appToken = await getInstallationAccessToken();
  const conceptKey = sanitizeBranchPart(route?.contentConceptKey || route?.conceptLanguageKey || "content");
  const branchName = `coderoot/${sanitizeBranchPart(route?.slug)}-${conceptKey}-${sanitizeBranchPart(route?.language)}-${Date.now()}`;
  const baseRef = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${encodePathPart(branch)}`, {
    token: appToken
  });
  const baseSha = baseRef?.object?.sha;
  if (!baseSha) {
    const error = new Error("Could not read the default branch.");
    error.status = 502;
    throw error;
  }

  await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
    body: {
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    },
    method: "POST",
    token: appToken
  });

  let existingSha = null;
  try {
    const existingFile = await githubRequest(`/repos/${owner}/${repo}/contents/${encodeGitHubPath(sourcePath)}?ref=${encodeURIComponent(branchName)}`, {
      token: appToken
    });
    existingSha = existingFile.sha || null;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const action = mode === "create" ? "Add" : "Update";
  const commitMessage = `${action} Coderoot content for ${route?.slug || sourcePath}`;
  const fileBody = {
    branch: branchName,
    content: Buffer.from(xmlText, "utf8").toString("base64"),
    message: commitMessage
  };
  if (existingSha) fileBody.sha = existingSha;

  await githubRequest(`/repos/${owner}/${repo}/contents/${encodeGitHubPath(sourcePath)}`, {
    body: fileBody,
    method: "PUT",
    token: appToken
  });

  const pullRequest = await githubRequest(`/repos/${owner}/${repo}/pulls`, {
    body: {
      base: branch,
      body: [
        "Automated Coderoot content update.",
        "",
        `- Path: \`${sourcePath}\``,
        `- Codetree slug: \`${route?.slug || ""}\``,
        `- Site language: \`${route?.language || ""}\``,
        `- Concept language: \`${route?.conceptLanguage || ""}\``,
        `- Requested by: \`${actor || "unknown"}\``,
        "- Policy: `content XML changes may be auto-merged; other repository changes require manual review.`"
      ].join("\n"),
      head: branchName,
      title: commitMessage
    },
    method: "POST",
    token: appToken
  });

  const pullNumber = pullRequest.number;
  if (!pullNumber) {
    const error = new Error("Pull request was not created.");
    error.status = 502;
    throw error;
  }

  let merged = null;
  try {
    merged = await mergePullRequestWithRetry({ appToken, commitMessage, owner, pullNumber, repo });
    await deleteBranch({ appToken, branchName, owner, repo });
  } catch (error) {
    return {
      merged: false,
      mergeSha: "",
      prNumber: pullNumber,
      prUrl: pullRequest.html_url || "",
      requiresManualReview: true,
      reviewReason: error.message || "Auto-merge failed."
    };
  }

  return {
    merged: Boolean(merged?.merged),
    mergeSha: merged?.sha || "",
    prNumber: pullNumber,
    prUrl: pullRequest.html_url || "",
    requiresManualReview: false
  };
}

async function getInstallationAccessToken() {
  const { owner, repo } = getRepositoryConfig();
  const jwt = createAppJwt();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID || await getRepositoryInstallationId({ jwt, owner, repo });
  const data = await githubRequest(`/app/installations/${installationId}/access_tokens`, {
    body: {
      permissions: {
        contents: "write",
        metadata: "read",
        pull_requests: "write"
      },
      repositories: [repo]
    },
    method: "POST",
    token: jwt
  });
  if (!data.token) {
    const error = new Error("GitHub did not return an installation token.");
    error.status = 502;
    throw error;
  }
  return data.token;
}

async function getRepositoryInstallationId({ jwt, owner, repo }) {
  const installation = await githubRequest(`/repos/${owner}/${repo}/installation`, {
    token: jwt
  });
  if (!installation.id) {
    const error = new Error("GitHub App is not installed on the content repository.");
    error.status = 502;
    throw error;
  }
  return installation.id;
}

function createAppJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64urlJson({
    exp: now + 540,
    iat: now - 60,
    iss: requiredEnv("GITHUB_APP_ID")
  });
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(getPrivateKey(), "base64url")}`;
}

async function mergePullRequestWithRetry({ appToken, commitMessage, owner, pullNumber, repo }) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await githubRequest(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, {
        body: {
          commit_title: commitMessage,
          merge_method: "squash"
        },
        method: "PUT",
        token: appToken
      });
    } catch (error) {
      lastError = error;
      if (![405, 409, 422].includes(Number(error.status))) throw error;
      await sleep(900 + attempt * 700);
    }
  }
  throw lastError || new Error("GitHub merge failed.");
}

async function deleteBranch({ appToken, branchName, owner, repo }) {
  try {
    await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${encodeGitHubRef(branchName)}`, {
      method: "DELETE",
      token: appToken
    });
  } catch {
    // Keeping a temporary branch is acceptable when GitHub refuses deletion.
  }
}

async function githubRequest(endpoint, { body = null, method = "GET", token }) {
  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      ...(body === null || body === undefined ? {} : { "Content-Type": "application/json" }),
      "X-GitHub-Api-Version": GITHUB_API_VERSION
    },
    method
  });
  return parseGitHubResponse(response);
}

async function parseGitHubResponse(response) {
  const text = await response.text();
  const data = text ? parseJson(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || text || `GitHub request failed with ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data || {};
}

function validateContentPath(sourcePath) {
  const normalized = String(sourcePath || "").replace(/\\/g, "/");
  if (!/^content\/[^/]+\/[^/]+\.xml$/.test(normalized) || normalized.includes("..")) {
    const error = new Error("Coderoot API only accepts matched content XML files.");
    error.status = 400;
    throw error;
  }
}

function getPrivateKey() {
  const key = requiredEnv("GITHUB_APP_PRIVATE_KEY");
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function encodeGitHubPath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

function encodeGitHubRef(ref) {
  return String(ref).split("/").map(encodeURIComponent).join("/");
}

function encodePathPart(part) {
  return encodeURIComponent(part);
}

function sanitizeBranchPart(value) {
  return String(value || "content")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "content";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
