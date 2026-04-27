import nodemailer from "nodemailer";

/**
 * Tiny email helper. Reads SMTP config from env vars (same names Authentik
 * uses, so admins only need to know one set). Sends transactional notification
 * mail without templates — for the policy app we send rich-text plain HTML
 * and that's it.
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Mail sends are fire-and-forget from server actions: failures are logged
 * but never block the underlying request.
 */

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) {
    return null; // SMTP not configured — silently no-op.
  }

  _transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
    // Force AUTH PLAIN/LOGIN — Maileroo doesn't support CRAM-MD5.
    authMethod: "PLAIN",
  });
  return _transporter;
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendMail(input: SendMailInput): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) {
    return { ok: false, error: "SMTP not configured" };
  }
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
  try {
    await t.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
      replyTo: input.replyTo,
    });
    return { ok: true };
  } catch (e) {
    console.error("[email] sendMail failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown SMTP error",
    };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Notify admins that an editor has saved a new version on top of a
 * previously-approved document. Public still sees the previously-approved
 * snapshot until the admin approves the pending changes.
 */
export async function notifyAdminsOfPendingReview(args: {
  adminEmails: string[];
  documentTitle: string;
  documentId: string;
  editorName: string;
  newVersion: number;
  approvedVersion: number;
  changeSummary: string | null;
  appBaseUrl: string;
}): Promise<void> {
  if (args.adminEmails.length === 0) return;
  const docUrl = `${args.appBaseUrl}/documents/${args.documentId}`;
  const diffUrl = `${args.appBaseUrl}/documents/${args.documentId}/compare?from=${args.approvedVersion}&to=${args.newVersion}`;
  const html = `
    <p>Hi admin,</p>
    <p><strong>${escapeHtml(args.editorName)}</strong> heeft een nieuwe versie
    voorgesteld van het document <strong>${escapeHtml(args.documentTitle)}</strong>.</p>
    <ul>
      <li>Voorgestelde versie: <strong>v${args.newVersion}</strong></li>
      <li>Public ziet nog: <strong>v${args.approvedVersion}</strong></li>
      ${
        args.changeSummary
          ? `<li>Change summary: <em>${escapeHtml(args.changeSummary)}</em></li>`
          : ""
      }
    </ul>
    <p>
      <a href="${diffUrl}" style="background:#7d3ec0;color:#fff;padding:8px 14px;text-decoration:none;border-radius:4px;display:inline-block;">
        Bekijk diff (v${args.approvedVersion} → v${args.newVersion})
      </a>
    </p>
    <p>Of <a href="${docUrl}">open het document direct</a> om Approve / Reject te kiezen.</p>
    <hr>
    <p style="color:#666;font-size:12px">
      Volt Policy Management — automatische notificatie. Antwoorden op deze
      mail komen niet aan; reageer in de app of bij de editor zelf.
    </p>
  `;
  await sendMail({
    to: args.adminEmails,
    subject: `[Volt Policy] ${args.editorName} stelde wijziging voor: ${args.documentTitle}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
