import { Pool } from "pg";

import { env } from "./env";

const poolConfig = {
  allowExitOnIdle: true,
  connectionTimeoutMillis: env.databaseConnectionTimeoutMs,
  connectionString: env.databaseUrl,
  // A Vercel deployment can run many warm function instances. Keep each
  // instance to one database client so Supabase's session-pool limit is not
  // exhausted by several independent node-postgres pools.
  idleTimeoutMillis: env.databaseIdleTimeoutMs,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  max: env.nodeEnv === "production" ? 1 : 10,
  // Supabase pooler connections should use SSL in production-style environments.
  ssl: env.nodeEnv === "production" ? { rejectUnauthorized: false } : { rejectUnauthorized: false }
};

export const databasePool = new Pool(poolConfig);

databasePool.on("error", (error: Error & { code?: string }) => {
  console.error("Unexpected idle database connection error", {
    code: "code" in error ? error.code : undefined,
    message: error.message,
    name: error.name
  });
});

export const testDatabaseConnection = async (): Promise<void> => {
  const client = await databasePool.connect();

  try {
    await client.query("select 1");
  } finally {
    client.release();
  }
};
