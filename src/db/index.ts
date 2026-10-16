import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Keep route collection/builds deterministic when deployment secrets are injected later.
// A real DATABASE_URL is still required for runtime database operations.
const databaseUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/visa_hobe";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
