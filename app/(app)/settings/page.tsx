import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { getT } from "@/lib/i18n/server";
import { T } from "@/components/T";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Profile } from "@/lib/types";

export default async function SettingsPage() {
  const { t } = await getT();
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold">{t("settings.title")}</h1>
      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold">{t("settings.profile")}</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <dt className="text-slate-500">
              <T>Name</T>
            </dt>
            <dd className="col-span-2">{profile?.full_name ?? "—"}</dd>
            <dt className="text-slate-500">
              <T>Email</T>
            </dt>
            <dd className="col-span-2">{user.email}</dd>
            <dt className="text-slate-500">
              <T>Role</T>
            </dt>
            <dd className="col-span-2 capitalize">{profile?.role}</dd>
          </dl>
        </section>

        <section>
          <h2 className="text-lg font-semibold">{t("settings.language")}</h2>
          <p className="mt-1 text-sm text-slate-600">
            <T>Saved on your profile and across devices.</T>
          </p>
          <div className="mt-3">
            <LanguageSwitcher value={profile?.language_pref ?? "en"} />
          </div>
        </section>
      </div>
    </div>
  );
}
