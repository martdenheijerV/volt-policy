import Link from "next/link";

/**
 * EU-pure login. The OIDC handshake is initiated by /api/auth/login, which
 * redirects to Volt Auth (Authentik / Keycloak), then comes back to
 * /api/auth/callback which sets the session cookie and redirects to `next`.
 *
 * No email/password fallback in this app — per CLAUDE.md principle #5,
 * member identity lives in Volt Auth. The "Log in as guest" button is just
 * the same OIDC flow visually marked for external (non-Volt) users so they
 * don't worry that "Continue with Volt Auth" requires a Volt SSO account.
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
        Welcome back. Sign in with your Volt account, or log in as a guest if
        you were invited from outside the Volt organization.
      </p>

      <div className="mt-8 space-y-4">
        <a
          href={loginHref}
          className="block w-full rounded bg-volt-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-volt-700"
        >
          Continue with Volt Auth
        </a>
        <p className="-mt-2 text-xs text-slate-500">
          For Volt members. Once Volt Auth federation is live, this skips the
          login screen if you&apos;re already signed in elsewhere in Volt.
        </p>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-slate-400">or</span>
          </div>
        </div>

        <a
          href={loginHref}
          className="block w-full rounded border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Log in als gast
        </a>
        <p className="-mt-2 text-xs text-slate-500">
          For external invitees with a username + temporary password. You&apos;ll
          land directly on the Authentik login form.
        </p>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        You will be redirected to <code>{issuer}</code>.
      </p>

      <p className="mt-8 text-sm text-slate-600">
        Don&apos;t have access yet? Reach out to your local Volt team — internal
        members are managed via Volt Auth, externals can be invited by an admin.
      </p>
    </main>
  );
}
