import { Pool } from "pg";

import { env } from "./env";

const poolConfig = {
  connectionString: env.databaseUrl,
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
