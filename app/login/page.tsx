import Link from "next/link";

/**
 * EU-pure login. The OIDC handshake is initiated by /api/auth/login, which
 * redirects to Volt Auth (Authentik / Keycloak), then comes back to
 * /api/auth/callback which sets the session cookie and redirects to `next`.
 *
 * No email/password fallback — per CLAUDE.md principle #5, member identity
 * lives in Volt Auth. Account recovery happens there.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const next = params.next ?? "/dashboard";
  const loginHref = `/api/auth/login?next=${encodeURIComponent(next)}`;
  const issuer = process.env.OIDC_ISSUER_URL ?? "Volt Auth";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="text-3xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Welcome back. Sign in with your Volt account to access documents and
        collaborate on policy.
      </p>

      <div className="mt-8">
        <a
          href={loginHref}
          className="block w-full rounded bg-volt-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-volt-700"
        >
          Continue with Volt Auth
        </a>
        <p className="mt-3 text-xs text-slate-500">
          You will be redirected to <code>{issuer}</code>.
        </p>
      </div>

      <p className="mt-8 text-sm text-slate-600">
        Don&apos;t have a Volt account yet? Reach out to your local team to be
        invited — accounts are managed centrally in Volt Auth.
      </p>
    </main>
  );
}
