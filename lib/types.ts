export type UserRole =
  | "admin"
  | "editor"
  | "policy_lead"
  | "policy_lead_department"
  | "member"
  | "translator";

/**
 * A `department` is an organisational unit (Volt Europa, Volt EP,
 * Volt Nederland, etc.). Distinct from `user_groups`, which model
 * topic-based working groups (Climate WG, Brussels office, etc.).
 * Departments are managed by admins from /admin (Personen tab);
 * policy_lead_department users get full management rights inside
 * their assigned department(s) and editor rights everywhere else.
 */
export interface Department {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}
export type DocStatus = "draft" | "review" | "approved" | "archived";
export type DocType =
  | "policy"
  | "position"
  | "resolution"
  | "statement"
  | "motion"
  | "touchstone"
  | "roadmap_europe"
  | "roadmap_national"
  | "roadmap_local"
  | "electoral_programme_europe"
  | "electoral_programme_national"
  | "electoral_programme_local"
  | "campaign_programme_europe"
  | "campaign_programme_national"
  | "campaign_programme_local"
  | "best_practice"
  | "eo_speech"
  | "other";

/** Ordered list used for selectors + iteration. Matches the enum in 008. */
export const DOC_TYPES: ReadonlyArray<DocType> = [
  "policy",
  "position",
  "resolution",
  "statement",
  "motion",
  "touchstone",
  "roadmap_europe",
  "roadmap_national",
  "roadmap_local",
  "electoral_programme_europe",
  "electoral_programme_national",
  "electoral_programme_local",
  "campaign_programme_europe",
  "campaign_programme_national",
  "campaign_programme_local",
  "best_practice",
  "eo_speech",
  "other",
] as const;

export type EditRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface EditRightsRequest {
  id: string;
  document_id: string;
  requester_id: string;
  requester_name_cached: string | null;
  message: string | null;
  status: EditRequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  language_pref: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  title: string;
  slug: string;
  status: DocStatus;
  document_type: DocType;
  language: string;
  purpose: string | null;
  tags: string[];
  owner_id: string | null;
  current_content: string;
  current_version: number;
  /** Snapshot pointer: which version is the public-facing approved one. */
  approved_version_number: number | null;
  /** Snapshot pointer: while status='review', the version the admin reviews. */
  review_version_number: number | null;
  /**
   * Opt-in flag for the citations / bibliography feature. False for
   * everyday docs that just hyperlink in prose; true for docs that
   * formally cite academic / institutional sources.
   */
  citations_enabled: boolean;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  title: string;
  content: string;
  change_summary: string | null;
  author_id: string | null;
  created_at: string;
}

export type CommentKind = "general" | "review" | "suggestion";

export interface Comment {
  id: string;
  document_id: string;
  version_number: number | null;
  author_id: string | null;
  author_name_cached: string | null;
  parent_id: string | null;
  body: string;
  anchor_quote: string | null;
  resolved: boolean;
  kind: CommentKind;
  created_at: string;
  updated_at: string;
}
