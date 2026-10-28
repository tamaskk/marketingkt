// Single-user login: the session cookie holds an HMAC of a fixed label keyed by HUB_PASSWORD,
// so changing the password logs every device out. Web Crypto, so it runs in proxy and route handlers alike.
export const SESSION_COOKIE = "mh_session";

async function hmac(key: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("marketing-hub-session"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sessionToken() {
  const password = process.env.HUB_PASSWORD;
  if (!password) throw new Error("Hiányzó környezeti változó: HUB_PASSWORD");
  return hmac(password);
}

// Constant-time compare so the token can't be guessed byte by byte.
export async function isValidSession(value: string | undefined) {
  if (!value || !process.env.HUB_PASSWORD) return false;
  const expected = await sessionToken();
  if (value.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
