import { SignJWT, jwtVerify } from "jose";

/**
 * Realtime collab tokens for Hocuspocus.
 *
 * Why a JWT and not the raw `HOCUS_SECRET`? The Hocuspocus client receives
 * its token in the browser, so we never want to ship the master secret
 * there. Instead we mint a short-lived JWT (default 12h) bound to a
 * specific user + document, sign it with `HOCUS_SECRET`, and let the
 * Hocuspocus server verify + extract the identity.
 *
 * The Hocuspocus server lives in `deploy/hocuspocus/server.mjs` — it must
 * use the same secret and verification logic.
 */

const ISSUER = "volt-policy";
const AUDIENCE = "hocuspocus";

export interface RealtimeTokenClaims {
  /** Authenticated user id (profiles.id). */
  userId: string;
  /** Document this token may collaborate on. Server compares to room name. */
  documentId: string;
}

function getSecret(): Uint8Array {
  const s = process.env.HOCUS_SECRET;
  if (!s) throw new Error("HOCUS_SECRET is not set");
  return new TextEncoder().encode(s);
}

/**
 * Mint a realtime JWT for `userId` editing `documentId`. Default lifetime
 * is 12h so a long edit session won't suddenly drop the connection.
 */
export async function createRealtimeToken(
  userId: string,
  documentId: string,
  expiresIn: string = "12h"
): Promise<string> {
  return await new SignJWT({ userId, documentId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

/**
 * Verify a realtime JWT and return its claims, or null if invalid.
 * Used by the Hocuspocus server (Node) — duplicated there because that
 * process is a separate container. Keep the algorithm in sync with
 * `createRealtimeToken`.
 */
export async function verifyRealtimeToken(
  token: string
): Promise<RealtimeTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.documentId !== "string"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      documentId: payload.documentId,
    };
  } catch {
    return null;
  }
}
