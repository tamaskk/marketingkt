import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s: string) => createHash("sha256").update(s).digest();

// Only automations holding UPLOAD_API_KEY may write; hashing makes the compare length-independent.
export function authorized(req: Request) {
  const key = process.env.UPLOAD_API_KEY;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "");
  return !!key && !!given && timingSafeEqual(sha(key), sha(given));
}
