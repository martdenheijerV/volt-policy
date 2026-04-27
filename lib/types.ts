export type UserRole =
  | "admin"
  | "editor"
  | "policy_lead"
  | "member"
  | "translator";
export type DocStatus = "draft" | "review" | "approved" | "archived";
export type DocType =
  | "policy"
  | "position"
  | "resolution"
  | "statement"
  | "motion"
  | "other";

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
