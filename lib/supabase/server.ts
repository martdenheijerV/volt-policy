/**
 * Removed by the EU-pure migration. Use `@/lib/db/client` (createClient) for
 * server-side database access and `@/lib/auth/server` (getSession,
 * getCurrentUserId) for the current user. See MIGRATION_TODO.md.
 */
export async function createClient(): Promise<never> {
  throw new Error(
    "lib/supabase/server is no longer available. Import createClient from '@/lib/db/client' instead."
  );
}
