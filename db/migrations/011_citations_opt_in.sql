-- 011_citations_opt_in.sql
--
-- Citations are now opt-in per document. Most Volt docs (positions,
-- statements, motions, EO speeches) just use plain hyperlinks in the
-- body and never need a formal bibliography. Only docs that genuinely
-- reference academic sources (some touchstones, best-practice
-- assessments) benefit from the cite_key + bibliography flow.
--
-- We default to false so the Citations button disappears from the doc
-- toolbar everywhere, except where the editor explicitly turned it on
-- at creation time. Existing docs become "citations off" by default —
-- their citation rows (if any) stay in the database; flipping the
-- flag back on later re-exposes them.

alter table public.documents
  add column if not exists citations_enabled boolean not null default false;
