import { ensureAllowedLogin, exchangeCodeForUser } from "../../_lib/github.js";
import { createSession, readSession } from "../../_lib/session.js";
import { getRequestUrl, sendHtml } from "../../_lib/http.js";

export default async function handler(req, res) {
  let returnOrigin = "https://www.codetree.ai";
  try {
    const requestUrl = getRequestUrl(req);
    const code = requestUrl.searchParams.get("code") || "";
    const stateToken = requestUrl.searchParams.get("state") || "";
    const state = readSession(stateToken);
    if (state.type !== "github-oauth-state" || !state.origin || !state.redirectUri) {
      const error = new Error("GitHub authorization state is invalid.");
      error.status = 401;
      throw error;
    }
    returnOrigin = state.origin;
    if (!code) {
      const error = new Error("GitHub authorization was cancelled.");
      error.status = 401;
      throw error;
    }

    const user = await exchangeCodeForUser(code, state.redirectUri);
    ensureAllowedLogin(user.login);
    const sessionToken = createSession({
      login: user.login,
      type: "coderoot-github-session"
    });

    sendHtml(res, 200, renderCallbackPage({
      login: user.login,
      origin: state.origin,
      token: sessionToken
    }));
  } catch (error) {
    sendHtml(res, error.status || 500, renderCallbackPage({
      error: error.message || "GitHub authorization failed.",
      origin: returnOrigin
    }));
  }
}

function renderCallbackPage({ error = "", login = "", origin, token = "" }) {
  const payload = JSON.stringify({
    error,
    login,
    source: "coderoot",
    token,
    type: error ? "github.error" : "github.connected"
  }).replace(/</g, "\\u003c");
  const safeOrigin = JSON.stringify(origin || "https://www.codetree.ai");
  const title = error ? "Coderoot GitHub connection failed" : "Coderoot GitHub connected";
  const message = error || `Connected as ${login}. You can close this window.`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { align-items: center; display: flex; min-height: 100vh; justify-content: center; margin: 0; padding: 24px; }
      main { border: 1px solid #d4d4d8; border-radius: 14px; max-width: 480px; padding: 28px; text-align: center; }
      h1 { font-size: 20px; margin: 0 0 12px; }
      p { color: #71717a; line-height: 1.6; margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
    <script>
      const payload = ${payload};
      const targetOrigin = ${safeOrigin};
      if (window.opener) {
        window.opener.postMessage(payload, targetOrigin);
        window.setTimeout(() => window.close(), 500);
      }
    </script>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}
