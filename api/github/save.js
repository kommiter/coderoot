import { ensureAllowedLogin, publishXmlWithGitHubApp } from "../_lib/github.js";
import { applyCors, getBearerToken, readJson, requireMethod, sendError, sendJson } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";

export default async function handler(req, res) {
  try {
    if (applyCors(req, res)) return;
    requireMethod(req, "POST");

    const session = readSession(getBearerToken(req));
    if (session.type !== "coderoot-github-session") {
      const error = new Error("GitHub session is invalid. Connect GitHub again.");
      error.status = 401;
      throw error;
    }
    ensureAllowedLogin(session.login);

    const body = await readJson(req);
    const sourcePath = String(body.sourcePath || "");
    const xmlText = String(body.xmlText || "");
    if (!xmlText.trim()) {
      const error = new Error("XML content is empty.");
      error.status = 400;
      throw error;
    }

    const result = await publishXmlWithGitHubApp({
      actor: session.login,
      mode: body.mode === "create" ? "create" : "update",
      route: body.route || {},
      sourcePath,
      xmlText
    });

    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error);
  }
}
