"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/client";

export async function addCitation(formData: FormData) {
  const db = await createClient();
  const document_id = formData.get("document_id") as string;
  const cite_key = (formData.get("cite_key") as string)?.trim();
  const author = ((formData.get("author") as string) || "").trim();
  const year = ((formData.get("year") as string) || "").trim();
  const title = (formData.get("title") as string)?.trim();
  const source = ((formData.get("source") as string) || "").trim();
  const url = ((formData.get("url") as string) || "").trim();
  if (!cite_key || !title) throw new Error("cite_key and title are required");
  const { error } = await db
    .from("citations")
    .insert({
      document_id,
      cite_key,
      author: author || null,
      year: year || null,
      title,
      source: source || null,
      url: url || null,
    });
  if (error) throw error;
  revalidatePath(`/documents/${document_id}/citations`);
}

export async function deleteCitation(id: string, documentId: string) {
  const db = await createClient();
  const { error } = await db.from("citations").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(`/documents/${documentId}/citations`);
}
