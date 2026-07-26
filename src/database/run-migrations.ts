import { readdir, readFile } from "fs/promises";
import path from "path";

import { databasePool } from "../config/database";

const migrationsDirectory = path.join(process.cwd(), "src", "database", "migrations");

const ensureMigrationsTable = async (): Promise<void> => {
  await databasePool.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
};

const getAppliedVersions = async (): Promise<Set<string>> => {
  const result = await databasePool.query(`
    select version
    from public.schema_migrations
  `);

  return new Set(
    result.rows.map((row: unknown) => String((row as { version: string }).version))
  );
};

const getMigrationFiles = async (): Promise<string[]> => {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
};

const run = async (): Promise<void> => {
  await ensureMigrationsTable();

  const appliedVersions = await getAppliedVersions();
  const migrationFiles = await getMigrationFiles();

  for (const migrationFile of migrationFiles) {
    if (appliedVersions.has(migrationFile)) {
      console.info(`Skipping ${migrationFile} (already applied)`);
      continue;
    }

    const migrationPath = path.join(migrationsDirectory, migrationFile);
    const sql = await readFile(migrationPath, "utf8");
    const client = await databasePool.connect();

    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        `
          insert into public.schema_migrations (version)
          values ($1)
        `,
        [migrationFile]
      );
      await client.query("commit");
      console.info(`Applied ${migrationFile}`);
    } catch (error) {
      await client.query("rollback");
      console.error(`Failed ${migrationFile}`);
      throw error;
    } finally {
      client.release();
    }
  }
};

run()
  .then(async () => {
    console.info("Migration run complete.");
    await databasePool.end();
  })
  .catch(async (error) => {
    console.error("Migration run failed.", error);
    await databasePool.end();
    process.exitCode = 1;
  });
