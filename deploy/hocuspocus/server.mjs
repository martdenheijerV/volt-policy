/**
 * HocusPocus Yjs sync server for Volt Policy real-time collaboration.
 * Persists each document's Y.Doc state to Postgres so reloads keep history.
 *
 * Document name pattern: `doc:<documentId>`.
 *
 * Auth: every client sends a short-lived JWT (HS256, signed with
 * HOCUS_SECRET) issued by the Next.js app. The token's `documentId`
 * claim must match the room name; otherwise the connection is rejected.
 * The verified `userId` is stored on the connection context so future
 * extensions (per-user write permissions, audit) can read it.
 */
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { jwtVerify } from "jose";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
  create table if not exists yjs_documents (
    name text primary key,
    state bytea not null,
    updated_at timestamptz not null default now()
  );
`);

const HOCUS_SECRET = process.env.HOCUS_SECRET;
if (!HOCUS_SECRET) {
  throw new Error("HOCUS_SECRET is required");
}
const SECRET_KEY = new TextEncoder().encode(HOCUS_SECRET);

const server = Server.configure({
  port: 1234,
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const r = await pool.query(
          "select state from yjs_documents where name = $1",
          [documentName]
        );
        return r.rows[0]?.state ?? null;
      },
      store: async ({ documentName, state }) => {
        await pool.query(
          `insert into yjs_documents (name, state) values ($1, $2)
           on conflict (name) do update set state = excluded.state, updated_at = now()`,
          [documentName, state]
        );
      },
    }),
  ],
  /**
   * Hocuspocus calls this once per connecting client. We verify the JWT,
   * confirm the documentId claim matches the requested room, and stash
   * the user id on the connection context.
   */
  async onAuthenticate({ token, documentName }) {
    if (!token) throw new Error("missing token");
    let payload;
    try {
      const verified = await jwtVerify(token, SECRET_KEY, {
        issuer: "volt-policy",
        audience: "hocuspocus",
      });
      payload = verified.payload;
    } catch (e) {
      throw new Error(`invalid token: ${e.message}`);
    }
    if (typeof payload.userId !== "string" || typeof payload.documentId !== "string") {
      throw new Error("token missing claims");
    }
    // Room name is `doc:<documentId>` — make sure the token can't be
    // replayed against a different document.
    const expected = `doc:${payload.documentId}`;
    if (documentName !== expected) {
      throw new Error("token / room mismatch");
    }
    return { userId: payload.userId };
  },
});

server.listen();
console.log("HocusPocus listening on :1234");
