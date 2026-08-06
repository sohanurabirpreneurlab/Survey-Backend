import { Pool } from "pg";

import { env } from "./env";

const poolConfig = {
  allowExitOnIdle: true,
  connectionTimeoutMillis: 10_000,
  connectionString: env.databaseUrl,
  // A Vercel deployment can run many warm function instances. Keep each
  // instance to one database client so Supabase's session-pool limit is not
  // exhausted by several independent node-postgres pools.
  idleTimeoutMillis: 10_000,
  max: env.nodeEnv === "production" ? 1 : 10,
  // Supabase pooler connections should use SSL in production-style environments.
  ssl: env.nodeEnv === "production" ? { rejectUnauthorized: false } : { rejectUnauthorized: false }
};

export const databasePool = new Pool(poolConfig);

export const testDatabaseConnection = async (): Promise<void> => {
  const client = await databasePool.connect();

  try {
    await client.query("select 1");
  } finally {
    client.release();
  }
};
