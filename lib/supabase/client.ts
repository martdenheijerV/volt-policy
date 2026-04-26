/**
 * Removed by the EU-pure migration. Use the helpers in `@/lib/auth/browser`
 * (getBrowserUser, signOutFromBrowser) for browser-side auth, and call
 * server actions for any database mutation. See MIGRATION_TODO.md.
 */
export function createClient(): never {
  throw new Error(
    "lib/supabase/client is no longer available. Use '@/lib/auth/browser' helpers and server actions instead."
  );
}
