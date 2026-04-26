import Link from "next/link";

/**
 * Signup is no longer self-service. Member identity lives in Volt Auth
 * (Authentik / Keycloak) — see CLAUDE.md principle #5. New accounts are
 * provisioned by national / chapter coordinators in the central IdP.
 *
 * This page is kept as a friendly explanation; the route handler at
 * `/api/auth/login` is what kicks off the OIDC flow for existing accounts.
 */
export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="text-3xl font-bold">Get a Volt account</h1>
      <p className="mt-3 text-sm text-slate-600">
        Volt Policy uses centralised single sign-on. To get an account, ask
        your chapter or national board to invite you in Volt Auth. Once your
        account exists you can sign in here.
      </p>

      <div className="mt-8">
        <Link
          href="/login"
          className="block w-full rounded bg-volt-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-volt-700"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
