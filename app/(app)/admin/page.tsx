import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";

/**
 * /admin index — no UI of its own, just routes the visitor into
 * the right tab based on their role:
 *
 *   - admin              → Personen (the default landing tab)
 *   - policy_lead*       → Groepen (the only tab they can see)
 *   - everyone else      → /dashboard
 *
 * Keeping the redirect in a Server Component is intentional: it
 * avoids a "flash of empty admin shell" on slow networks and keeps
 * unauthorised users from ever rendering the tab strip.
 */
export default async function AdminIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  if (me?.role === "admin") redirect("/admin/users");
  if (me?.role === "policy_lead" || me?.role === "policy_lead_department") {
    redirect("/admin/groups");
  }
  redirect("/dashboard");
}
