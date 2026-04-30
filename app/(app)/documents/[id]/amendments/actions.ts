"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/client";
import { saveNewVersion } from "../../actions";

export async function proposeAmendment(formData: FormData) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const document_id = formData.get("document_id") as string;
  const target_quote = (formData.get("target_quote") as string)?.trim();
  const replacement_text = (formData.get("replacement_text") as string)?.trim();
  const rationale = ((formData.get("rationale") as string) || "").trim();
  if (!target_quote || !replacement_text)
    throw new Error("Target quote and replacement text are required");

  const { data: profile } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await db.from("amendments").insert({
    document_id,
    proposer_id: user.id,
    proposer_name_cached: profile?.full_name ?? user.email ?? null,
    target_quote,
    replacement_text,
    rationale: rationale || null,
  });
  if (error) throw error;
  revalidatePath(`/documents/${document_id}/amendments`);
}

export async function toggleSupport(amendmentId: string, documentId: string) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: existing } = await db
    .from("amendment_supporters")
    .select("amendment_id")
    .eq("amendment_id", amendmentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    await db
      .from("amendment_supporters")
      .delete()
      .eq("amendment_id", amendmentId)
      .eq("user_id", user.id);
  } else {
    await db
      .from("amendment_supporters")
      .insert({ amendment_id: amendmentId, user_id: user.id });
  }
  revalidatePath(`/documents/${documentId}/amendments`);
}

export async function decideAmendment(
  amendmentId: string,
  documentId: string,
  decision: "accepted" | "rejected"
) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: am, error: amErr } = await db
    .from("amendments")
    .select("target_quote,replacement_text")
    .eq("id", amendmentId)
    .single();
  if (amErr) throw amErr;

  const { error: updErr } = await db
    .from("amendments")
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", amendmentId);
  if (updErr) throw updErr;

  if (decision === "accepted") {
    // Apply replacement to current document content and write a new version.
    const { data: doc } = await db
      .from("documents")
      .select("title,current_content")
      .eq("id", documentId)
      .single();
    if (doc) {
      const newContent = doc.current_content.replace(
        am.target_quote,
        am.replacement_text
      );
      await saveNewVersion(documentId, {
        title: doc.title,
        content: newContent,
        change_summary: `Applied amendment: "${am.target_quote.slice(0, 40)}…"`,
      });
    }
  }
  revalidatePath(`/documents/${documentId}/amendments`);
  revalidatePath(`/documents/${documentId}`);
}
