import { cookies } from "next/headers";
import { getCookieConfig } from "./config";
import { type Session, verifySession } from "./session";

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cfg = getCookieConfig();
  const token = cookieStore.get(cfg.name)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.userId ?? null;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const cfg = getCookieConfig();
  cookieStore.delete(cfg.name);
}
