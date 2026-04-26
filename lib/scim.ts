import { NextResponse } from "next/server";

export function checkScimAuth(request: Request): NextResponse | null {
  const expected = process.env.SCIM_TOKEN;
  if (!expected) {
    return scimError(503, "SCIM_TOKEN not configured");
  }
  const auth = request.headers.get("authorization") ?? "";
  const got = auth.replace(/^Bearer\s+/i, "").trim();
  if (got !== expected) return scimError(401, "Invalid bearer token");
  return null;
}

export function scimError(status: number, detail: string) {
  return NextResponse.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail,
      status: String(status),
    },
    { status, headers: { "content-type": "application/scim+json" } }
  );
}

export interface ProfileLike {
  id: string;
  full_name: string | null;
  role: string;
  language_pref: string;
  created_at: string;
  updated_at: string;
}

export function profileToScim(p: ProfileLike) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: p.id,
    userName: p.full_name ?? p.id,
    displayName: p.full_name ?? "",
    active: true,
    meta: {
      resourceType: "User",
      created: p.created_at,
      lastModified: p.updated_at,
      location: `/api/scim/v2/Users/${p.id}`,
    },
    "urn:volt:scim:custom": {
      role: p.role,
      languagePref: p.language_pref,
    },
  };
}
