/**
 * HocusPocus Yjs sync server for Volt Policy real-time collaboration.
 * Persists each document's Y.Doc state to Postgres so reloads keep history.
 *
 * Document name pattern: `doc:<documentId>`.
 */
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
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
  async onAuthenticate({ token }) {
    if (!token || token !== process.env.HOCUS_SECRET) {
      throw new Error("unauthorized");
    }
  },
});

server.listen();
console.log("HocusPocus listening on :1234");
