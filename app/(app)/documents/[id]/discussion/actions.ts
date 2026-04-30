"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/client";

export async function setDiscussion(formData: FormData) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const document_id = formData.get("document_id") as string;
  const platform = (formData.get("platform") as string) || null;
  const url = (formData.get("url") as string)?.trim();
  if (!url) throw new Error("URL is required");

  const { error } = await db
    .from("document_discussions")
    .upsert(
      { document_id, platform, url, created_by: user.id },
      { onConflict: "document_id" }
    );
  if (error) throw error;
  revalidatePath(`/documents/${document_id}`);
  revalidatePath(`/documents/${document_id}/discussion`);
}
