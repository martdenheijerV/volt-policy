import { createClient } from "@/lib/db/client";

/**
 * Append an immutable row to public.audit_log for any privileged action.
 * Always non-throwing — audit failures should never break the user-facing flow.
 */
export async function logAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      actor_name_cached: profile?.full_name ?? user.email ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });
  } catch (e) {
    // Intentionally swallow — audit must never break the request path.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("audit log failed:", e);
    }
  }
}
