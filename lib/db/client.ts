import { withUser } from "./sql";
import { getCurrentUserId } from "@/lib/auth/server";

/**
 * Tiny query-builder shim — mimics the subset of the previous PostgREST
 * client that this codebase relied on. Runs against self-hosted Postgres
 * via the `postgres` library (Danish, EU). All queries run inside a
 * transaction with the user's id stored as `app.user_id` so RLS policies
 * authorize.
 */

// We intentionally default the row generic to `any` so existing call sites
// can do `.select("*")` and then destructure arbitrary columns without
// having to thread types through every chained method. Callers that want
// stricter typing can pass a type argument to `.single<T>()` / `.maybeSingle<T>()`.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

interface SelectResult<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
  count?: number;
}

interface SingleResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

class SingleThenable<T> implements PromiseLike<SingleResult<T>> {
  constructor(private runner: () => Promise<SingleResult<T>>) {}
  then<R1 = SingleResult<T>, R2 = never>(
    onfulfilled?: ((value: SingleResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.runner().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

class QueryBuilder<T = Row> implements PromiseLike<SelectResult<T>> {
  private cols = "*";
  private filters: { sql: string; values: unknown[] }[] = [];
  private orderClause = "";
  private limitN: number | null = null;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private upsertConflict: string | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;

  constructor(private table: string) {}

  select(cols: string = "*", _opts?: { count?: "exact" }) {
    this.cols = cols;
    if (this.mode === "select") {
      // already a select
    }
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ sql: `${ident(col)} = ?`, values: [val] });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ sql: `${ident(col)} <> ?`, values: [val] });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ sql: `${ident(col)} > ?`, values: [val] });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ sql: `${ident(col)} >= ?`, values: [val] });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ sql: `${ident(col)} < ?`, values: [val] });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ sql: `${ident(col)} <= ?`, values: [val] });
    return this;
  }
  in(col: string, vals: unknown[]) {
    if (vals.length === 0) {
      this.filters.push({ sql: `false`, values: [] });
      return this;
    }
    const placeholders = vals.map(() => "?").join(",");
    this.filters.push({ sql: `${ident(col)} in (${placeholders})`, values: vals });
    return this;
  }
  textSearch(col: string, query: string, _opts?: { type?: string }) {
    this.filters.push({
      sql: `${ident(col)} @@ websearch_to_tsquery('simple', ?)`,
      values: [query],
    });
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    const dir = opts.ascending === false ? "desc" : "asc";
    this.orderClause = `order by ${ident(col)} ${dir}`;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  insert(values: Row | Row[]) {
    this.mode = "insert";
    this.payload = values;
    return this;
  }
  update(values: Row) {
    this.mode = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  upsert(values: Row | Row[], opts: { onConflict?: string } = {}) {
    this.mode = "upsert";
    this.payload = values;
    this.upsertConflict = opts.onConflict ?? null;
    return this;
  }

  single<U = T>(): SingleThenable<U> {
    this.singleMode = "single";
    return new SingleThenable<U>(() => this.executeSingle<U>());
  }

  maybeSingle<U = T>(): SingleThenable<U> {
    this.singleMode = "maybeSingle";
    return new SingleThenable<U>(() => this.executeSingle<U>());
  }

  // PromiseLike — multi-row resolution by default.
  then<R1 = SelectResult<T>, R2 = never>(
    onfulfilled?: ((value: SelectResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.executeMany().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private async executeMany(): Promise<SelectResult<T>> {
    try {
      const userId = await getCurrentUserId();
      const rows = await withUser(userId, async (tx) => {
        const { sql, values } = this.buildSql();
        return await tx.unsafe(sql, values as never[]);
      });
      return { data: rows as unknown as T[], error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "query failed";
      const code = (e as { code?: string })?.code;
      return { data: null, error: { message: msg, code } };
    }
  }

  private async executeSingle<U>(): Promise<SingleResult<U>> {
    try {
      const userId = await getCurrentUserId();
      const rows = await withUser(userId, async (tx) => {
        const { sql, values } = this.buildSql();
        return await tx.unsafe(sql, values as never[]);
      });
      const arr = rows as unknown as U[];
      if (this.singleMode === "single") {
        if (arr.length !== 1) {
          return { data: null, error: { message: `Expected 1 row, got ${arr.length}` } };
        }
        return { data: arr[0], error: null };
      }
      // maybeSingle
      return { data: arr[0] ?? null, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "query failed";
      const code = (e as { code?: string })?.code;
      return { data: null, error: { message: msg, code } };
    }
  }

  private buildSql(): { sql: string; values: unknown[] } {
    const t = ident(this.table);
    if (this.mode === "select") {
      let sql = `select ${this.cols === "*" ? "*" : sanitizeCols(this.cols)} from ${t}`;
      const vals: unknown[] = [];
      if (this.filters.length > 0) {
        const parts: string[] = [];
        for (const f of this.filters) {
          let part = f.sql;
          for (const v of f.values) {
            const idx = vals.length + 1;
            part = part.replace("?", `$${idx}`);
            vals.push(v);
          }
          parts.push(part);
        }
        sql += ` where ${parts.join(" and ")}`;
      }
      if (this.orderClause) sql += " " + this.orderClause;
      if (this.rangeStart !== null && this.rangeEnd !== null) {
        sql += ` limit ${this.rangeEnd - this.rangeStart + 1} offset ${this.rangeStart}`;
      } else if (this.limitN !== null) {
        sql += ` limit ${this.limitN}`;
      }
      return { sql, values: vals };
    }

    if (this.mode === "insert" || this.mode === "upsert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const cols = Object.keys(rows[0]);
      const colsStr = cols.map(ident).join(", ");
      const vals: unknown[] = [];
      const valueRows = rows.map((row: Row) => {
        const placeholders = cols.map((c) => {
          vals.push(row[c]);
          return `$${vals.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      let sql = `insert into ${t} (${colsStr}) values ${valueRows.join(", ")}`;
      if (this.mode === "upsert" && this.upsertConflict) {
        const conflictCols = this.upsertConflict
          .split(",")
          .map((c) => ident(c.trim()))
          .join(", ");
        const updates = cols
          .filter(
            (c) => !this.upsertConflict!.split(",").map((s) => s.trim()).includes(c)
          )
          .map((c) => `${ident(c)} = excluded.${ident(c)}`);
        sql += ` on conflict (${conflictCols}) do update set ${updates.join(", ")}`;
      }
      if (this.cols && this.cols !== "*" && this.singleMode) {
        sql += ` returning ${sanitizeCols(this.cols)}`;
      } else {
        sql += " returning *";
      }
      return { sql, values: vals };
    }

    if (this.mode === "update") {
      const cols = Object.keys(this.payload as Row);
      const vals: unknown[] = [];
      const setClauses = cols.map((c) => {
        vals.push((this.payload as Row)[c]);
        return `${ident(c)} = $${vals.length}`;
      });
      let sql = `update ${t} set ${setClauses.join(", ")}`;
      if (this.filters.length > 0) {
        const parts: string[] = [];
        for (const f of this.filters) {
          let part = f.sql;
          for (const v of f.values) {
            vals.push(v);
            part = part.replace("?", `$${vals.length}`);
          }
          parts.push(part);
        }
        sql += ` where ${parts.join(" and ")}`;
      }
      sql += " returning *";
      return { sql, values: vals };
    }

    if (this.mode === "delete") {
      const vals: unknown[] = [];
      let sql = `delete from ${t}`;
      if (this.filters.length > 0) {
        const parts: string[] = [];
        for (const f of this.filters) {
          let part = f.sql;
          for (const v of f.values) {
            vals.push(v);
            part = part.replace("?", `$${vals.length}`);
          }
          parts.push(part);
        }
        sql += ` where ${parts.join(" and ")}`;
      }
      return { sql, values: vals };
    }

    throw new Error("Unhandled query mode");
  }
}

function ident(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

function sanitizeCols(cols: string): string {
  if (cols === "*") return "*";
  if (!/^[a-zA-Z0-9_,* ()]+$/.test(cols)) return "*";
  return cols;
}

interface AuthShim {
  getUser: () => Promise<{ data: { user: { id: string; email?: string } | null } }>;
  signOut: () => Promise<void>;
}

interface DbClient {
  from<U = Row>(table: string): QueryBuilder<U>;
  auth: AuthShim;
}

export async function createClient(): Promise<DbClient> {
  const { getSession, clearSession } = await import("@/lib/auth/server");
  return {
    from<U = Row>(table: string) {
      return new QueryBuilder<U>(table);
    },
    auth: {
      async getUser() {
        const session = await getSession();
        return {
          data: {
            user: session ? { id: session.userId, email: session.email } : null,
          },
        };
      },
      async signOut() {
        await clearSession();
      },
    },
  };
}

export type { DbClient };
