"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { getSql, withUser } from "@/lib/db/sql";
import { logAudit } from "@/lib/audit";
import { createAuthentikUser } from "@/lib/auth/authentik";
import type { UserRole } from "@/lib/types";

/**
 * Change a user's role. Admin-only — enforced by RLS on `profiles` plus the
 * is_admin() guard in the server action body.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") {
    throw new Error("Only admins can change user roles.");
  }

  const { error } = await db
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  await logAudit("role_change", "profile", userId, { new_role: role });
  revalidatePath("/admin/users");
}

/**
 * Create an external user that doesn't exist in any Volt SSO directory yet.
 * Workflow:
 *   1. Admin fills name + email + role in /admin/users.
 *   2. We create the user in Authentik via API (with a strong temp password).
 *   3. We pre-create a `profiles` row keyed on email (oidc_sub still NULL),
 *      tagged with the chosen role. On first login, the OIDC callback links
 *      the row by matching email and fills in oidc_sub.
 *   4. UI shows the temp password ONCE so the admin can share it.
 */
export async function createExternalUser(input: {
  name: string;
  email: string;
  role: UserRole;
}): Promise<
  | { ok: true; username: string; tempPassword: string; loginUrl: string }
  | { ok: false; error: string }
> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: me } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") {
    return { ok: false, error: "Only admins can create external users." };
  }

  // 1. Create the Authentik user. createAuthentikUser throws when its
  // env vars (OIDC_ISSUER_URL, AUTHENTIK_API_TOKEN) are missing —
  // catch that here so the form gets a readable message instead of
  // the opaque Next.js "Application error" client-side.
  let auth: Awaited<ReturnType<typeof createAuthentikUser>>;
  try {
    auth = await createAuthentikUser({
      name: input.name,
      email: input.email,
    });
  } catch (e) {
    return {
      ok: false,
      error:
        "Authentik call failed: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
  if (!auth.ok) {
    return { ok: false, error: auth.error ?? "Authentik failed." };
  }

  // 2. Pre-create the profiles row, keyed on email.
  //    oidc_sub stays NULL until first login matches it.
  try {
    await withUser(user.id, async (tx) => {
      await tx`
        insert into profiles (id, oidc_sub, full_name, role, language_pref)
        values (gen_random_uuid(), null, ${input.name}, ${input.role}, 'en')
        on conflict do nothing
      `;
      // The author cache for comments and the email column for matching
      // live in `profiles.full_name` + a dedicated email column we add now
      // if it doesn't exist. We piggyback the email by writing it into
      // full_name temporarily — better is a real column. Add one if missing.
      await tx`
        alter table profiles
          add column if not exists email text
      `;
      await tx`
        update profiles
        set email = ${input.email.toLowerCase()},
            full_name = ${input.name},
            role = ${input.role}
        where email = ${input.email.toLowerCase()}
           or (oidc_sub is null and full_name = ${input.name})
      `;
    });
  } catch (e) {
    return {
      ok: false,
      error:
        "User created in Authentik but profile pre-creation failed: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }

  await logAudit("external_user_created", "profile", input.email, {
    name: input.name,
    role: input.role,
    authentik_username: auth.username,
  });

  // 3. Return the one-time credentials for the admin to share.
  const sql = getSql();
  const settingsRow = await sql`select 1`.catch(() => null);
  void settingsRow; // touch sql to keep imports honest in case we add lookups later

  // Take them straight into the OIDC redirect — bypasses the "Continue with
  // Volt Auth" button on /login (which is misleading for external users
  // who don't actually have Volt SSO). Falls back to the public app URL
  // if OIDC_REDIRECT_URI isn't configured, then to localhost.
  let loginUrl: string;
  try {
    const base =
      process.env.OIDC_REDIRECT_URI ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost";
    loginUrl = `${new URL(base).origin}/api/auth/login`;
  } catch {
    loginUrl = "/api/auth/login";
  }

  revalidatePath("/admin/users");
  return {
    ok: true,
    username: auth.username!,
    tempPassword: auth.tempPassword!,
    loginUrl,
  };
}
