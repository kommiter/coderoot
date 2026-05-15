import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_VERSION = "v1";

export function createSession(payload, ttlSeconds = 60 * 60 * 24 * 7) {
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    ...payload,
    exp: now + ttlSeconds,
    iat: now,
    v: TOKEN_VERSION
  });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSessionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function readSession(token) {
  try {
    const [ivText, tagText, encryptedText] = String(token || "").split(".");
    if (!ivText || !tagText || !encryptedText) throw new Error("Malformed session.");
    const decipher = createDecipheriv("aes-256-gcm", getSessionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const session = JSON.parse(decrypted);
    if (session.v !== TOKEN_VERSION) throw new Error("Unsupported session.");
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) {
      const error = new Error("GitHub session expired. Connect GitHub again.");
      error.status = 401;
      throw error;
    }
    return session;
  } catch (error) {
    if (error.status) throw error;
    const invalid = new Error("GitHub session is invalid. Connect GitHub again.");
    invalid.status = 401;
    throw invalid;
  }
}

function getSessionKey() {
  const secret = process.env.CODEROOT_SESSION_SECRET || "";
  if (secret.length < 32) {
    throw new Error("CODEROOT_SESSION_SECRET must be set to at least 32 characters.");
  }
  return createHash("sha256").update(secret).digest();
}
