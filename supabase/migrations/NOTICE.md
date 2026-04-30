# Deprecated location

The canonical migrations directory is now `db/migrations/`. This
folder is a historical mirror that the sandbox couldn't delete in
place; remove it manually before committing:

```bash
rm -rf supabase/
git rm -r supabase/
```

The contents of `db/migrations/` are byte-identical to what was here.

Future migrations go into `db/migrations/` only. Anything still
referencing `supabase/migrations/` in tooling, scripts, or README's
should be updated to `db/migrations/`.

This project does not use Supabase. See the no-Supabase principle in
`CLAUDE.md`.
