import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
}

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  close(): Promise<void>;
}

export interface CreateClientOptions {
  databaseUrl?: string;
  dataDir?: string;
}

export async function createSqlClient(opts: CreateClientOptions = {}): Promise<SqlClient> {
  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;

  if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    return {
      query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
        const result = await pool.query(sql, params);
        return { rows: result.rows as T[] };
      },
      close: () => pool.end()
    };
  }

  const dataDir = opts.dataDir ?? process.env.PGLITE_DATA_DIR ?? resolve(process.cwd(), ".local", "pglite");
  await mkdir(dirname(dataDir), { recursive: true });
  const db = new PGlite(dataDir);

  return {
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      if (!params || params.length === 0) {
        const trimmed = sql.trim();
        if (trimmed.includes(";") || /^(BEGIN|COMMIT|ROLLBACK)$/i.test(trimmed)) {
          await db.exec(sql);
          return { rows: [] };
        }
      }

      const result = await db.query(sql, params);
      return { rows: result.rows as T[] };
    },
    close: () => db.close()
  };
}
