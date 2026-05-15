import { applyCors, getBearerToken, requireMethod, sendError, sendJson } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";

export default function handler(req, res) {
  try {
    if (applyCors(req, res)) return;
    requireMethod(req, "GET");

    const session = readSession(getBearerToken(req));
    if (session.type !== "coderoot-github-session") {
      const error = new Error("GitHub session is invalid. Connect GitHub again.");
      error.status = 401;
      throw error;
    }

    sendJson(res, 200, {
      expiresAt: session.exp || 0,
      login: session.login || ""
    });
  } catch (error) {
    sendError(res, error);
  }
}
