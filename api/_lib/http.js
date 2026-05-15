export function applyCors(req, res) {
  const origin = getAllowedOrigin(req.headers.origin || "");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  return false;
}

export function getAllowedOrigin(origin) {
  if (!origin) return "";
  const allowed = new Set([
    "https://codetree.ai",
    "https://www.codetree.ai",
    process.env.CODEROOT_PUBLIC_ORIGIN || ""
  ]);
  if (allowed.has(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return "";
}

export function getRequestUrl(req) {
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return new URL(req.url || "/", `${protocol}://${host}`);
}

export function getSafeReturnOrigin(value) {
  const origin = getAllowedOrigin(value || "");
  return origin || "https://www.codetree.ai";
}

export function getBearerToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

export function sendError(res, error) {
  sendJson(res, error.status || 500, {
    message: error.message || "Coderoot API request failed."
  });
}

export function requireMethod(req, method) {
  if (req.method === method) return;
  const error = new Error(`Method ${req.method} is not allowed.`);
  error.status = 405;
  throw error;
}
