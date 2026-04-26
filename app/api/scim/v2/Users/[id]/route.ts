import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/sql";
import {
  checkScimAuth,
  profileToScim,
  scimError,
  type ProfileLike,
} from "@/lib/scim";

/**
 * SCIM v2 single-user endpoints. See ../route.ts for the auth + bypass model.
 */

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  oidc_sub: string | null;
  full_name: string | null;
  role: string;
  language_pref: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = checkScimAuth(request);
  if (err) return err;
  const { id } = await params;
  const sql = getSql();
  const rows = await sql.begin(async (tx) => {
    await tx.unsafe("set local row_security = off");
    return await tx<ProfileRow[]>`
      select id, oidc_sub, full_name, role, language_pref, created_at, updated_at
      from public.profiles
      where id = ${id}
      limit 1
    `;
  });
  const data = rows[0];
  if (!data) return scimError(404, "User not found");
  return NextResponse.json(profileToScim(data as unknown as ProfileLike), {
    headers: { "content-type": "application/scim+json" },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = checkScimAuth(request);
  if (err) return err;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
    displayName?: string;
    "urn:volt:scim:custom"?: { role?: string; languagePref?: string };
    Operations?: { op?: string; path?: string; value?: unknown }[];
  };

  const patch: { full_name?: string; role?: string; language_pref?: string } = {};
  if (typeof body.displayName === "string") patch.full_name = body.displayName;
  const custom = body["urn:volt:scim:custom"];
  if (custom?.role) patch.role = custom.role;
  if (custom?.languagePref) patch.language_pref = custom.languagePref;

  if (Array.isArray(body.Operations)) {
    for (const op of body.Operations) {
      const opName = (op.op ?? "").toLowerCase();
      if (opName === "replace") {
        if (op.path === "displayName" && typeof op.value === "string") {
          patch.full_name = op.value;
        }
        // active=false is a soft-disable; not modeled. We deliberately do not delete.
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return scimError(400, "No supported attributes to update");
  }

  const sql = getSql();
  const rows = await sql.begin(async (tx) => {
    await tx.unsafe("set local row_security = off");
    return await tx<ProfileRow[]>`
      update public.profiles
         set full_name     = coalesce(${patch.full_name ?? null}, full_name),
             role          = coalesce(${patch.role ?? null}, role),
             language_pref = coalesce(${patch.language_pref ?? null}, language_pref)
       where id = ${id}
       returning id, oidc_sub, full_name, role, language_pref, created_at, updated_at
    `;
  });
  const data = rows[0];
  if (!data) return scimError(404, "User not found");
  return NextResponse.json(profileToScim(data as unknown as ProfileLike), {
    headers: { "content-type": "application/scim+json" },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = checkScimAuth(request);
  if (err) return err;
  const { id } = await params;
  const sql = getSql();
  // Profile deletion is now the source of truth — no auth.users to remove.
  // Cascading FKs anonymise authored content (author_id -> null).
  const rows = await sql.begin(async (tx) => {
    await tx.unsafe("set local row_security = off");
    return await tx<{ id: string }[]>`
      delete from public.profiles where id = ${id} returning id
    `;
  });
  if (rows.length === 0) return scimError(404, "User not found");
  return new NextResponse(null, { status: 204 });
}
