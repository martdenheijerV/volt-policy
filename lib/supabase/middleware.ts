/**
 * Removed by the EU-pure migration. The Next middleware now uses
 * `authMiddleware` from `@/lib/auth/middleware`. See MIGRATION_TODO.md.
 */
import { type NextRequest } from "next/server";

export async function updateSession(_request: NextRequest): Promise<never> {
  throw new Error(
    "lib/supabase/middleware is no longer available. Use 'authMiddleware' from '@/lib/auth/middleware' instead."
  );
}
