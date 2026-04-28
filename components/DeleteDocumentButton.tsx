"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDocument } from "@/app/(app)/documents/actions";

/**
 * "Delete document" button + type-to-confirm dialog.
 *
 * Shown only when the server has resolved that the current user is
 * authorized to delete (admin / owner / scoped policy_lead). The
 * server action runs the same authorization check + RLS policy; this
 * component is just an extra "are you sure" gate so a misclick on a
 * carefully-crafted approved doc can't wipe everything.
 *
 * UX pattern matches GitHub's repo delete + Linear's project delete:
 * type the document's exact title to enable the confirm button. We
 * specifically avoid asking for a password because OIDC owns identity
 * — there's no local password to verify against.
 */
export interface DeleteDocumentButtonLabels {
  delete: string;
  confirmTitle: string;
  confirmBodyTpl: string; // "Type {title} to confirm. This cannot be undone."
  typedPlaceholderTpl: string; // "Type {title} to confirm"
  confirmDelete: string;
  deleting: string;
  cancel: string;
  failed: string;
}

export default function DeleteDocumentButton({
  documentId,
  documentTitle,
  labels,
}: {
  documentId: string;
  documentTitle: string;
  labels: DeleteDocumentButtonLabels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const matches = typed.trim() === documentTitle.trim();

  function handleDelete() {
    setError(null);
    start(async () => {
      try {
        const res = await deleteDocument(documentId, { typedTitle: typed });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Doc is gone — bounce to the documents list. router.replace
        // (not push) so the user can't back-button into a 404.
        router.replace("/documents");
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        🗑 {labels.delete}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-5 shadow-xl">
            <h2
              id="delete-dialog-title"
              className="text-lg font-semibold text-red-800"
            >
              {labels.confirmTitle}
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              {labels.confirmBodyTpl.replace("{title}", documentTitle)}
            </p>
            <label htmlFor="delete-confirm-input" className="sr-only">
              {labels.typedPlaceholderTpl.replace("{title}", documentTitle)}
            </label>
            <input
              id="delete-confirm-input"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={labels.typedPlaceholderTpl.replace(
                "{title}",
                documentTitle
              )}
              className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              autoFocus
            />
            {error && (
              <div
                role="alert"
                className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800"
              >
                {error}
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                  setError(null);
                }}
                disabled={pending}
                className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!matches || pending}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? labels.deleting : labels.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
