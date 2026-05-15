import { getGitHubAuthorizeUrl } from "../../_lib/github.js";
import { createSession } from "../../_lib/session.js";
import { applyCors, getRequestUrl, getSafeReturnOrigin, requireMethod, sendError } from "../../_lib/http.js";

export default function handler(req, res) {
  try {
    if (applyCors(req, res)) return;
    requireMethod(req, "GET");

    const requestUrl = getRequestUrl(req);
    const origin = getSafeReturnOrigin(requestUrl.searchParams.get("origin"));
    const redirectUri = new URL("/api/auth/github/callback", requestUrl.origin).href;
    const state = createSession({
      origin,
      redirectUri,
      type: "github-oauth-state"
    }, 60 * 10);

    res.statusCode = 302;
    res.setHeader("Location", getGitHubAuthorizeUrl({ redirectUri, state }));
    res.end();
  } catch (error) {
    sendError(res, error);
  }
}
