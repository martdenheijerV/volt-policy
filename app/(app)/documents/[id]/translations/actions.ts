"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";

export async function createTranslation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const document_id = formData.get("document_id") as string;
  const language = (formData.get("language") as string)?.toLowerCase();

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("title,current_content,current_version,language")
    .eq("id", document_id)
    .single();
  if (docErr) throw docErr;

  if (language === doc.language)
    throw new Error("Pick a target language different from the source.");

  const { error } = await supabase
    .from("document_translations")
    .insert({
      document_id,
      language,
      source_version: doc.current_version,
      title: doc.title,
      content: doc.current_content,
      translator_id: user.id,
      status: "machine",
    });
  if (error) {
    if (error.code === "23505") {
      // already exists — go to that translation
      revalidatePath(`/documents/${document_id}/translations`);
      redirect(`/documents/${document_id}/translations/${language}`);
    }
    throw error;
  }
  revalidatePath(`/documents/${document_id}/translations`);
  redirect(`/documents/${document_id}/translations/${language}`);
}

export async function saveTranslation(
  documentId: string,
  language: string,
  data: { title: string; content: string; status: "machine" | "in_review" | "verified" }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const patch: Record<string, unknown> = {
    title: data.title,
    content: data.content,
    status: data.status,
  };
  if (data.status === "verified") {
    patch.verified_at = new Date().toISOString();
    patch.verified_by = user.id;
  }
  const { error } = await supabase
    .from("document_translations")
    .update(patch)
    .eq("document_id", documentId)
    .eq("language", language);
  if (error) throw error;
  revalidatePath(`/documents/${documentId}/translations/${language}`);
  return { ok: true };
}
