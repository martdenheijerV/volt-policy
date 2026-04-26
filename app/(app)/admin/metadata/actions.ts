"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/client";
import type { DocType } from "@/lib/types";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") throw new Error("Admin only");
  return supabase;
}

export async function createMetadataField(formData: FormData) {
  const supabase = await requireAdmin();
  const key = (formData.get("key") as string)?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const label = (formData.get("label") as string)?.trim();
  const field_type = formData.get("field_type") as string;
  const optionsRaw = (formData.get("options") as string) || "";
  const required = formData.get("required") === "on";
  const applies_to = ((formData.get("applies_to") as string) || "") as DocType | "";
  if (!key || !label) throw new Error("Key and label are required");

  const options =
    field_type === "select" && optionsRaw
      ? { choices: optionsRaw.split(",").map((s) => s.trim()).filter(Boolean) }
      : null;

  const { error } = await supabase.from("metadata_fields").insert({
    key,
    label,
    field_type,
    required,
    applies_to: applies_to || null,
    options,
  });
  if (error) throw error;
  revalidatePath("/admin/metadata");
}

export async function deleteMetadataField(id: string) {
  const supabase = await requireAdmin();
  await supabase.from("metadata_fields").delete().eq("id", id);
  revalidatePath("/admin/metadata");
}
