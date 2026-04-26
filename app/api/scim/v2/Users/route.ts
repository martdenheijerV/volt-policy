import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/sql";
import {
  checkScimAuth,
  profileToScim,
  scimError,
  type ProfileLike,
} from "@/lib/scim";

/**
 * SCIM v2 Users collection.
 *
 * Authenticated by the SCIM_TOKEN bearer header (see checkScimAuth).
 * Runs raw SQL through the application's Postgres pool. Requests are
 * wrapped in a transaction with `set local row_security = off` so the
 * upstream IdP (Volt Auth / Authentik) can manage every member without
 * having to materialise a fake authenticated session per call.
 *
 * Provisioning model: the IdP is the source of truth for user existence.
 * SCIM POST therefore upserts a row in `profiles` keyed by `oidc_sub`
 * (sent in `externalId`). It does NOT touch any `auth.users` table — that
 * relation no longer exists in the EU-pure stack.
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

export async function GET(request: Request) {
  const err = checkScimAuth(request);
  if (err) return err;

  const url = new URL(request.url);
  const startIndex = Math.max(parseInt(url.searchParams.get("startIndex") ?? "1", 10), 1);
  const count = Math.max(parseInt(url.searchParams.get("count") ?? "100", 10), 0);

  const sql = getSql();
  const result = await sql.begin(async (tx) => {
    await tx.unsafe("set local row_security = off");
    const rows = await tx<ProfileRow[]>`
      select id, oidc_sub, full_name, role, language_pref, created_at, updated_at
      from public.profiles
      order by created_at desc
      limit ${count} offset ${startIndex - 1}
    `;
    const totalRows = await tx<{ count: string }[]>`
      select count(*)::text as count from public.profiles
    `;
    return { rows, total: parseInt(totalRows[0]?.count ?? "0", 10) };
  });

  return NextResponse.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: result.total,
      startIndex,
      itemsPerPage: result.rows.length,
      Resources: result.rows.map((row) =>
        profileToScim(row as unknown as ProfileLike)
      ),
    },
    { headers: { "content-type": "application/scim+json" } }
  );
}

export async function POST(request: Request) {
  const err = checkScimAuth(request);
  if (err) return err;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
    userName?: string;
    displayName?: string;
    externalId?: string;
    emails?: { value?: string }[];
    "urn:volt:scim:custom"?: { languagePref?: string; role?: string };
  };

  const email = body.userName ?? body.emails?.[0]?.value;
  if (!email) return scimError(400, "userName or emails[0].value is required");

  const oidcSub = body.externalId ?? null;
  const fullName = body.displayName ?? email;
  const langPref = body["urn:volt:scim:custom"]?.languagePref ?? "en";
  const role = body["urn:volt:scim:custom"]?.role ?? "member";

  const sql = getSql();
  const created = await sql.begin(async (tx) => {
    await tx.unsafe("set local row_security = off");
    if (oidcSub) {
      const rows = await tx<ProfileRow[]>`
        insert into public.profiles (id, oidc_sub, full_name, role, language_pref)
        values (gen_random_uuid(), ${oidcSub}, ${fullName}, ${role}, ${langPref})
        on conflict (oidc_sub) do update set
          full_name     = excluded.full_name,
          role          = excluded.role,
          language_pref = excluded.language_pref
        returning id, oidc_sub, full_name, role, language_pref, created_at, updated_at
      `;
      return rows[0];
    }
    const rows = await tx<ProfileRow[]>`
      insert into public.profiles (id, oidc_sub, full_name, role, language_pref)
      values (gen_random_uuid(), null, ${fullName}, ${role}, ${langPref})
      returning id, oidc_sub, full_name, role, language_pref, created_at, updated_at
    `;
    return rows[0];
  });

  if (!created) return scimError(500, "create failed");
  return NextResponse.json(profileToScim(created as unknown as ProfileLike), {
    status: 201,
    headers: { "content-type": "application/scim+json" },
  });
}
