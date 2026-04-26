import { SignJWT, jwtVerify } from "jose";
import { getCookieConfig } from "./config";

export interface Session {
  userId: string;
  email?: string;
  name?: string;
  iat: number;
  exp: number;
}

let _key: Uint8Array | null = null;
function getKey(): Uint8Array {
  if (_key) return _key;
  const secret = getCookieConfig().secret;
  _key = new TextEncoder().encode(secret);
  return _key;
}

export async function signSession(payload: { userId: string; email?: string; name?: string }) {
  const cfg = getCookieConfig();
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + cfg.maxAge)
    .setSubject(payload.userId)
    .setIssuer("volt-policy")
    .sign(getKey());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { issuer: "volt-policy" });
    return {
      userId: String(payload.userId),
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0,
    };
  } catch {
    return null;
  }
}
